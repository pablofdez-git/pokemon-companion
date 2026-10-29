import { GameState } from '../data/state';
import { GENERATIONS } from './generations';
import { typeName } from './types';

const SPRITES_BASE_URL =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

// Sprite de cualquier especie, aunque no se haya capturado (para las siluetas)
export function speciesSpriteUrl(id: number, shiny = false): string {
  return `${SPRITES_BASE_URL}/${shiny ? 'shiny/' : ''}${id}.png`;
}

export interface TypeChip {
  id: string;   // en inglés, para el color (fire, water…)
  name: string; // en español
}

export interface PokedexEntry {
  id: number;
  name: string | null; // null = aún no capturado
  count: number;       // copias que tienes (normales y variocolor)
  shiny: boolean;      // tienes al menos un variocolor
  shinyCount: number;  // cuántas de esas copias son variocolor
  spriteUrl: string;
  shinySpriteUrl: string;
  types: TypeChip[];   // vacío en las capturas anteriores a guardarlos
  firstCaughtAt: number | null; // fecha (ms) de la primera captura registrada; null si no hay
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
      shinyCount: 0,
      spriteUrl: speciesSpriteUrl(pokemon.id),
      shinySpriteUrl: speciesSpriteUrl(pokemon.id, true),
      types: [],
      firstCaughtAt: null,
    };
    entry.count += 1;
    if (entry.types.length === 0 && pokemon.types && pokemon.types.length > 0) {
      entry.types = pokemon.types.map((id) => ({ id, name: typeName(id) }));
    }
    const at = pokemon.capturedAt;
    if (at !== undefined && (entry.firstCaughtAt === null || at < entry.firstCaughtAt)) {
      entry.firstCaughtAt = at;
    }
    if (pokemon.shiny) {
      entry.shiny = true;
      entry.shinyCount += 1;
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
            shinyCount: 0,
            spriteUrl: speciesSpriteUrl(id),
            shinySpriteUrl: speciesSpriteUrl(id, true),
            types: [],
            firstCaughtAt: null,
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

// --- Descripción de una especie (de la PokéAPI) ---

export interface SpeciesInfo {
  genus: string | null;       // "Pokémon Ratón"
  description: string | null; // texto de la Pokédex de los juegos
}

interface SpeciesResponse {
  genera: { genus: string; language: { name: string } }[];
  flavor_text_entries: { flavor_text: string; language: { name: string } }[];
}

// Las entradas vienen en varios idiomas y juegos: se prefiere el español, luego el inglés,
// y dentro de cada idioma la última (la de los juegos más recientes)
const LANGUAGES = ['es', 'en'];

function lastIn<T extends { language: { name: string } }>(entries: T[]): T | undefined {
  for (const language of LANGUAGES) {
    const found = entries.filter((e) => e.language.name === language);
    if (found.length > 0) {
      return found[found.length - 1];
    }
  }
  return undefined;
}

// El texto trae saltos de línea y de página del formato de los juegos
function cleanText(text: string): string {
  return text.replace(/[\n\f\r]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

export function parseSpeciesInfo(species: SpeciesResponse): SpeciesInfo {
  const genus = lastIn(species.genera ?? [])?.genus;
  const text = lastIn(species.flavor_text_entries ?? [])?.flavor_text;
  return {
    genus: genus ? cleanText(genus) : null,
    description: text ? cleanText(text) : null,
  };
}
