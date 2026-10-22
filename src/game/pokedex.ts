import { GameState } from '../data/state';
import { GENERATIONS } from './generations';

const SPRITES_BASE_URL =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

// Sprite de cualquier especie, aunque no se haya capturado (para las siluetas)
export function speciesSpriteUrl(id: number, shiny = false): string {
  return `${SPRITES_BASE_URL}/${shiny ? 'shiny/' : ''}${id}.png`;
}

export interface PokedexEntry {
  id: number;
  name: string | null; // null = aún no capturado
  count: number;       // copias que tienes (normales y variocolor)
  shiny: boolean;      // tienes al menos un variocolor
  spriteUrl: string;
}

export interface PokedexGeneration {
  number: number;
  name: string;
  unlocked: boolean;
  caught: number; // especies distintas capturadas de esta generación
  total: number;
  entries: PokedexEntry[]; // vacío si está bloqueada
}

export interface PokedexData {
  caught: number;
  total: number; // especies de las generaciones desbloqueadas
  shinies: number;
  generations: PokedexGeneration[];
}

// Junta las capturas por especie y las reparte por generación
export function buildPokedex(state: GameState): PokedexData {
  const byId = new Map<number, PokedexEntry>();
  const withNormal = new Set<number>();
  for (const pokemon of state.captured) {
    const entry = byId.get(pokemon.id) ?? {
      id: pokemon.id,
      name: pokemon.name,
      count: 0,
      shiny: false,
      spriteUrl: speciesSpriteUrl(pokemon.id),
    };
    entry.count += 1;
    if (pokemon.shiny) {
      entry.shiny = true;
    } else {
      withNormal.add(pokemon.id);
      if (pokemon.spriteUrl) {
        entry.spriteUrl = pokemon.spriteUrl; // se prefiere el sprite normal guardado
      }
    }
    byId.set(pokemon.id, entry);
  }

  // Si solo tienes el variocolor, se enseña su sprite
  for (const entry of byId.values()) {
    if (!withNormal.has(entry.id)) {
      entry.spriteUrl = speciesSpriteUrl(entry.id, true);
    }
  }

  const generations = GENERATIONS.map((g): PokedexGeneration => {
    const unlocked = g.number <= state.generationsUnlocked;
    const entries: PokedexEntry[] = [];
    let caught = 0;

    for (let id = g.firstId; id <= g.lastId; id += 1) {
      const entry = byId.get(id);
      if (entry) {
        caught += 1;
      }
      if (unlocked) {
        entries.push(
          entry ?? {
            id,
            name: null,
            count: 0,
            shiny: false,
            spriteUrl: speciesSpriteUrl(id),
          }
        );
      }
    }

    return {
      number: g.number,
      name: g.name,
      unlocked,
      caught,
      total: g.lastId - g.firstId + 1,
      entries,
    };
  });

  const unlocked = generations.filter((g) => g.unlocked);
  return {
    caught: unlocked.reduce((sum, g) => sum + g.caught, 0),
    total: unlocked.reduce((sum, g) => sum + g.total, 0),
    shinies: [...byId.values()].filter((e) => e.shiny).length,
    generations,
  };
}
