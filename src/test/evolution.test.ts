import * as assert from 'assert';
import { CapturedPokemon, StateManager } from '../data/state';
import { PokemonData } from '../data/pokeapi';
import {
  EVOLUTION_BASE_COST,
  EVOLUTION_EXTRA_COST,
  EvolutionNode,
  evolutionCost,
  evolvePokemon,
  nextEvolutionIds,
} from '../game/evolution';
import { FakeMemento } from './fakeMemento';

function node(id: number, ...next: EvolutionNode[]): EvolutionNode {
  return {
    species: { url: `https://pokeapi.co/api/v2/pokemon-species/${id}/` },
    evolves_to: next,
  };
}

function data(id: number, name: string, captureRate: number): PokemonData {
  return {
    id,
    name,
    captureRate,
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
  test('nextEvolutionIds: cadena lineal', () => {
    const chain = node(4, node(5, node(6)));
    assert.deepStrictEqual(nextEvolutionIds(chain, 4), [5]);
    assert.deepStrictEqual(nextEvolutionIds(chain, 5), [6]);
    assert.deepStrictEqual(nextEvolutionIds(chain, 6), []);
  });

  test('nextEvolutionIds: ramificada y especie fuera de la cadena', () => {
    const chain = node(133, node(134), node(135), node(136));
    assert.deepStrictEqual(nextEvolutionIds(chain, 133), [134, 135, 136]);
    assert.deepStrictEqual(nextEvolutionIds(chain, 999), []);
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
