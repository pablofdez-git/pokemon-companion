import * as assert from 'assert';
import { CapturedPokemon, StateManager } from '../data/state';
import { PokemonData } from '../data/pokeapi';
import {
  EVOLUTION_BASE_COST,
  EVOLUTION_EXTRA_COST,
  EvolutionNode,
  availableEvolutions,
  evolutionCost,
  evolvePokemon,
  nextEvolutions,
} from '../game/evolution';
import { FakeMemento } from './fakeMemento';

function node(id: number, ...next: EvolutionNode[]): EvolutionNode {
  return {
    species: { url: `https://pokeapi.co/api/v2/pokemon-species/${id}/` },
    evolves_to: next,
  };
}

// Evolución que se consigue usando un objeto (como en la PokéAPI)
function withItem(evolution: EvolutionNode, item: string): EvolutionNode {
  return { ...evolution, evolution_details: [{ trigger: { name: 'use-item' }, item: { name: item } }] };
}

const ids = (chain: EvolutionNode, id: number) => nextEvolutions(chain, id).map((s) => s.id);

function data(id: number, name: string, captureRate: number): PokemonData {
  return {
    id,
    name,
    captureRate,
    types: [],
    spriteUrl: `n${id}`,
    animatedSpriteUrl: null,
    shinySpriteUrl: `s${id}`,
    animatedShinySpriteUrl: null,
  };
}

function mon(id: number, name: string, shiny = false): CapturedPokemon {
  return { id, name, spriteUrl: null, captureRate: 45, ...(shiny ? { shiny: true } : {}) };
}

async function stateWith(coins: number, captured: CapturedPokemon[]): Promise<StateManager> {
  const state = new StateManager(new FakeMemento());
  await state.update((s) => {
    s.coins = coins;
    s.captured = captured;
  });
  return state;
}

const charmeleon = data(5, 'Charmeleon', 45);

