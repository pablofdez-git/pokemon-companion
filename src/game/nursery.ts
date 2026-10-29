import { GameState, Nursery, StateManager } from '../data/state';
import { PokemonData } from '../data/pokeapi';
import { TIER_CAPTURE_RATES, Tier } from './achievements';
import { rollShiny } from './encounter';
import { perkValue } from './favorite';
import { GENERATIONS, Generation, maxPokemonId, unlockedAfterCaptures } from './generations';

// Ajusta estos valores a tu gusto
export const DITTO_ID = 132;
// Guardados con monedas hasta que eclosiona el huevo; cuanto más raros los padres, más tarda
export const NURSERY_SAVES: Record<Tier, number> = { 1: 50, 2: 80, 3: 150, 4: 300 };
export const HATCH_BATCH = 8;   // especies que se consultan a la vez al buscar la cría
export const HATCH_ROUNDS = 10; // tandas antes de conformarse con repetir la especie de los padres

export function savesNeeded(nursery: Nursery): number {
  return NURSERY_SAVES[nursery.tier];
}

export function isReady(nursery: Nursery): boolean {
  return nursery.saves >= savesNeeded(nursery);
}

export function inTier(captureRate: number, tier: Tier): boolean {
  const [min, max] = TIER_CAPTURE_RATES[tier];
  return captureRate >= min && captureRate <= max;
}

// --- Qué copias están ocupadas ---

export function normalCopies(state: GameState, id: number): number {
  return state.captured.filter((c) => c.id === id && !c.shiny).length;
}

// Copias normales de esa especie que están en la guardería (no se pueden vender ni evolucionar)
export function reservedCopies(state: GameState, id: number): number {
  const nursery = state.nursery;
  if (!nursery) {
    return 0;
  }
  return (nursery.a === id ? 1 : 0) + (nursery.b === id ? 1 : 0);
}

// "Pidgey + Pidgey" o "Rattata + Ditto"
export function parentNames(state: GameState, nursery: Nursery): string {
  const name = (id: number) => state.captured.find((c) => c.id === id)?.name ?? `#${id}`;
  return `${name(nursery.a)} + ${name(nursery.b)}`;
}

// --- Elegir la pareja ---

export interface Pair {
  a: number; // la especie (nunca Ditto)
  b: number; // la misma especie, o Ditto
}

// Parejas posibles: dos repetidos de la misma especie, o cualquier Pokémon con un Ditto
export function eligiblePairs(state: GameState): Pair[] {
  if (state.nursery) {
    return [];
  }
  const species = [...new Set(state.captured.filter((c) => !c.shiny).map((c) => c.id))].sort(
    (x, y) => x - y
  );
  const pairs: Pair[] = [];
  const hasDitto = normalCopies(state, DITTO_ID) >= 1;
  for (const id of species) {
    if (id === DITTO_ID) {
      continue; // Ditto con Ditto no vale
    }
    if (normalCopies(state, id) >= 2) {
      pairs.push({ a: id, b: id });
    }
    if (hasDitto) {
      pairs.push({ a: id, b: DITTO_ID });
    }
  }
  return pairs;
}

// La categoría (común…legendario) de unos padres la marca su especie, no el Ditto
export function tierForCaptureRate(captureRate: number): Tier {
  const tiers: Tier[] = [1, 2, 3, 4];
  return tiers.find((tier) => inTier(captureRate, tier)) ?? 1;
}

export type DepositResult = { ok: true } | { ok: false; reason: string };

export async function depositPair(
  state: StateManager,
  pair: Pair,
  tier: Tier
): Promise<DepositResult> {
  let result: DepositResult = { ok: false, reason: 'Esa pareja no se puede dejar en la guardería.' };
  await state.update((s) => {
    if (s.nursery) {
      result = { ok: false, reason: 'La guardería ya está ocupada.' };
      return;
    }
    if (!eligiblePairs(s).some((p) => p.a === pair.a && p.b === pair.b)) {
      return;
    }
    s.nursery = { a: pair.a, b: pair.b, tier, saves: 0 };
    result = { ok: true };
  });
  return result;
}

// Sacar a los Pokémon antes de tiempo: se pierde el huevo
export async function takeBack(state: StateManager): Promise<void> {
  if (!state.get().nursery) {
    return;
  }
  await state.update((s) => {
    delete s.nursery;
  });
}

export type NurseryStatus = 'none' | 'growing' | 'ready';

