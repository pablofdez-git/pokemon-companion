import * as vscode from 'vscode';
import { StateManager } from '../data/state';
import { PokemonData } from '../data/pokeapi';
import { rewardForCapture } from '../game/economy';
import { catchProbability, pokemonFlees, tryCatch } from '../game/encounter';
import { Generation } from '../game/generations';
import {
  BALLS,
  CatchContext,
  ballSpriteUrl,
  describeMultiplier,
} from '../game/items';
import { BallOption, EncounterPanel, PokemonView } from './encounterPanel';

const ENCOUNTER_TIMEOUT_MS = 45_000;

function toView(pokemon: PokemonData): PokemonView {
  return { id: pokemon.id, name: pokemon.name, spriteUrl: pokemon.spriteUrl };
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
function announceUnlocks(generations: Generation[]): void {
  for (const generation of generations) {
    void vscode.window
      .showInformationMessage(
        `🎉 ¡Has desbloqueado la generación ${generation.number} (${generation.name})! Ya pueden aparecer Pokémon del #${generation.firstId} al #${generation.lastId}.`,
        'Ver mochila'
      )
      .then((choice) => {
        if (choice === 'Ver mochila') {
          void vscode.commands.executeCommand('pokemonCompanion.backpack.focus');
        }
      });
  }
}

export async function runEncounter(
  state: StateManager,
  panel: EncounterPanel,
  pokemon: PokemonData
): Promise<'captured' | 'fled'> {
  const view = toView(pokemon);
  let message = `¡Ha aparecido un ${pokemon.name} salvaje!`;
  let throwNumber = 1;

  // Aviso discreto por si el panel no está a la vista
  vscode.window.setStatusBarMessage(message, 6000);
  await panel.reveal();

  while (true) {
    const owned = state.get().balls;
    if (!BALLS.some((ball) => (owned[ball.id] ?? 0) > 0)) {
      panel.showEnd(view, 'fled', `${pokemon.name} se ha ido: no te quedan Pokéballs.`);
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
      panel.showEnd(view, 'fled', `Has huido de ${pokemon.name}.`);
      return 'fled';
    }
    if (choice.kind === 'timeout') {
      panel.showEnd(
        view,
        'fled',
        `${pokemon.name} se ha cansado de esperar y se ha ido.`
      );
      return 'fled';
    }

    const ball = BALLS.find((b) => b.id === choice.ballId);
    if (!ball || (state.get().balls[ball.id] ?? 0) <= 0) {
      continue; // ball desconocida o agotada: vuelve a preguntar
    }

    await state.update((s) => {
      s.balls[ball.id] -= 1;
    });
    throwNumber += 1;

    if (tryCatch(catchProbability(pokemon.captureRate, ball, ctx))) {
      const { coins, newGenerations } = await rewardForCapture(state, pokemon);
      panel.showEnd(view, 'captured', `¡Has capturado a ${pokemon.name}! +${coins} 🪙`);
      announceUnlocks(newGenerations);
      return 'captured';
    }

    if (pokemonFlees()) {
      panel.showEnd(
        view,
        'fled',
        `¡${pokemon.name} ha roto la ${ball.name} y ha huido!`
      );
      return 'fled';
    }

    message = `¡${pokemon.name} ha salido de la ${ball.name}! Sigue ahí…`;
  }
}
