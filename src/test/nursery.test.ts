import * as assert from 'assert';
import { CapturedPokemon, GameState, StateManager } from '../data/state';
import { PokemonData } from '../data/pokeapi';
import { evolvePokemon } from '../game/evolution';
import {
  DITTO_ID,
  HATCH_BATCH,
  NURSERY_SAVES,
  advanceNursery,
  depositPair,
  eligiblePairs,
  hatchEgg,
  inTier,
  isReady,
  parentNames,
  pickHatchling,
  reservedCopies,
  savesNeeded,
  takeBack,
  tierForCaptureRate,
} from '../game/nursery';
import { sellDuplicate } from '../game/shop';
import { EMPTY_STATS } from '../game/stats';
import { mergeStates } from '../game/syncMerge';
import { FakeMemento } from './fakeMemento';

function mon(id: number, captureRate = 255, shiny = false): CapturedPokemon {
  return { id, name: id === DITTO_ID ? 'Ditto' : `P${id}`, spriteUrl: null, captureRate, ...(shiny ? { shiny: true } : {}) };
}

function game(captured: CapturedPokemon[], overrides: Partial<GameState> = {}): GameState {
  return {
    coins: 0,
    balls: {},
    items: {},
    incenseUntil: 0,
    captured,
    generationsUnlocked: 1,
    updatedAt: 1,
    stats: { ...EMPTY_STATS },
    achievements: [],
    achievementsClaimed: [],
    ...overrides,
  };
}

async function stateWith(
  captured: CapturedPokemon[],
  nursery?: GameState['nursery']
): Promise<StateManager> {
  const state = new StateManager(new FakeMemento());
  await state.update((s) => {
    s.captured = captured;
    if (nursery) {
      s.nursery = nursery;
    }
  });
  return state;
}

function data(id: number, captureRate: number): PokemonData {
  return {
    id,
    name: `P${id}`,
    captureRate,
    types: ['normal'],
    spriteUrl: `n${id}`,
    animatedSpriteUrl: null,
    shinySpriteUrl: `s${id}`,
    animatedShinySpriteUrl: null,
  };
}

// Una especie por id con la dificultad indicada; las demás no existen (fallan al consultarlas)
function fakeFetch(rates: Record<number, number>) {
  const asked: number[] = [];
  const fetch = async (id: number): Promise<PokemonData> => {
    asked.push(id);
    if (!(id in rates)) {
      throw new Error('sin datos');
    }
    return data(id, rates[id]);
  };
  return { fetch, asked };
}

suite('guardería: categorías y tiempos', () => {
  test('la dificultad de captura decide la categoría', () => {
    assert.strictEqual(tierForCaptureRate(255), 1);
    assert.strictEqual(tierForCaptureRate(150), 1);
    assert.strictEqual(tierForCaptureRate(149), 2);
    assert.strictEqual(tierForCaptureRate(75), 2);
    assert.strictEqual(tierForCaptureRate(74), 3);
    assert.strictEqual(tierForCaptureRate(11), 3);
    assert.strictEqual(tierForCaptureRate(10), 4);
    assert.strictEqual(tierForCaptureRate(3), 4);
    assert.ok(inTier(3, 4) && !inTier(3, 3));
  });

  test('cuanto más raro, más tarda (los comunes, 50 guardados)', () => {
    assert.strictEqual(NURSERY_SAVES[1], 50);
    assert.ok(NURSERY_SAVES[1] < NURSERY_SAVES[2]);
    assert.ok(NURSERY_SAVES[2] < NURSERY_SAVES[3]);
    assert.ok(NURSERY_SAVES[3] < NURSERY_SAVES[4]);
  });
});

