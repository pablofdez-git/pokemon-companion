import { CapturedPokemon, GameState, StateManager } from '../data/state';

// Ajusta estos valores a tu gusto
export const FAVORITE_COINS_SAVE = 0.05;    // +5 % de monedas al guardar
export const FAVORITE_COINS_CAPTURE = 0.2;  // +20 % de monedas al capturar
export const FAVORITE_ENCOUNTER = 1.15;     // ×1,15 de probabilidad de encuentro
export const FAVORITE_CAPTURE = 1.1;        // ×1,1 de probabilidad de captura
export const FAVORITE_SHINY = 1.5;          // ×1,5 de probabilidad de variocolor
export const FAVORITE_STONE = 2;            // el doble de probabilidad de que un capturado lleve piedra

export type PerkKind = 'coinsSave' | 'coinsCapture' | 'encounter' | 'capture' | 'shiny' | 'stone';

const PERK_VALUES: Record<PerkKind, number> = {
  coinsSave: FAVORITE_COINS_SAVE,
  coinsCapture: FAVORITE_COINS_CAPTURE,
  encounter: FAVORITE_ENCOUNTER,
  capture: FAVORITE_CAPTURE,
  shiny: FAVORITE_SHINY,
  stone: FAVORITE_STONE,
};

// Lo que vale cada efecto cuando no hay favorito (no cambia nada)
const NEUTRAL: Record<PerkKind, number> = {
  coinsSave: 0,
  coinsCapture: 0,
  encounter: 1,
  capture: 1,
  shiny: 1,
  stone: 1,
};

const percent = (value: number) => Math.round(value * 100);
const times = (value: number) => `×${String(value).replace('.', ',')}`;

export const PERK_TEXTS: Record<PerkKind, string> = {
  coinsSave: `+${percent(FAVORITE_COINS_SAVE)} % de monedas al guardar`,
  coinsCapture: `+${percent(FAVORITE_COINS_CAPTURE)} % de monedas al capturar`,
  encounter: `+${percent(FAVORITE_ENCOUNTER - 1)} % de probabilidad de encuentro`,
  capture: `+${percent(FAVORITE_CAPTURE - 1)} % de probabilidad de captura`,
  shiny: `${times(FAVORITE_SHINY)} de probabilidad de variocolor`,
  stone: `${times(FAVORITE_STONE)} de probabilidad de encontrar piedras`,
};

// Efecto de cada tipo (el primero de sus tipos, como en la PokéAPI): tres tipos por efecto
export const PERK_BY_TYPE: Record<string, PerkKind> = {
  electric: 'coinsSave',
  steel: 'coinsSave',
  normal: 'coinsSave',
  ground: 'coinsCapture',
  rock: 'coinsCapture',
  dragon: 'coinsCapture',
  fire: 'encounter',
  flying: 'encounter',
  bug: 'encounter',
  fighting: 'capture',
  dark: 'capture',
  poison: 'capture',
  psychic: 'shiny',
  fairy: 'shiny',
  ghost: 'shiny',
  grass: 'stone',
  water: 'stone',
  ice: 'stone',
};

export { typeName } from './types';

export function perkOfType(type: string | undefined): PerkKind | undefined {
  return type ? PERK_BY_TYPE[type] : undefined;
}

// El favorito elegido, si sigue entre tus capturas (por ejemplo, tras una sincronización)
export function findFavorite(state: GameState): CapturedPokemon | undefined {
  const favorite = state.favorite;
  if (!favorite) {
    return undefined;
  }
  return state.captured.find(
    (c) => c.id === favorite.id && Boolean(c.shiny) === favorite.shiny
  );
}

export function isFavorite(state: GameState, id: number, shiny: boolean): boolean {
  return state.favorite?.id === id && state.favorite.shiny === shiny;
}

// El efecto que está activo ahora (ninguno si no hay favorito o ya no lo tienes)
export function activePerk(state: GameState): PerkKind | undefined {
  return findFavorite(state) ? perkOfType(state.favorite?.type) : undefined;
}

// Valor del efecto si es el activo; si no, el valor neutro (0 para los bonus que se suman, 1 para los que multiplican)
export function perkValue(state: GameState, kind: PerkKind): number {
  return activePerk(state) === kind ? PERK_VALUES[kind] : NEUTRAL[kind];
}

export interface OwnedSpecies {
  id: number;
  name: string;
  shiny: boolean;
  spriteUrl: string | null;
  type?: string; // primer tipo, si se guardó al capturarlo
}

// Una entrada por especie y tipo (el variocolor aparte), ordenadas por Pokédex
export function ownedSpecies(captured: CapturedPokemon[]): OwnedSpecies[] {
  const found = new Map<string, OwnedSpecies>();
  for (const pokemon of captured) {
    const key = `${pokemon.id}:${pokemon.shiny ? 's' : 'n'}`;
    if (!found.has(key)) {
      found.set(key, {
        id: pokemon.id,
        name: pokemon.name,
        shiny: Boolean(pokemon.shiny),
        spriteUrl: pokemon.spriteUrl,
        type: pokemon.types?.[0],
      });
    }
  }
  return [...found.values()].sort((a, b) => a.id - b.id || Number(a.shiny) - Number(b.shiny));
}

export type SetFavoriteResult =
  | { ok: true; name: string; perk: PerkKind | undefined }
  | { ok: false; reason: string };

// `type` es el primer tipo del Pokémon; quien llama lo saca de la captura o de la PokéAPI
export async function setFavorite(
  state: StateManager,
  id: number,
  shiny: boolean,
  type: string
): Promise<SetFavoriteResult> {
  let result: SetFavoriteResult = { ok: false, reason: 'No tienes ese Pokémon.' };
  await state.update((s) => {
    const owned = s.captured.find((c) => c.id === id && Boolean(c.shiny) === shiny);
    if (!owned) {
      return;
    }
    s.favorite = { id, shiny, type };
    result = { ok: true, name: owned.name, perk: perkOfType(type) };
  });
  return result;
}

export async function clearFavorite(state: StateManager): Promise<void> {
  if (!state.get().favorite) {
    return;
  }
  await state.update((s) => {
    delete s.favorite;
  });
}
