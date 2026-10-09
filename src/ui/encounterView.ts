import * as vscode from 'vscode';
import { StateManager } from '../data/state';
import { PokemonData } from '../data/pokeapi';
import { rewardForCapture } from '../game/economy';
import { catchProbability, pokemonFlees, tryCatch } from '../game/encounter';
import {
  BALLS,
  BallType,
  CatchContext,
  ballSpriteUrl,
  describeMultiplier,
} from '../game/items';

const ENCOUNTER_TIMEOUT_MS = 45_000;
const THROW_LABEL = 'Lanzar Pokéball';
const FLEE_LABEL = 'Huir';

// Muestra una notificación con botones; si no respondes a tiempo, devuelve undefined
function askWithTimeout(
  message: string,
  options: string[]
): Promise<string | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ENCOUNTER_TIMEOUT_MS);
    vscode.window.showInformationMessage(message, ...options).then((choice) => {
      clearTimeout(timer);
      resolve(choice);
    });
  });
}

interface BallPick extends vscode.QuickPickItem {
  ball: BallType;
}

// Lista con tus balls, su efecto en este lanzamiento y la probabilidad estimada
async function pickBall(
  state: StateManager,
  pokemon: PokemonData,
  ctx: CatchContext
): Promise<BallType | undefined> {
  const owned = state.get().balls;
  const items: BallPick[] = [];

  for (const ball of BALLS) {
    const count = owned[ball.id] ?? 0;
    if (count === 0) {
      continue;
    }
    const probability = catchProbability(pokemon.captureRate, ball, ctx);
    items.push({
      label: ball.name,
      description: `x${count} · ${describeMultiplier(ball.multiplier(ctx))}`,
      detail: `Probabilidad de captura: ${Math.round(probability * 100)}%`,
      iconPath: vscode.Uri.parse(ballSpriteUrl(ball)),
      ball,
    });
  }

  // Si dejas la lista abierta, se cierra sola pasado el tiempo
  const timeout = new vscode.CancellationTokenSource();
  const timer = setTimeout(() => timeout.cancel(), ENCOUNTER_TIMEOUT_MS);
  try {
    const pick = await vscode.window.showQuickPick(
      items,
      {
        title: `${pokemon.name} salvaje · Elige una ball`,
        placeHolder: `Lanzamiento nº ${ctx.throwNumber}`,
      },
      timeout.token
    );
    return pick?.ball;
  } finally {
    clearTimeout(timer);
    timeout.dispose();
  }
}

export async function runEncounter(
  state: StateManager,
  pokemon: PokemonData
): Promise<'captured' | 'fled'> {
  let message = `¡Ha aparecido un ${pokemon.name} salvaje!`;
  let throwNumber = 1;

  while (true) {
    const owned = state.get().balls;
    if (!BALLS.some((ball) => (owned[ball.id] ?? 0) > 0)) {
      vscode.window.showWarningMessage(
        `${pokemon.name} se ha ido: no te quedan Pokéballs.`
      );
      return 'fled';
    }

    const action = await askWithTimeout(message, [THROW_LABEL, FLEE_LABEL]);

    // Pulsó "Huir", cerró la notificación o se acabó el tiempo
    if (action !== THROW_LABEL) {
      vscode.window.setStatusBarMessage(`${pokemon.name} se ha escapado`, 4000);
      return 'fled';
    }

    const ctx: CatchContext = {
      throwNumber,
      alreadyOwned: state.get().captured.some((c) => c.id === pokemon.id),
      hour: new Date().getHours(),
    };

    const ball = await pickBall(state, pokemon, ctx);
    if (!ball) {
      continue; // cerró la lista sin elegir: vuelve al aviso
    }

    await state.update((s) => {
      s.balls[ball.id] -= 1;
    });
    throwNumber += 1;

    if (tryCatch(catchProbability(pokemon.captureRate, ball, ctx))) {
      const { coins, newGenerations } = await rewardForCapture(state, pokemon);
      vscode.window.showInformationMessage(
        `¡Has capturado a ${pokemon.name}! +${coins} 🪙`
      );

      for (const generation of newGenerations) {
        void vscode.window
          .showInformationMessage(
            `🎉 ¡Has desbloqueado la generación ${generation.number} (${generation.name})! Ya pueden aparecer Pokémon del #${generation.firstId} al #${generation.lastId}.`,
            'Ver mochila'
          )
          .then((choice) => {
            if (choice === 'Ver mochila') {
              void vscode.commands.executeCommand(
                'pokemonCompanion.backpack.focus'
              );
            }
          });
      }
      return 'captured';
    }

    if (pokemonFlees()) {
      vscode.window.showWarningMessage(
        `¡${pokemon.name} ha roto la ${ball.name} y ha huido!`
      );
      return 'fled';
    }

    message = `¡${pokemon.name} ha salido de la ${ball.name}! Sigue ahí...`;
  }
}
