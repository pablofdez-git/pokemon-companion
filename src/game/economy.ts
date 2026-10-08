import { StateManager } from '../data/state';

// Ajusta estos valores a tu gusto para equilibrar el juego
export const MIN_CHARS_TO_REWARD = 20; // por debajo de esto, no hay moneda
export const CHARS_PER_COIN = 20;      // cuántos caracteres valen 1 moneda
export const MAX_COINS_PER_SAVE = 10;  // tope por guardado (evita pegar texto enorme)

export function coinsForChanges(changedChars: number): number {
  if (changedChars < MIN_CHARS_TO_REWARD) {
    return 0;
  }
  return Math.min(
    Math.floor(changedChars / CHARS_PER_COIN),
    MAX_COINS_PER_SAVE
  );
}

export async function rewardForSave(
  state: StateManager,
  changedChars: number
): Promise<number> {
  const coins = coinsForChanges(changedChars);
  if (coins > 0) {
    await state.update((s) => {
      s.coins += coins;
    });
  }
  return coins;
}
