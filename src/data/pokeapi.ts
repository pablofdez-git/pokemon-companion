export interface PokemonData {
  id: number;
  name: string;
  captureRate: number;
  spriteUrl: string | null;
  animatedSpriteUrl: string | null; // sprite animado; solo existe hasta el #649
}

interface PokemonResponse {
  name: string;
  sprites: {
    front_default: string | null;
    versions?: {
      'generation-v'?: {
        'black-white'?: {
          animated?: { front_default: string | null };
        };
      };
    };
  };
}

const BASE_URL = 'https://pokeapi.co/api/v2';
const cache = new Map<number, PokemonData>();

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`PokéAPI respondió ${response.status} en ${url}`);
  }
  return (await response.json()) as T;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
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

  const data: PokemonData = {
    id,
    name: capitalize(pokemon.name),
    captureRate: species.capture_rate,
    spriteUrl: pokemon.sprites.front_default,
    animatedSpriteUrl:
      pokemon.sprites.versions?.['generation-v']?.['black-white']?.animated
        ?.front_default ?? null,
  };
  cache.set(id, data);
  return data;
}
