import { StateManager } from '../data/state';
import { PokemonData } from '../data/pokeapi';
import { GENERATIONS, Generation, unlockedAfterCaptures } from './generations';
export const SHINY_BONUS_COINS = 50; // premio extra por capturar un variocolor

// Ajusta estos valores a tu gusto para equilibrar el juego
export const MIN_CHARS_TO_REWARD = 20; // por debajo de esto, no hay moneda
export const CHARS_PER_COIN = 20;      // cuántos caracteres valen 1 moneda

export function coinsForChanges(changedChars: number): number {
  if (changedChars < MIN_CHARS_TO_REWARD) {
    return 0;
  }
  return Math.floor(changedChars / CHARS_PER_COIN);
}

// Registra la captura, paga la recompensa y comprueba si desbloquea una generación
export async function rewardForCapture(
  state: StateManager,
  pokemon: PokemonData,
  shiny: boolean
): Promise<CaptureResult> {
  const coins =
    captureReward(pokemon.captureRate) + (shiny ? SHINY_BONUS_COINS : 0);
  let newGenerations: Generation[] = [];

  await state.update((s) => {
    s.captured.push({
      id: pokemon.id,
      name: pokemon.name,
      spriteUrl: shiny ? pokemon.shinySpriteUrl : pokemon.spriteUrl,
      captureRate: pokemon.captureRate,
      ...(shiny ? { shiny: true } : {}),
    });
    s.coins += coins;

    const before = s.generationsUnlocked;
    const after = unlockedAfterCaptures(
      before,
      s.captured.map((c) => c.id)
    );
    s.generationsUnlocked = after;
    newGenerations = GENERATIONS.filter(
      (g) => g.number > before && g.number <= after
    );
  });

  return { coins, newGenerations };
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

export interface CaptureResult {
  coins: number;
  newGenerations: Generation[]; // generaciones que ha desbloqueado esta captura
}

// Registra la captura, paga la recompensa y comprueba si desbloquea una generación
export async function rewardForCapture(
  state: StateManager,
  pokemon: PokemonData
): Promise<CaptureResult> {
  const coins = captureReward(pokemon.captureRate);
  let newGenerations: Generation[] = [];

  await state.update((s) => {
    s.captured.push({
      id: pokemon.id,
      name: pokemon.name,
      spriteUrl: pokemon.spriteUrl,
      captureRate: pokemon.captureRate,
    });
    s.coins += coins;

    const before = s.generationsUnlocked;
    const after = unlockedAfterCaptures(
      before,
      s.captured.map((c) => c.id)
    );
    s.generationsUnlocked = after;
    newGenerations = GENERATIONS.filter(
      (g) => g.number > before && g.number <= after
    );
  });

  return { coins, newGenerations };
}
