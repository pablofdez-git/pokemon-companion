import { StateManager } from '../data/state';
import { PokemonData } from '../data/pokeapi';
import { GENERATIONS, Generation, unlockedAfterCaptures } from './generations';

// Ajusta estos valores a tu gusto
export const EVOLUTION_BASE_COST = 30;   // coste de evolucionar a la especie más fácil
export const EVOLUTION_EXTRA_COST = 120; // extra para la más difícil (30 + 120 = 150)

// Nodo de la cadena evolutiva de la PokéAPI (solo lo que usamos)
export interface EvolutionNode {
  species: { url: string };
  evolves_to: EvolutionNode[];
}

// Número de especie a partir de su URL (.../pokemon-species/133/)
function speciesIdFromUrl(url: string): number | null {
  const match = /\/pokemon-species\/(\d+)\/?$/.exec(url);
  return match ? Number(match[1]) : null;
}

function findNode(node: EvolutionNode, speciesId: number): EvolutionNode | null {
  if (speciesIdFromUrl(node.species.url) === speciesId) {
    return node;
  }
  for (const next of node.evolves_to) {
    const found = findNode(next, speciesId);
    if (found) {
      return found;
    }
  }
  return null;
}

// Especies a las que puede evolucionar directamente (vacío si es la última etapa)
export function nextEvolutionIds(chain: EvolutionNode, speciesId: number): number[] {
  const node = findNode(chain, speciesId);
  if (!node) {
    return [];
  }
  return node.evolves_to
    .map((next) => speciesIdFromUrl(next.species.url))
    .filter((id): id is number => id !== null);
}

// Cuanto más difícil de capturar es la evolución, más cuesta
export function evolutionCost(targetCaptureRate: number): number {
  const difficulty = (255 - targetCaptureRate) / 255;
  return EVOLUTION_BASE_COST + Math.round(difficulty * EVOLUTION_EXTRA_COST);
}

export type EvolveResult =
  | { ok: true; from: string; to: string; cost: number; newGenerations: Generation[] }
  | { ok: false; reason: string };

// Cambia una copia de la especie base por su evolución (conserva si era variocolor)
export async function evolvePokemon(
  state: StateManager,
  fromId: number,
  shiny: boolean,
  target: PokemonData
): Promise<EvolveResult> {
  let result: EvolveResult = { ok: false, reason: 'No tienes ese Pokémon.' };

  await state.update((s) => {
    const copies = s.captured.filter((c) => c.id === fromId && Boolean(c.shiny) === shiny);
    if (copies.length === 0) {
      return;
    }

    const cost = evolutionCost(target.captureRate);
    if (s.coins < cost) {
      result = { ok: false, reason: `Te faltan ${cost - s.coins} monedas.` };
      return;
    }

    const base = copies[copies.length - 1];
    s.captured.splice(s.captured.lastIndexOf(base), 1);
    s.captured.push({
      id: target.id,
      name: target.name,
      spriteUrl: shiny ? target.shinySpriteUrl ?? target.spriteUrl : target.spriteUrl,
      captureRate: target.captureRate,
      ...(shiny ? { shiny: true } : {}),
    });
    s.coins -= cost;
    s.stats.coinsSpent += cost;
    s.stats.evolutions += 1;

    const before = s.generationsUnlocked;
    const after = unlockedAfterCaptures(
      before,
      s.captured.map((c) => c.id)
    );
    s.generationsUnlocked = after;
    result = {
      ok: true,
      from: base.name,
      to: target.name,
      cost,
      newGenerations: GENERATIONS.filter((g) => g.number > before && g.number <= after),
    };
  });

  return result;
}