suite('guardería: elegir la pareja', () => {
  test('dos repetidos de la misma especie', () => {
    const pairs = eligiblePairs(game([mon(16), mon(16), mon(19)]));
    assert.deepStrictEqual(pairs, [{ a: 16, b: 16 }]); // el 19 solo tiene una copia
  });

  test('con un Ditto, cualquier Pokémon (también con una sola copia)', () => {
    const pairs = eligiblePairs(game([mon(16), mon(19), mon(DITTO_ID, 35)]));
    assert.deepStrictEqual(pairs, [
      { a: 16, b: DITTO_ID },
      { a: 19, b: DITTO_ID },
    ]);
  });

  test('con repetidos y Ditto salen las dos opciones; Ditto no se junta con otro Ditto', () => {
    const pairs = eligiblePairs(game([mon(16), mon(16), mon(DITTO_ID, 35), mon(DITTO_ID, 35)]));
    assert.deepStrictEqual(pairs, [
      { a: 16, b: 16 },
      { a: 16, b: DITTO_ID },
    ]);
    assert.deepStrictEqual(eligiblePairs(game([mon(DITTO_ID), mon(DITTO_ID)])), []);
  });

  test('los variocolor no cuentan como padres', () => {
    assert.deepStrictEqual(eligiblePairs(game([mon(16), mon(16, 255, true)])), []);
  });

  test('con la guardería ocupada no hay parejas', () => {
    const s = game([mon(16), mon(16)], { nursery: { a: 16, b: 16, tier: 1, saves: 0 } });
    assert.deepStrictEqual(eligiblePairs(s), []);
  });

  test('dejar una pareja la guarda; una pareja inválida o con la guardería ocupada, no', async () => {
    const state = await stateWith([mon(16), mon(16), mon(19)]);
    assert.strictEqual((await depositPair(state, { a: 19, b: 19 }, 1)).ok, false);
    assert.strictEqual(state.get().nursery, undefined);

    assert.deepStrictEqual(await depositPair(state, { a: 16, b: 16 }, 1), { ok: true });
    assert.deepStrictEqual(state.get().nursery, { a: 16, b: 16, tier: 1, saves: 0 });
    assert.strictEqual((await depositPair(state, { a: 16, b: 16 }, 1)).ok, false);

    await takeBack(state);
    assert.strictEqual(state.get().nursery, undefined);
  });

  test('parentNames', () => {
    const s = game([mon(16), mon(DITTO_ID, 35)]);
    assert.strictEqual(parentNames(s, { a: 16, b: DITTO_ID, tier: 1, saves: 0 }), 'P16 + Ditto');
  });
});

suite('guardería: copias ocupadas', () => {
  test('reservedCopies cuenta una por padre', () => {
    const pair = game([], { nursery: { a: 16, b: 16, tier: 1, saves: 0 } });
    assert.strictEqual(reservedCopies(pair, 16), 2);
    const ditto = game([], { nursery: { a: 16, b: DITTO_ID, tier: 1, saves: 0 } });
    assert.strictEqual(reservedCopies(ditto, 16), 1);
    assert.strictEqual(reservedCopies(ditto, DITTO_ID), 1);
    assert.strictEqual(reservedCopies(ditto, 19), 0);
    assert.strictEqual(reservedCopies(game([]), 16), 0);
  });

  test('no se puede vender una copia que está en la guardería, pero sí una de sobra', async () => {
    const state = await stateWith([mon(16), mon(16)], { a: 16, b: 16, tier: 1, saves: 0 });
    const blocked = await sellDuplicate(state, 16);
    assert.strictEqual(blocked.ok, false);
    assert.strictEqual(state.get().captured.length, 2);

    await state.update((s) => s.captured.push(mon(16)));
    assert.strictEqual((await sellDuplicate(state, 16)).ok, true);
    assert.strictEqual(state.get().captured.length, 2);
  });

  test('con Ditto solo se reserva una copia: se puede vender la de sobra', async () => {
    const state = await stateWith([mon(16), mon(16), mon(DITTO_ID, 35)], {
      a: 16,
      b: DITTO_ID,
      tier: 1,
      saves: 0,
    });
    assert.strictEqual((await sellDuplicate(state, 16)).ok, true);
  });

  test('no se puede evolucionar una copia que está en la guardería', async () => {
    const state = await stateWith([mon(16), mon(16)], { a: 16, b: 16, tier: 1, saves: 0 });
    await state.update((s) => {
      s.coins = 1000;
    });
    const blocked = await evolvePokemon(state, 16, false, data(17, 120));
    assert.strictEqual(blocked.ok, false);
    assert.strictEqual(state.get().stats.evolutions, 0);

    await state.update((s) => s.captured.push(mon(16)));
    assert.strictEqual((await evolvePokemon(state, 16, false, data(17, 120))).ok, true);
  });
});