suite('evoluciones', () => {
  test('nextEvolutions: cadena lineal', () => {
    const chain = node(4, node(5, node(6)));
    assert.deepStrictEqual(nextEvolutions(chain, 4), [{ id: 5, stone: null }]);
    assert.deepStrictEqual(ids(chain, 5), [6]);
    assert.deepStrictEqual(ids(chain, 6), []);
  });

  test('nextEvolutions: ramificada y especie fuera de la cadena', () => {
    const chain = node(133, node(134), node(135), node(136));
    assert.deepStrictEqual(ids(chain, 133), [134, 135, 136]);
    assert.deepStrictEqual(ids(chain, 999), []);
  });

  test('nextEvolutions: las que se hacen con piedra la piden; otros objetos no', () => {
    const chain = node(
      133,
      withItem(node(134), 'water-stone'),
      withItem(node(196), 'king-rock'), // no es una piedra de la tienda: se paga con monedas
      node(197)
    );
    assert.deepStrictEqual(nextEvolutions(chain, 133), [
      { id: 134, stone: 'water-stone' },
      { id: 196, stone: null },
      { id: 197, stone: null },
    ]);
  });

  test('availableEvolutions descarta las de generaciones bloqueadas', () => {
    assert.deepStrictEqual(availableEvolutions([5, 169], 1), [5]); // Crobat es de Johto
    assert.deepStrictEqual(availableEvolutions([5, 169], 2), [5, 169]);
    assert.deepStrictEqual(availableEvolutions([], 9), []);
  });

  test('el coste va del mínimo al máximo según la dificultad', () => {
    assert.strictEqual(evolutionCost(255), EVOLUTION_BASE_COST);
    assert.strictEqual(evolutionCost(0), EVOLUTION_BASE_COST + EVOLUTION_EXTRA_COST);
    assert.ok(evolutionCost(45) > evolutionCost(190));
  });

  test('evolucionar cambia una copia por la evolución y cobra', async () => {
    const state = await stateWith(500, [mon(4, 'Charmander'), mon(4, 'Charmander')]);
    const result = await evolvePokemon(state, 4, false, charmeleon);

    const cost = evolutionCost(45);
    assert.deepStrictEqual(result.ok && [result.from, result.to, result.cost], [
      'Charmander',
      'Charmeleon',
      cost,
    ]);
    const s = state.get();
    assert.deepStrictEqual(s.captured.map((c) => c.id).sort(), [4, 5]);
    assert.strictEqual(s.coins, 500 - cost);
    assert.strictEqual(s.stats.coinsSpent, cost);
    assert.strictEqual(s.stats.evolutions, 1);
    // La evolución cuenta como conseguida ahora, para la ficha de la Pokédex
    assert.ok(s.captured.find((c) => c.id === 5)?.capturedAt !== undefined);
  });

  test('un variocolor evoluciona a variocolor con su sprite', async () => {
    const state = await stateWith(500, [mon(4, 'Charmander', true)]);
    await evolvePokemon(state, 4, true, charmeleon);

    const [evolved] = state.get().captured;
    assert.strictEqual(evolved.id, 5);
    assert.strictEqual(evolved.shiny, true);
    assert.strictEqual(evolved.spriteUrl, 's5');
  });

  test('no evoluciona sin monedas suficientes ni sin el Pokémon', async () => {
    const state = await stateWith(1, [mon(4, 'Charmander')]);
    const poor = await evolvePokemon(state, 4, false, charmeleon);
    assert.strictEqual(poor.ok, false);
    assert.strictEqual(state.get().captured[0].id, 4);
    assert.strictEqual(state.get().coins, 1);

    const missing = await evolvePokemon(state, 7, false, charmeleon);
    assert.strictEqual(missing.ok, false);
    // Un variocolor no se confunde con la copia normal
    const wrongKind = await evolvePokemon(state, 4, true, charmeleon);
    assert.strictEqual(wrongKind.ok, false);
  });

  test('con piedra se gasta la piedra y no se cobran monedas', async () => {
    const state = await stateWith(500, [mon(25, 'Pikachu')]);
    await state.update((s) => {
      s.items['thunder-stone'] = 1;
    });
    const raichu = data(26, 'Raichu', 75);
    const result = await evolvePokemon(state, 25, false, raichu, 'thunder-stone');

    assert.ok(result.ok && result.cost === 0 && result.stone === 'thunder-stone');
    const s = state.get();
    assert.strictEqual(s.coins, 500);
    assert.strictEqual(s.items['thunder-stone'], 0);
    assert.strictEqual(s.captured[0].id, 26);
    assert.strictEqual(s.stats.evolutions, 1);
  });

  test('sin la piedra no evoluciona aunque sobren monedas', async () => {
    const state = await stateWith(5000, [mon(25, 'Pikachu')]);
    const result = await evolvePokemon(state, 25, false, data(26, 'Raichu', 75), 'thunder-stone');

    assert.strictEqual(result.ok, false);
    assert.strictEqual(state.get().coins, 5000);
    assert.strictEqual(state.get().captured[0].id, 25);
  });

  test('una evolución nueva puede desbloquear la generación', async () => {
    // Hacen falta 38 especies distintas: 36 + Charmander = 37, y evolucionar una copia suma Charmeleon
    const captured = Array.from({ length: 36 }, (_, i) => mon(i + 10, `P${i}`));
    captured.push(mon(4, 'Charmander'), mon(4, 'Charmander'));
    const state = await stateWith(500, captured);

    const result = await evolvePokemon(state, 4, false, charmeleon);
    assert.ok(result.ok && result.newGenerations.length === 1);
    assert.strictEqual(state.get().generationsUnlocked, 2);
  });

  test('evolucionar la única copia no cambia las especies distintas', async () => {
    const captured = Array.from({ length: 36 }, (_, i) => mon(i + 10, `P${i}`));
    captured.push(mon(4, 'Charmander'));
    const state = await stateWith(500, captured);

    const result = await evolvePokemon(state, 4, false, charmeleon);
    assert.ok(result.ok && result.newGenerations.length === 0);
    assert.strictEqual(state.get().generationsUnlocked, 1);
  });
});
