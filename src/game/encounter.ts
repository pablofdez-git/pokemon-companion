import { BallType, CatchContext } from './items';

// Ajusta estos valores a tu gusto
export const ENCOUNTER_CHANCE = 0.25;              // 15% por guardado con recompensa   0.15
export const ENCOUNTER_COOLDOWN_MS = 60 * 1000; // mínimo 2 min entre encuentros
export const FLEE_CHANCE_AFTER_FAIL = 0.3;         // 30% de huir tras un fallo
export const MAX_POKEMON_ID = 151;                 // solo primera generación 151

export function rollEncounter(): boolean {
  return Math.random() < ENCOUNTER_CHANCE;
}

export function randomPokemonId(): number {
  return Math.floor(Math.random() * MAX_POKEMON_ID) + 1;
}

export function catchProbability(
  captureRate: number,
  ball: BallType,
  ctx: CatchContext
): number {
  return Math.min(1, (captureRate / 255) * ball.multiplier(ctx));
}

export function tryCatch(probability: number): boolean {
  return Math.random() < probability;
}

export function pokemonFlees(): boolean {
  return Math.random() < FLEE_CHANCE_AFTER_FAIL;
}

// Evita encuentros simultáneos y controla el cooldown
export class EncounterGate {
  private active = false;
  private lastEnd = 0;

  canStart(ignoreCooldown = false): boolean {
    if (this.active) {
      return false;
    }
    return ignoreCooldown || Date.now() - this.lastEnd >= ENCOUNTER_COOLDOWN_MS;
  }

  start(): void {
    this.active = true;
  }

  end(): void {
    this.active = false;
    this.lastEnd = Date.now();
  }
}
