import { BallType, CatchContext } from './items';

// Ajusta estos valores a tu gusto
export const ENCOUNTER_CHANCE = 0.25;           // 25% por guardado con recompensa
export const ENCOUNTER_COOLDOWN_MS = 60 * 1000; // mínimo 1 min entre encuentros
export const FLEE_CHANCE_AFTER_FAIL = 0.3;         // 30% de huir tras un fallo

// Límites de los ajustes del usuario (deben coincidir con package.json)
export const MIN_ENCOUNTER_CHANCE = 0.05;
export const MAX_ENCOUNTER_CHANCE = 1;
export const MIN_COOLDOWN_SECONDS = 10;
export const MAX_COOLDOWN_SECONDS = 3600;

function clamp(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export function clampEncounterChance(value: number): number {
  return clamp(value, MIN_ENCOUNTER_CHANCE, MAX_ENCOUNTER_CHANCE, ENCOUNTER_CHANCE);
}

// Recibe segundos (como el ajuste) y devuelve milisegundos
export function cooldownMsFromSeconds(seconds: number): number {
  return (
    clamp(
      seconds,
      MIN_COOLDOWN_SECONDS,
      MAX_COOLDOWN_SECONDS,
      ENCOUNTER_COOLDOWN_MS / 1000
    ) * 1000
  );
}

export function rollEncounter(chance = ENCOUNTER_CHANCE): boolean {
  return Math.random() < chance;
}

export function randomPokemonId(maxId: number): number {
  return Math.floor(Math.random() * maxId) + 1;
}

export function catchProbability(
  captureRate: number,
  ball: BallType,
  ctx: CatchContext
): number {
  return Math.min(1, (captureRate / 255) * ball.multiplier(ctx) * (ctx.captureBonus ?? 1));
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

  // El cooldown se pide en cada consulta para que un cambio de ajuste valga al momento
  constructor(private readonly cooldownMs: () => number = () => ENCOUNTER_COOLDOWN_MS) {}

  canStart(ignoreCooldown = false): boolean {
    if (this.active) {
      return false;
    }
    return ignoreCooldown || Date.now() - this.lastEnd >= this.cooldownMs();
  }

  start(): void {
    this.active = true;
  }

  end(): void {
    this.active = false;
    this.lastEnd = Date.now();
  }

  // El encuentro no llegó a empezar (por ejemplo, sin conexión): no gasta el cooldown
  cancel(): void {
    this.active = false;
  }
}

// Sacudidas de la ball cuando el Pokémon es capturado
export const CAPTURE_SHAKES = 3;

// Cuántas veces se sacude la ball antes de abrirse si falla (de 0 a 2).
// Cuanto más cerca estaba de capturarlo, más se sacude.
export function failedShakes(probability: number): number {
  return Math.min(2, Math.floor(Math.random() * (1 + probability * 3)));
}

// Probabilidad de que un Pokémon aparezca variocolor (1 entre 50)
export const SHINY_CHANCE = 0.02;

// Solo puede salir variocolor si la API tiene su sprite
export function rollShiny(
  hasShinySprite: boolean,
  chanceMultiplier = 1,
  random: () => number = Math.random
): boolean {
  return hasShinySprite && random() < SHINY_CHANCE * chanceMultiplier;
}