suite('guardería: el huevo', () => {
  test('avanza con cada guardado y avisa cuando está listo', async () => {
    const state = await stateWith([mon(16), mon(16)]);
    assert.strictEqual(await advanceNursery(state), 'none');

    await depositPair(state, { a: 16, b: 16 }, 1);
    for (let i = 1; i < NURSERY_SAVES[1]; i += 1) {
      assert.strictEqual(await advanceNursery(state), 'growing');
    }
    assert.strictEqual(await advanceNursery(state), 'ready');
    assert.ok(isReady(state.get().nursery!));
    assert.strictEqual(savesNeeded(state.get().nursery!), 50);

    // Ya listo, no sigue contando ni toca la partida
    const before = state.get().updatedAt;
    assert.strictEqual(await advanceNursery(state), 'ready');
    assert.strictEqual(state.get().nursery!.saves, NURSERY_SAVES[1]);
    assert.strictEqual(state.get().updatedAt, before);
  });

  test('pickHatchling elige una especie de la categoría entre las candidatas', async () => {
    const { fetch, asked } = fakeFetch({ 1: 255, 2: 45, 3: 3, 4: 200 });
    const found = await pickHatchling(4, [1, 2, 3, 4], fetch, () => 0.5);
    assert.strictEqual(found?.id, 3);
    assert.ok(asked.every((id) => [1, 2, 3, 4].includes(id)));
  });

  test('pickHatchling devuelve null si ninguna encaja y lanza error si no hay conexión', async () => {
    const { fetch } = fakeFetch({ 1: 255, 2: 200 });
    assert.strictEqual(await pickHatchling(4, [1, 2], fetch, () => 0.5), null);
    assert.strictEqual(await pickHatchling(4, [], fetch), null);
    await assert.rejects(pickHatchling(4, [8, 9], fakeFetch({}).fetch));
  });

  test('pickHatchling consulta por tandas y se para al encontrar', async () => {
    const rates: Record<number, number> = {};
    for (let id = 1; id <= 200; id += 1) {
      rates[id] = 255; // todos comunes
    }
    const { fetch, asked } = fakeFetch(rates);
    const candidates = Array.from({ length: 200 }, (_, i) => i + 1);
    const found = await pickHatchling(1, candidates, fetch);
    assert.ok(found);
    assert.ok(asked.length <= HATCH_BATCH, `${asked.length} consultas`);
  });

  test('al eclosionar nace una especie nueva de la misma categoría y se vacía la guardería', async () => {
    // Padres comunes (255). Hay un raro (3) y un común (200) sin capturar
    const state = await stateWith([mon(16), mon(16)], { a: 16, b: 16, tier: 1, saves: 50 });
    const { fetch } = fakeFetch({ 5: 3, 6: 200 });
    const result = await hatchEgg(state, fetch, () => 0.99);

    assert.ok(result.ok);
    assert.strictEqual(result.ok && result.pokemon.id, 6); // el común, nunca el legendario
    assert.ok(result.ok && result.isNew);
    const s = state.get();
    assert.strictEqual(s.nursery, undefined);
    assert.strictEqual(s.stats.eggs, 1);
    assert.strictEqual(s.captured.length, 3);
    const baby = s.captured.find((c) => c.id === 6)!;
    assert.ok(baby.capturedAt !== undefined);
    assert.deepStrictEqual(baby.types, ['normal']);
  });

  test('no repite las especies que ya tienes', async () => {
    const state = await stateWith([mon(16), mon(16), mon(6, 200)], { a: 16, b: 16, tier: 1, saves: 50 });
    const { fetch } = fakeFetch({ 6: 200, 7: 200 });
    const result = await hatchEgg(state, fetch, () => 0.99);
    assert.strictEqual(result.ok && result.pokemon.id, 7);
  });

  test('si no queda ninguna nueva de su categoría, repite la especie de los padres', async () => {
    const state = await stateWith([mon(16), mon(16)], { a: 16, b: 16, tier: 1, saves: 50 });
    const { fetch } = fakeFetch({ 16: 255, 5: 3 });
    const result = await hatchEgg(state, fetch, () => 0.99);
    assert.ok(result.ok);
    assert.strictEqual(result.ok && result.pokemon.id, 16);
    assert.strictEqual(result.ok && result.isNew, false);
    assert.strictEqual(state.get().captured.filter((c) => c.id === 16).length, 3);
  });

  test('con la suerte del variocolor, nace variocolor', async () => {
    const state = await stateWith([mon(16), mon(16)], { a: 16, b: 16, tier: 1, saves: 50 });
    const result = await hatchEgg(state, fakeFetch({ 6: 200 }).fetch, () => 0);
    assert.ok(result.ok && result.shiny);
    const baby = state.get().captured.find((c) => c.id === 6)!;
    assert.strictEqual(baby.shiny, true);
    assert.strictEqual(baby.spriteUrl, 's6');
  });

  test('sin conexión el huevo espera; sin huevo listo no pasa nada', async () => {
    const state = await stateWith([mon(16), mon(16)], { a: 16, b: 16, tier: 1, saves: 50 });
    const offline = await hatchEgg(state, fakeFetch({}).fetch, () => 0.99);
    assert.ok(!offline.ok && offline.offline);
    assert.ok(state.get().nursery, 'el huevo sigue ahí');
    assert.strictEqual(state.get().stats.eggs, 0);

    const growing = await stateWith([mon(16), mon(16)], { a: 16, b: 16, tier: 1, saves: 10 });
    const early = await hatchEgg(growing, fakeFetch({ 6: 200 }).fetch);
    assert.strictEqual(early.ok, false);
  });

  test('la cría puede desbloquear una generación', async () => {
    // 37 especies distintas: la 38.ª desbloquea Johto
    const owned = Array.from({ length: 37 }, (_, i) => mon(i + 10));
    owned.push(mon(200), mon(200));
    const state = await stateWith(owned, { a: 200, b: 200, tier: 1, saves: 50 });
    const result = await hatchEgg(state, fakeFetch({ 1: 255 }).fetch, () => 0.99);
    assert.ok(result.ok && result.newGenerations.length === 1);
    assert.strictEqual(state.get().generationsUnlocked, 2);
  });
});

