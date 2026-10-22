export interface Generation {
  number: number;
  name: string;
  firstId: number;
  lastId: number;
}

export const GENERATIONS: Generation[] = [
  { number: 1, name: 'Kanto', firstId: 1, lastId: 151 },
  { number: 2, name: 'Johto', firstId: 152, lastId: 251 },
  { number: 3, name: 'Hoenn', firstId: 252, lastId: 386 },
  { number: 4, name: 'Sinnoh', firstId: 387, lastId: 493 },
  { number: 5, name: 'Teselia', firstId: 494, lastId: 649 },
  { number: 6, name: 'Kalos', firstId: 650, lastId: 721 },
  { number: 7, name: 'Alola', firstId: 722, lastId: 809 },
  { number: 8, name: 'Galar', firstId: 810, lastId: 905 },
  { number: 9, name: 'Paldea', firstId: 906, lastId: 1025 },
];

// Parte de los Pokémon disponibles (distintos) que hay que capturar para desbloquear la siguiente
export const UNLOCK_FRACTION = 0.25; // 25% de los disponibles

// Número de Pokédex más alto que puede aparecer con esas generaciones desbloqueadas
export function maxPokemonId(unlocked: number): number {
  const index = Math.min(Math.max(unlocked, 1), GENERATIONS.length) - 1;
  return GENERATIONS[index].lastId;
}

// Pokémon distintos necesarios para desbloquear la siguiente; null si ya están todas
export function requiredToUnlockNext(unlocked: number): number | null {
  if (unlocked >= GENERATIONS.length) {
    return null;
  }
  return Math.ceil(maxPokemonId(unlocked) * UNLOCK_FRACTION);
}

export interface GenerationProgress {
  unlocked: number;
  distinct: number;          // especies distintas capturadas
  required: number | null;   // null = todas desbloqueadas
  remaining: number | null;  // cuántas faltan para la siguiente
  next: Generation | null;
}

export function generationProgress(
  unlocked: number,
  capturedIds: number[]
): GenerationProgress {
  const distinct = new Set(capturedIds).size;
  const required = requiredToUnlockNext(unlocked);
  const next = GENERATIONS.find((g) => g.number === unlocked + 1) ?? null;

  return {
    unlocked,
    distinct,
    required,
    remaining: required === null ? null : Math.max(0, required - distinct),
    next,
  };
}

// Generaciones desbloqueadas tras contar las capturas (puede subir más de una)
export function unlockedAfterCaptures(
  unlocked: number,
  capturedIds: number[]
): number {
  const distinct = new Set(capturedIds).size;
  let current = unlocked;
  let required = requiredToUnlockNext(current);

  while (required !== null && distinct >= required) {
    current += 1;
    required = requiredToUnlockNext(current);
  }
  return current;
}
