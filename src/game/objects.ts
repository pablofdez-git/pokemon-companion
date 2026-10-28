import { GameState, StateManager } from '../data/state';

// Ajusta estos valores a tu gusto
export const INCENSE_MINUTES = 10;          // lo que dura el Incienso
export const INCENSE_MULTIPLIER = 2;        // multiplica la probabilidad de encuentro
export const AMULET_COIN_BONUS = 0.1;       // +10 % de monedas al guardar
export const STONE_DROP_CHANCE = 0.05;      // 5 % de que un Pokémon capturado lleve una piedra
export const FLUTE_WINDOW_MINUTES = 10;     // la Pokéflauta solo llama a los que huyeron hace poco

export type ObjectKind = 'incense' | 'amulet' | 'stone' | 'flute';

export interface GameObject {
  id: string;         // para las piedras, el nombre del objeto en la PokéAPI (fire-stone…)
  name: string;
  price: number;
  rule: string;       // explicación corta para la tienda y la mochila
  spriteSlug: string; // nombre del sprite en el repositorio de la PokéAPI
  kind: ObjectKind;
  unique?: boolean;   // solo se puede tener uno
}

function stone(id: string, name: string): GameObject {
  return {
    id,
    name,
    price: 100,
    rule: 'Hace evolucionar a los Pokémon que lo necesitan, en lugar de pagar monedas',
    spriteSlug: id,
    kind: 'stone',
  };
}

export const OBJECTS: GameObject[] = [
  {
    id: 'incense',
    name: 'Incienso',
    price: 60,
    rule: `Durante ${INCENSE_MINUTES} min, el doble de probabilidad de encuentro`,
    spriteSlug: 'luck-incense',
    kind: 'incense',
  },
  {
    id: 'poke-flute',
    name: 'Pokéflauta',
    price: 80,
    rule: `Vuelve a llamar al último Pokémon que huyó (hasta ${FLUTE_WINDOW_MINUTES} min después)`,
    spriteSlug: 'poke-flute',
    kind: 'flute',
  },
  {
    id: 'amulet-coin',
    name: 'Moneda Amuleto',
    price: 1500,
    rule: `+${AMULET_COIN_BONUS * 100} % de monedas al guardar, para siempre`,
    spriteSlug: 'amulet-coin',
    kind: 'amulet',
    unique: true,
  },
  stone('fire-stone', 'Piedra Fuego'),
  stone('water-stone', 'Piedra Agua'),
  stone('thunder-stone', 'Piedra Trueno'),
  stone('leaf-stone', 'Piedra Hoja'),
  stone('moon-stone', 'Piedra Lunar'),
  stone('sun-stone', 'Piedra Solar'),
  stone('shiny-stone', 'Piedra Día'),
  stone('dusk-stone', 'Piedra Noche'),
  stone('dawn-stone', 'Piedra Alba'),
  stone('ice-stone', 'Piedra Hielo'),
];

export const STONE_IDS = OBJECTS.filter((o) => o.kind === 'stone').map((o) => o.id);

export function findObject(id: string): GameObject | undefined {
  return OBJECTS.find((o) => o.id === id);
}

const SPRITES_BASE_URL =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items';

export function objectSpriteUrl(object: GameObject): string {
  return `${SPRITES_BASE_URL}/${object.spriteSlug}.png`;
}

// --- Incienso ---

export function incenseActive(state: GameState, now = Date.now()): boolean {
  return state.incenseUntil > now;
}

// Probabilidad de encuentro con el Incienso encendido (nunca pasa de 1)
export function encounterChanceWithIncense(chance: number, active: boolean): number {
  return active ? Math.min(1, chance * INCENSE_MULTIPLIER) : chance;
}

export type UseResult = { ok: true; until: number } | { ok: false; reason: string };

export async function useIncense(state: StateManager, now = Date.now()): Promise<UseResult> {
  let result: UseResult = { ok: false, reason: 'No tienes Incienso.' };
  await state.update((s) => {
    if ((s.items.incense ?? 0) <= 0) {
      return;
    }
    if (incenseActive(s, now)) {
      result = { ok: false, reason: 'Ya tienes un Incienso encendido.' };
      return;
    }
    s.items.incense -= 1;
    s.incenseUntil = now + INCENSE_MINUTES * 60_000;
    result = { ok: true, until: s.incenseUntil };
  });
  return result;
}

// --- Moneda Amuleto ---

// Bonus de monedas al guardar (0 si no la tienes)
export function amuletBonus(state: GameState): number {
  return (state.items['amulet-coin'] ?? 0) > 0 ? AMULET_COIN_BONUS : 0;
}

// --- Piedras ---

// Qué piedra lleva un Pokémon de cada tipo; los demás tipos, una al azar
const STONE_BY_TYPE: Record<string, string> = {
  fire: 'fire-stone',
  water: 'water-stone',
  electric: 'thunder-stone',
  grass: 'leaf-stone',
  fairy: 'moon-stone',
  ice: 'ice-stone',
  ghost: 'dusk-stone',
  dark: 'dusk-stone',
  psychic: 'dawn-stone',
  normal: 'shiny-stone',
  bug: 'sun-stone',
};

// La piedra que lleva un Pokémon recién capturado, o null (la mayoría no lleva nada)
export function rollStoneDrop(
  types: string[],
  random: () => number = Math.random,
  chanceMultiplier = 1 // el favorito puede aumentarla
): string | null {
  if (random() >= STONE_DROP_CHANCE * chanceMultiplier) {
    return null;
  }
  const byType = types.map((t) => STONE_BY_TYPE[t]).find(Boolean);
  return byType ?? STONE_IDS[Math.floor(random() * STONE_IDS.length)];
}

// --- Pokéflauta ---

export interface FledPokemon {
  id: number;
  name: string;
  shiny: boolean;
  at: number; // cuándo huyó (ms)
}

export function canRecall(fled: FledPokemon | undefined, now = Date.now()): fled is FledPokemon {
  return fled !== undefined && now - fled.at <= FLUTE_WINDOW_MINUTES * 60_000;
}

// Gasta una Pokéflauta; quien llama comprueba antes que hay a quién llamar
export async function useFlute(state: StateManager): Promise<boolean> {
  let used = false;
  await state.update((s) => {
    if ((s.items['poke-flute'] ?? 0) > 0) {
      s.items['poke-flute'] -= 1;
      used = true;
    }
  });
  return used;
}