suite('guardería: sincronización', () => {
  const nursery = (saves: number, a = 16) => ({ a, b: a, tier: 1 as const, saves });

  test('con la misma pareja se queda el huevo más avanzado', () => {
    const merged = mergeStates(undefined, game([], { nursery: nursery(10) }), game([], { nursery: nursery(30) }));
    assert.strictEqual(merged.nursery?.saves, 30);
  });

  test('un huevo que eclosionó en un ordenador no sigue esperando en el otro', () => {
    const base = game([], { nursery: nursery(49) });
    const hatched = game([]); // allí ya eclosionó
    const waiting = game([], { nursery: nursery(49) });
    assert.strictEqual(mergeStates(base, hatched, waiting).nursery, undefined);
    assert.strictEqual(mergeStates(base, waiting, hatched).nursery, undefined);
  });

  test('si cambiaron los dos, el más reciente; sin guardería no se añade', () => {
    const base = game([], { nursery: nursery(5, 16) });
    const older = game([], { updatedAt: 1, nursery: nursery(1, 19) });
    const newer = game([], { updatedAt: 9, nursery: nursery(2, 25) });
    assert.strictEqual(mergeStates(base, older, newer).nursery?.a, 25);

    const none = mergeStates(undefined, game([]), game([]));
    assert.ok(!('nursery' in none));
  });

  test('los huevos eclosionados se suman', () => {
    const base = game([]);
    const local = game([], { stats: { ...EMPTY_STATS, eggs: 2 } });
    const remote = game([], { stats: { ...EMPTY_STATS, eggs: 1 } });
    assert.strictEqual(mergeStates(base, local, remote).stats.eggs, 3);
  });

  test('una partida antigua sin guardería se lee bien', async () => {
    const memento = new FakeMemento();
    await memento.update('pokemonCompanion.state', {
      coins: 1,
      balls: {},
      captured: [],
      generationsUnlocked: 1,
      updatedAt: 1,
    });
    const s = new StateManager(memento).get();
    assert.strictEqual(s.nursery, undefined);
    assert.strictEqual(s.stats.eggs, 0);
  });
});
