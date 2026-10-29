import { CapturedPokemon, Favorite, GameState, Nursery } from '../data/state';
import { unlockedAfterCaptures } from './generations';
import { GameStats } from './stats';

// Contadores que se pueden sumar: lo ganado en un ordenador se añade a lo del otro
const ADDITIVE_STATS = [
  'coinsEarned',
  'coinsSpent',
  'charsWritten',
  'encounters',
  'captures',
  'fled',
  'throws',
  'evolutions',
  'eggs',
] as const;

// Con la base (la partida en la última sincronización) se suman los cambios de los dos lados.
// Sin base no se sabe qué cambió en cada uno, y se toma lo mayor para no perder nada.
function mergeNumber(base: number | undefined, local: number, remote: number): number {
  if (base === undefined) {
    return Math.max(local, remote);
  }
  return Math.max(0, local + remote - base);
}

// El normal y el variocolor de una especie se cuentan por separado
function captureKey(pokemon: CapturedPokemon): string {
  return `${pokemon.id}:${pokemon.shiny ? 's' : 'n'}`;
}

function countCaptures(captured: CapturedPokemon[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const pokemon of captured) {
    const key = captureKey(pokemon);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

// Junta las capturas nuevas de los dos lados y quita las vendidas en cualquiera de ellos
function mergeCaptured(
  base: CapturedPokemon[] | undefined,
  local: CapturedPokemon[],
  remote: CapturedPokemon[]
): CapturedPokemon[] {
  const examples = new Map<string, CapturedPokemon>();
  // Lo que se sabe de cada especie en cualquiera de las copias: su primera fecha y sus tipos
  const earliest = new Map<string, number>();
  const typesOf = new Map<string, string[]>();
  for (const pokemon of [...(base ?? []), ...local, ...remote]) {
    const key = captureKey(pokemon);
    if (!examples.has(key)) {
      examples.set(key, pokemon);
    }
    if (pokemon.capturedAt !== undefined && pokemon.capturedAt < (earliest.get(key) ?? Infinity)) {
      earliest.set(key, pokemon.capturedAt);
    }
    if (pokemon.types && !typesOf.has(key)) {
      typesOf.set(key, pokemon.types);
    }
  }

  const baseCounts = base ? countCaptures(base) : undefined;
  const localCounts = countCaptures(local);
  const remoteCounts = countCaptures(remote);

  const merged: CapturedPokemon[] = [];
  for (const [key, pokemon] of examples) {
    const count = mergeNumber(
      baseCounts ? baseCounts.get(key) ?? 0 : undefined,
      localCounts.get(key) ?? 0,
      remoteCounts.get(key) ?? 0
    );
    for (let i = 0; i < count; i += 1) {
      const capturedAt = earliest.get(key);
      const types = typesOf.get(key);
      merged.push({
        ...pokemon,
        ...(capturedAt !== undefined ? { capturedAt } : {}),
        ...(types ? { types } : {}),
      });
    }
  }
  return merged;
}

// Balls y objetos: cantidades por id
function mergeCounts(
  base: Record<string, number> | undefined,
  local: Record<string, number>,
  remote: Record<string, number>
): Record<string, number> {
  const ids = new Set([...Object.keys(base ?? {}), ...Object.keys(local), ...Object.keys(remote)]);
  const merged: Record<string, number> = {};
  for (const id of ids) {
    merged[id] = mergeNumber(
      base ? base[id] ?? 0 : undefined,
      local[id] ?? 0,
      remote[id] ?? 0
    );
  }
  return merged;
}

function mergeStats(
  base: GameStats | undefined,
  local: GameStats,
  remote: GameStats
): GameStats {
  // La racha es del calendario, no se suma: el mismo día en dos ordenadores es un solo día
  const latest =
    (remote.lastActiveDay ?? '') > (local.lastActiveDay ?? '') ? remote : local;
  const merged: GameStats = {
    ...latest,
    activeDays: Math.max(local.activeDays, remote.activeDays),
    bestStreak: Math.max(local.bestStreak, remote.bestStreak),
  };
  if (local.lastActiveDay === remote.lastActiveDay) {
    merged.streak = Math.max(local.streak, remote.streak);
  }
  for (const key of ADDITIVE_STATS) {
    merged[key] = mergeNumber(base?.[key], local[key], remote[key]);
  }
  return merged;
}

function sameFavorite(a?: Favorite, b?: Favorite): boolean {
  return a?.id === b?.id && Boolean(a?.shiny) === Boolean(b?.shiny);
}

// Quien lo cambió desde la última sincronización manda; si lo cambiaron los dos, el más reciente
function mergeFavorite(
  base: GameState | undefined,
  local: GameState,
  remote: GameState
): Favorite | undefined {
  if (sameFavorite(local.favorite, remote.favorite)) {
    return local.favorite;
  }
  if (base && sameFavorite(local.favorite, base.favorite)) {
    return remote.favorite;
  }
  if (base && sameFavorite(remote.favorite, base.favorite)) {
    return local.favorite;
  }
  return local.updatedAt >= remote.updatedAt ? local.favorite : remote.favorite;
}

function sameNursery(a?: Nursery, b?: Nursery): boolean {
  return a?.a === b?.a && a?.b === b?.b;
}

// Quien la cambió desde la última sincronización manda (así un huevo que ya eclosionó en un
// ordenador no se queda esperando en el otro). Con la misma pareja en los dos, el que va más avanzado.
function mergeNursery(
  base: GameState | undefined,
  local: GameState,
  remote: GameState
): Nursery | undefined {
  if (sameNursery(local.nursery, remote.nursery)) {
    if (local.nursery && remote.nursery) {
      return local.nursery.saves >= remote.nursery.saves ? local.nursery : remote.nursery;
    }
    return undefined;
  }
  if (base && sameNursery(local.nursery, base.nursery)) {
    return remote.nursery;
  }
  if (base && sameNursery(remote.nursery, base.nursery)) {
    return local.nursery;
  }
  return local.updatedAt >= remote.updatedAt ? local.nursery : remote.nursery;
}

function union(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}

// Combina dos partidas que han cambiado por separado.
// Las tres deben venir normalizadas (normalizeState). updatedAt lo pone quien la guarde.
export function mergeStates(
  base: GameState | undefined,
  local: GameState,
  remote: GameState
): GameState {
  const captured = mergeCaptured(base?.captured, local.captured, remote.captured);
  const favorite = mergeFavorite(base, local, remote);
  const nursery = mergeNursery(base, local, remote);
  return {
    coins: mergeNumber(base?.coins, local.coins, remote.coins),
    balls: mergeCounts(base?.balls, local.balls, remote.balls),
    items: mergeCounts(base?.items, local.items, remote.items),
    incenseUntil: Math.max(local.incenseUntil, remote.incenseUntil),
    captured,
    generationsUnlocked: unlockedAfterCaptures(
      Math.max(local.generationsUnlocked, remote.generationsUnlocked),
      captured.map((c) => c.id)
    ),
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
    stats: mergeStats(base?.stats, local.stats, remote.stats),
    // Un logro conseguido (o su recompensa cobrada) en cualquier ordenador vale para los dos
    achievements: union(local.achievements, remote.achievements),
    achievementsClaimed: union(local.achievementsClaimed, remote.achievementsClaimed),
    ...(favorite ? { favorite } : {}),
    ...(nursery ? { nursery } : {}),
  };
}
