import * as vscode from 'vscode';
import { StateManager } from '../data/state';
import { PokemonData } from '../data/pokeapi';
import { rewardForCapture } from '../game/economy';
import {
  CAPTURE_SHAKES,
  catchProbability,
  failedShakes,
  pokemonFlees,
  tryCatch,
} from '../game/encounter';
import { Generation } from '../game/generations';
import {
  BALLS,
  CatchContext,
  ballSpriteUrl,
  describeMultiplier,
} from '../game/items';
import { BallOption, EncounterPanel, PokemonView } from './encounterPanel';

const ENCOUNTER_TIMEOUT_MS = 45_000;

// Si es variocolor se usan sus sprites; si no, los normales
function toView(pokemon: PokemonData, shiny: boolean): PokemonView {
  return {
    id: pokemon.id,
    name: pokemon.name,
    spriteUrl: shiny ? pokemon.shinySpriteUrl : pokemon.spriteUrl,
    animatedSpriteUrl: shiny
      ? pokemon.animatedShinySpriteUrl
      : pokemon.animatedSpriteUrl,
    shiny,
  };
}

// Las balls que tienes, con su efecto y su probabilidad en este lanzamiento
function buildOptions(
  state: StateManager,
  pokemon: PokemonData,
  ctx: CatchContext
): BallOption[] {
  const owned = state.get().balls;
  const options: BallOption[] = [];

  for (const ball of BALLS) {
    const count = owned[ball.id] ?? 0;
    if (count === 0) {
      continue;
    }
    options.push({
      id: ball.id,
      name: ball.name,
      count,
      multiplier: describeMultiplier(ball.multiplier(ctx)),
      probability: Math.round(
        catchProbability(pokemon.captureRate, ball, ctx) * 100
      ),
      spriteUrl: ballSpriteUrl(ball),
    });
  }
  return options;
}

// El desbloqueo de una generación es un hito: se sigue avisando con una notificación
export function announceUnlocks(generations: Generation[]): void {
  for (const generation of generations) {
    void vscode.window
      .showInformationMessage(
        `¡Has desbloqueado la generación ${generation.number} (${generation.name})! Ya pueden aparecer Pokémon del #${generation.firstId} al #${generation.lastId}.`,
        'Ver mochila'
      )
      .then((choice) => {
        if (choice === 'Ver mochila') {
          void vscode.commands.executeCommand('pokemonCompanion.backpack.focus');
        }
      });
  }
}

export interface EncounterOptions {
  rewardFor?: string; // nombre del logro: es un encuentro de recompensa (no huye tras un fallo)
}

// Juega un encuentro completo y lo apunta en las estadísticas
export async function runEncounter(
  state: StateManager,
  panel: EncounterPanel,
  pokemon: PokemonData,
  shiny: boolean,
  options: EncounterOptions = {}
): Promise<'captured' | 'fled'> {
  await state.update((s) => {
    s.stats.encounters += 1;
  });
  const outcome = await playEncounter(state, panel, pokemon, shiny, options);
  if (outcome === 'fled') {
    await state.update((s) => {
      s.stats.fled += 1;
    });
  }
  return outcome;
}

async function playEncounter(
  state: StateManager,
  panel: EncounterPanel,
  pokemon: PokemonData,
  shiny: boolean,
  options: EncounterOptions
): Promise<'captured' | 'fled'> {
  const view = toView(pokemon, shiny);
  const label = shiny ? `${pokemon.name} variocolor` : pokemon.name;
  let message = options.rewardFor
    ? `Recompensa por «${options.rewardFor}»: ¡ha aparecido un ${label}!`
    : `¡Ha aparecido un ${label} salvaje!`;
  let throwNumber = 1;

  // Aviso discreto por si el panel no está a la vista
  vscode.window.setStatusBarMessage(shiny ? `★ ${message}` : message, 6000);
  await panel.reveal();

  while (true) {
    const owned = state.get().balls;
    if (!BALLS.some((ball) => (owned[ball.id] ?? 0) > 0)) {
      panel.showEnd(view, 'fled', `${label} se ha ido: no te quedan Pokéballs.`);
      return 'fled';
    }

    const ctx: CatchContext = {
      throwNumber,
      alreadyOwned: state.get().captured.some((c) => c.id === pokemon.id),
      hour: new Date().getHours(),
    };

    const choice = await panel.ask(
      view,
      message,
      buildOptions(state, pokemon, ctx),
      ENCOUNTER_TIMEOUT_MS
    );

    if (choice.kind === 'flee') {
      panel.showEnd(view, 'fled', `Has huido de ${label}.`);
      return 'fled';
    }
    if (choice.kind === 'timeout') {
      panel.showEnd(view, 'fled', `${label} se ha cansado de esperar y se ha ido.`);
      return 'fled';
    }

    const ball = BALLS.find((b) => b.id === choice.ballId);
    if (!ball || (state.get().balls[ball.id] ?? 0) <= 0) {
      continue; // ball desconocida o agotada: vuelve a preguntar
    }

    await state.update((s) => {
      s.balls[ball.id] -= 1;
      s.stats.throws += 1;
    });
    throwNumber += 1;

    const probability = catchProbability(pokemon.captureRate, ball, ctx);
    const caught = tryCatch(probability);
    await panel.playThrow(
      ballSpriteUrl(ball),
      caught ? CAPTURE_SHAKES : failedShakes(probability),
      caught
    );

    if (caught) {
      const { coins, newGenerations } = await rewardForCapture(
        state,
        pokemon,
        shiny
      );
      panel.showEnd(view, 'captured', `¡Has capturado a ${label}! +${coins} 🪙`);
      announceUnlocks(newGenerations);
      return 'captured';
    }

    // Una recompensa no se escapa: solo se pierde si la dejas (y entonces sigue pendiente)
    if (!options.rewardFor && pokemonFlees()) {
      panel.showEnd(
        view,
        'fled',
        `¡${label} ha roto la ${ball.name} y ha huido!`
      );
      return 'fled';
    }

    message = `¡${label} ha salido de la ${ball.name}! Sigue ahí…`;
  }
}
