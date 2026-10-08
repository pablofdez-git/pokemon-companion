import { StateManager } from '../data/state';
import { PokemonData } from '../data/pokeapi';

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

// --- Monedas por capturar y por vender ---
export const MIN_CAPTURE_REWARD = 5;         // recompensa por el Pokémon más fácil
export const MAX_EXTRA_CAPTURE_REWARD = 25;  // extra por el más difícil (5 + 25 = 30)
export const SELL_PRICE_FACTOR = 0.6;        // vender paga el 60% de la recompensa
const DEFAULT_CAPTURE_RATE = 120;            // para capturas antiguas sin dato

export function captureReward(captureRate: number): number {
  const difficulty = (255 - captureRate) / 255; // 0 = muy fácil, ~1 = muy difícil
  return MIN_CAPTURE_REWARD + Math.round(difficulty * MAX_EXTRA_CAPTURE_REWARD);
}

export function sellPrice(captureRate: number = DEFAULT_CAPTURE_RATE): number {
  return Math.max(1, Math.round(captureReward(captureRate) * SELL_PRICE_FACTOR));
}

// Registra la captura y paga la recompensa en una sola actualización
export async function rewardForCapture(
  state: StateManager,
  pokemon: PokemonData
): Promise<number> {
  const coins = captureReward(pokemon.captureRate);
  await state.update((s) => {
    s.captured.push({
      id: pokemon.id,
      name: pokemon.name,
      spriteUrl: pokemon.spriteUrl,
      captureRate: pokemon.captureRate,
    });
    s.coins += coins;
  });
  return coins;
}