// Un guardado con monedas más para el huevo; dice si ya está listo
export async function advanceNursery(state: StateManager): Promise<NurseryStatus> {
  const current = state.get().nursery;
  if (!current) {
    return 'none';
  }
  if (isReady(current)) {
    return 'ready'; // espera a poder eclosionar (por ejemplo, sin conexión): no hace falta tocar nada
  }
  let status: NurseryStatus = 'growing';
  await state.update((s) => {
    const nursery = s.nursery;
    if (!nursery) {
      return;
    }
    nursery.saves += 1;
    status = isReady(nursery) ? 'ready' : 'growing';
  });
  return status;
}

// --- La cría ---

function shuffled<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Busca entre las especies que no tienes (en orden aleatorio) una de la misma categoría.
// Devuelve null si no encuentra ninguna; lanza error si no se pudo consultar ninguna (sin conexión).
export async function pickHatchling(
  tier: Tier,
  candidates: number[],
  fetchPokemon: (id: number) => Promise<PokemonData>,
  random: () => number = Math.random
): Promise<PokemonData | null> {
  const queue = shuffled(candidates, random).slice(0, HATCH_BATCH * HATCH_ROUNDS);
  let anyLoaded = false;

  for (let start = 0; start < queue.length; start += HATCH_BATCH) {
    const batch = queue.slice(start, start + HATCH_BATCH);
    const results = await Promise.allSettled(batch.map((id) => fetchPokemon(id)));
    for (const result of results) {
      if (result.status !== 'fulfilled') {
        continue;
      }
      anyLoaded = true;
      if (inTier(result.value.captureRate, tier)) {
        return result.value;
      }
    }
  }

  if (queue.length > 0 && !anyLoaded) {
    throw new Error('No se pudo consultar ninguna especie');
  }
  return null;
}

export type HatchResult =
  | {
      ok: true;
      pokemon: PokemonData;
      shiny: boolean;
      isNew: boolean; // false si no quedaban especies nuevas de su categoría y repite la de los padres
      newGenerations: Generation[];
    }
  | { ok: false; reason: string; offline?: boolean };

// Hace eclosionar el huevo (si está listo): un Pokémon que no tienes de la categoría de los padres
export async function hatchEgg(
  state: StateManager,
  fetchPokemon: (id: number) => Promise<PokemonData>,
  random: () => number = Math.random
): Promise<HatchResult> {
  const game = state.get();
  const nursery = game.nursery;
  if (!nursery || !isReady(nursery)) {
    return { ok: false, reason: 'No hay ningún huevo listo.' };
  }

  const owned = new Set(game.captured.map((c) => c.id));
  const maxId = maxPokemonId(game.generationsUnlocked);
  const candidates: number[] = [];
  for (let id = 1; id <= maxId; id += 1) {
    if (!owned.has(id)) {
      candidates.push(id);
    }
  }

  const offline: HatchResult = {
    ok: false,
    reason: 'El huevo está listo, pero hace falta conexión con la PokéAPI para ver qué nace.',
    offline: true,
  };

  let pokemon: PokemonData | null;
  try {
    pokemon = await pickHatchling(nursery.tier, candidates, fetchPokemon, random);
  } catch {
    return offline;
  }
  const isNew = pokemon !== null;
  if (!pokemon) {
    try {
      pokemon = await fetchPokemon(nursery.a);
    } catch {
      return offline;
    }
  }

  const shiny = rollShiny(Boolean(pokemon.shinySpriteUrl), perkValue(game, 'shiny'), random);
  const hatched = pokemon;
  let result: HatchResult = { ok: false, reason: 'El huevo ya no está.' };

  await state.update((s) => {
    if (!s.nursery) {
      return;
    }
    s.captured.push({
      id: hatched.id,
      name: hatched.name,
      spriteUrl: shiny ? hatched.shinySpriteUrl ?? hatched.spriteUrl : hatched.spriteUrl,
      captureRate: hatched.captureRate,
      types: hatched.types,
      capturedAt: Date.now(),
      ...(shiny ? { shiny: true } : {}),
    });
    s.stats.eggs += 1;
    delete s.nursery;

    const before = s.generationsUnlocked;
    const after = unlockedAfterCaptures(
      before,
      s.captured.map((c) => c.id)
    );
    s.generationsUnlocked = after;
    result = {
      ok: true,
      pokemon: hatched,
      shiny,
      isNew,
      newGenerations: GENERATIONS.filter((g) => g.number > before && g.number <= after),
    };
  });

  return result;
}
