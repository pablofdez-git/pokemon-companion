import * as vscode from 'vscode';
import { StateManager } from '../data/state';
import { PokemonData } from '../data/pokeapi';
import { BALLS, BallType } from '../game/items';
import { catchProbability, pokemonFlees, tryCatch } from '../game/encounter';

const ENCOUNTER_TIMEOUT_MS = 45_000;
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

export async function runEncounter(
  state: StateManager,
  pokemon: PokemonData
): Promise<'captured' | 'fled'> {
  let message = `¡Ha aparecido un ${pokemon.name} salvaje!`;

  while (true) {
    const owned = state.get().balls;
    const labelToBall = new Map<string, BallType>();
    for (const ball of BALLS) {
      const count = owned[ball.id] ?? 0;
      if (count > 0) {
        labelToBall.set(`${ball.name} (x${count})`, ball);
      }
    }

    if (labelToBall.size === 0) {
      vscode.window.showWarningMessage(
        `${pokemon.name} se ha ido: no te quedan Poké Balls.`
      );
      return 'fled';
    }

    const choice = await askWithTimeout(message, [
      ...labelToBall.keys(),
      FLEE_LABEL,
    ]);
    const ball = choice ? labelToBall.get(choice) : undefined;

    // Pulsó "Huir", cerró la notificación o se acabó el tiempo
    if (!ball) {
      vscode.window.setStatusBarMessage(`${pokemon.name} se ha escapado`, 4000);
      return 'fled';
    }

    await state.update((s) => {
      s.balls[ball.id] -= 1;
    });

    const probability = catchProbability(pokemon.captureRate, ball);
    if (tryCatch(probability)) {
      await state.update((s) => {
        s.captured.push(pokemon.id);
      });
      vscode.window.showInformationMessage(`¡Has capturado a ${pokemon.name}!`);
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
