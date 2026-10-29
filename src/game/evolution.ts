import { StateManager } from '../data/state';
import { PokemonData } from '../data/pokeapi';
import { reservedCopies } from './nursery';
import { STONE_IDS, findObject } from './objects';
import {
  GENERATIONS,
  Generation,
  maxPokemonId,
  unlockedAfterCaptures,
} from './generations';

// Ajusta estos valores a tu gusto
export const EVOLUTION_BASE_COST = 30;   // coste de evolucionar a la especie más fácil
export const EVOLUTION_EXTRA_COST = 120; // extra para la más difícil (30 + 120 = 150)

// Nodo de la cadena evolutiva de la PokéAPI (solo lo que usamos)
export interface EvolutionNode {
  species: { url: string };
  evolution_details?: { trigger?: { name: string }; item?: { name: string } | null }[];
  evolves_to: EvolutionNode[];
}

// Una evolución posible: a qué especie, y la piedra que necesita (null = se paga con monedas)
export interface EvolutionStep {
  id: number;
  stone: string | null;
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

// Si alguna forma de llegar a esta evolución es usar una piedra de la tienda, hace falta esa piedra
function stoneFor(node: EvolutionNode): string | null {
  const detail = (node.evolution_details ?? []).find(
    (d) => d.trigger?.name === 'use-item' && d.item && STONE_IDS.includes(d.item.name)
  );
  return detail?.item?.name ?? null;
}

// Evoluciones directas de una especie (vacío si es la última etapa)
export function nextEvolutions(chain: EvolutionNode, speciesId: number): EvolutionStep[] {
  const node = findNode(chain, speciesId);
  if (!node) {
    return [];
  }
  const steps: EvolutionStep[] = [];
  for (const next of node.evolves_to) {
    const id = speciesIdFromUrl(next.species.url);
    if (id !== null) {
      steps.push({ id, stone: stoneFor(next) });
    }
  }
  return steps;
}

// Evoluciones que se pueden elegir ahora: las de generaciones ya desbloqueadas
export function availableEvolutions(ids: number[], generationsUnlocked: number): number[] {
  const maxId = maxPokemonId(generationsUnlocked);
  return ids.filter((id) => id <= maxId);
}

// Cuanto más difícil de capturar es la evolución, más cuesta
export function evolutionCost(targetCaptureRate: number): number {
  const difficulty = (255 - targetCaptureRate) / 255;
  return EVOLUTION_BASE_COST + Math.round(difficulty * EVOLUTION_EXTRA_COST);
}

export type EvolveResult =
  | {
      ok: true;
      from: string;
      to: string;
      cost: number;          // monedas pagadas (0 si se usó una piedra)
      stone: string | null;  // piedra gastada
      newGenerations: Generation[];
    }
  | { ok: false; reason: string };

// Cambia una copia de la especie base por su evolución (conserva si era variocolor).
// Si la evolución necesita una piedra, se gasta la piedra en lugar de monedas.
export async function evolvePokemon(
  state: StateManager,
  fromId: number,
  shiny: boolean,
  target: PokemonData,
  stone: string | null = null
): Promise<EvolveResult> {
  let result: EvolveResult = { ok: false, reason: 'No tienes ese Pokémon.' };

  await state.update((s) => {
    const copies = s.captured.filter((c) => c.id === fromId && Boolean(c.shiny) === shiny);
    if (copies.length === 0) {
      return;
    }
    if (!shiny && copies.length - 1 < reservedCopies(s, fromId)) {
      result = { ok: false, reason: 'Esa copia está en la guardería: no se puede evolucionar.' };
      return;
    }

    const cost = stone ? 0 : evolutionCost(target.captureRate);
    if (stone && (s.items[stone] ?? 0) <= 0) {
      const name = findObject(stone)?.name ?? stone;
      result = { ok: false, reason: `Necesitas una ${name}. Las venden en la tienda.` };
      return;
    }
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
      types: target.types,
      capturedAt: Date.now(),
      ...(shiny ? { shiny: true } : {}),
    });
    // Si evoluciona la última copia del favorito, él evoluciona también (y toma su tipo)
    const favorite = s.favorite;
    if (
      favorite &&
      favorite.id === fromId &&
      favorite.shiny === shiny &&
      !s.captured.some((c) => c.id === fromId && Boolean(c.shiny) === shiny)
    ) {
      s.favorite = { id: target.id, shiny, type: target.types[0] ?? favorite.type };
    }
    if (stone) {
      s.items[stone] -= 1;
    }
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
      stone,
      newGenerations: GENERATIONS.filter((g) => g.number > before && g.number <= after),
    };
  });

  return result;
}
