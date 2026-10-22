import { EvolutionNode, nextEvolutionIds } from '../game/evolution';

export interface PokemonData {
  id: number;
  name: string;
  captureRate: number;
  spriteUrl: string | null;
  animatedSpriteUrl: string | null;      // sprite animado; solo existe hasta el #649
  shinySpriteUrl: string | null;         // sprite variocolor
  animatedShinySpriteUrl: string | null; // sprite variocolor animado (hasta el #649)
}

interface AnimatedSprites {
  front_default: string | null;
  front_shiny: string | null;
}

interface PokemonResponse {
  name: string;
  sprites: {
    front_default: string | null;
    front_shiny: string | null;
    versions?: {
      'generation-v'?: {
        'black-white'?: { animated?: AnimatedSprites };
      };
    };
  };
}

const BASE_URL = 'https://pokeapi.co/api/v2';
const REQUEST_TIMEOUT_MS = 8000; // sin respuesta en este tiempo, se da por perdida
const cache = new Map<number, PokemonData>();

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`PokéAPI respondió ${response.status} en ${url}`);
  }
  return (await response.json()) as T;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const evolutionCache = new Map<number, number[]>();

// Lo que ya se consultó, sin pedir nada: la mochila lo usa para saber qué Pokémon evolucionan
export function cachedEvolutionIds(id: number): number[] | undefined {
  return evolutionCache.get(id);
}

// Especies a las que puede evolucionar una especie: pokemon-species → evolution_chain
export async function fetchEvolutionIds(id: number): Promise<number[]> {
  const cached = evolutionCache.get(id);
  if (cached) {
    return cached;
  }

  const species = await getJson<{ evolution_chain: { url: string } }>(
    `${BASE_URL}/pokemon-species/${id}`
  );
  const chain = await getJson<{ chain: EvolutionNode }>(species.evolution_chain.url);
  const ids = nextEvolutionIds(chain.chain, id);
  evolutionCache.set(id, ids);
  return ids;
}

export async function fetchPokemon(id: number): Promise<PokemonData> {
  const cached = cache.get(id);
  if (cached) {
    return cached;
  }

  const [pokemon, species] = await Promise.all([
    getJson<PokemonResponse>(`${BASE_URL}/pokemon/${id}`),
    getJson<{ capture_rate: number }>(`${BASE_URL}/pokemon-species/${id}`),
  ]);

  const animated =
    pokemon.sprites.versions?.['generation-v']?.['black-white']?.animated;

  const data: PokemonData = {
    id,
    name: capitalize(pokemon.name),
    captureRate: species.capture_rate,
    spriteUrl: pokemon.sprites.front_default,
    animatedSpriteUrl: animated?.front_default ?? null,
    shinySpriteUrl: pokemon.sprites.front_shiny ?? null,
    animatedShinySpriteUrl: animated?.front_shiny ?? null,
  };
  cache.set(id, data);
  return data;
}
