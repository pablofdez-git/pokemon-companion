import * as assert from 'assert';
import { GameState, StateManager, normalizeState } from '../data/state';
import { coinsForChanges, rewardForSave } from '../game/economy';
import {
  AMULET_COIN_BONUS,
  FLUTE_WINDOW_MINUTES,
  INCENSE_MINUTES,
  OBJECTS,
  STONE_DROP_CHANCE,
  STONE_IDS,
  canRecall,
  encounterChanceWithIncense,
  findObject,
  incenseActive,
  rollStoneDrop,
  useFlute,
  useIncense,
} from '../game/objects';
import { buyObject } from '../game/shop';
import { mergeStates } from '../game/syncMerge';
import { FakeMemento } from './fakeMemento';

const MINUTE = 60_000;

async function stateWith(coins: number, items: Record<string, number> = {}): Promise<StateManager> {
  const state = new StateManager(new FakeMemento());
  await state.update((s) => {
    s.coins = coins;
    s.items = items;
  });
  return state;
}

// Devuelve los valores dados en orden, como si fueran Math.random()
function sequence(...values: number[]): () => number {
  return () => values.shift() ?? 0;
}

suite('objetos', () => {
  test('cada objeto tiene un id distinto y precio positivo', () => {
    assert.strictEqual(new Set(OBJECTS.map((o) => o.id)).size, OBJECTS.length);
    assert.ok(OBJECTS.every((o) => o.price > 0));
    assert.ok(STONE_IDS.length >= 10);
  });

  test('comprar objetos descuenta monedas y los suma', async () => {
    const state = await stateWith(500);
    const incense = findObject('incense')!;
    const result = await buyObject(state, incense, 2);

    assert.deepStrictEqual(result, { ok: true, spent: incense.price * 2 });
    assert.strictEqual(state.get().items.incense, 2);
    assert.strictEqual(state.get().stats.coinsSpent, incense.price * 2);
  });

  test('la Moneda Amuleto solo se compra una vez', async () => {
    const amulet = findObject('amulet-coin')!;
    const state = await stateWith(amulet.price * 3);

    assert.strictEqual((await buyObject(state, amulet, 2)).ok, false);
    assert.strictEqual((await buyObject(state, amulet, 1)).ok, true);
    assert.strictEqual((await buyObject(state, amulet, 1)).ok, false);
    assert.strictEqual(state.get().items['amulet-coin'], 1);
    assert.strictEqual(state.get().coins, amulet.price * 2);
  });

  test('sin monedas no se compra', async () => {
    const state = await stateWith(10);
    assert.strictEqual((await buyObject(state, findObject('fire-stone')!, 1)).ok, false);
    assert.strictEqual(state.get().coins, 10);
  });
});

suite('Incienso', () => {
  test('dura lo indicado y no se puede encender otro a la vez', async () => {
    const state = await stateWith(0, { incense: 2 });
    const now = 1_000_000;

    const first = await useIncense(state, now);
    assert.ok(first.ok && first.until === now + INCENSE_MINUTES * MINUTE);
    assert.ok(incenseActive(state.get(), now + INCENSE_MINUTES * MINUTE - 1));
    assert.ok(!incenseActive(state.get(), now + INCENSE_MINUTES * MINUTE));

    assert.strictEqual((await useIncense(state, now + MINUTE)).ok, false);
    assert.strictEqual(state.get().items.incense, 1);

    // Cuando se apaga, se puede encender el siguiente
    assert.ok((await useIncense(state, now + INCENSE_MINUTES * MINUTE)).ok);
    assert.strictEqual(state.get().items.incense, 0);
  });

  test('sin Incienso no se enciende', async () => {
    const state = await stateWith(0);
    assert.strictEqual((await useIncense(state)).ok, false);
  });

  test('dobla la probabilidad de encuentro sin pasar de 1', () => {
    assert.strictEqual(encounterChanceWithIncense(0.25, false), 0.25);
    assert.strictEqual(encounterChanceWithIncense(0.25, true), 0.5);
    assert.strictEqual(encounterChanceWithIncense(0.8, true), 1);
  });
});

suite('Moneda Amuleto', () => {
  test('da un 10 % más y respeta el mínimo de caracteres', () => {
    assert.strictEqual(coinsForChanges(150), 10);
    assert.strictEqual(coinsForChanges(150, AMULET_COIN_BONUS), 11);
    assert.strictEqual(coinsForChanges(19, AMULET_COIN_BONUS), 0);
  });

  test('se aplica al guardar solo si la tienes', async () => {
    const without = await stateWith(0);
    const withAmulet = await stateWith(0, { 'amulet-coin': 1 });
    assert.strictEqual(await rewardForSave(without, 1500), 100);
    assert.strictEqual(await rewardForSave(withAmulet, 1500), 110);
  });
});

suite('piedras', () => {
  test('casi nunca llevan piedra', () => {
    assert.strictEqual(rollStoneDrop(['fire'], sequence(STONE_DROP_CHANCE)), null);
  });

  test('la piedra es la de su tipo', () => {
    assert.strictEqual(rollStoneDrop(['fire'], sequence(0)), 'fire-stone');
    assert.strictEqual(rollStoneDrop(['poison', 'grass'], sequence(0)), 'leaf-stone');
    assert.strictEqual(rollStoneDrop(['electric'], sequence(0)), 'thunder-stone');
  });

  test('si su tipo no tiene piedra, una al azar', () => {
    assert.strictEqual(rollStoneDrop(['rock'], sequence(0, 0)), STONE_IDS[0]);
    assert.strictEqual(rollStoneDrop(['rock'], sequence(0, 0.999)), STONE_IDS[STONE_IDS.length - 1]);
  });
});

suite('Pokéflauta', () => {
  const fled = { id: 25, name: 'Pikachu', shiny: false, at: 1_000_000 };

  test('solo llama a los que huyeron hace poco', () => {
    assert.ok(canRecall(fled, fled.at + FLUTE_WINDOW_MINUTES * MINUTE));
    assert.ok(!canRecall(fled, fled.at + FLUTE_WINDOW_MINUTES * MINUTE + 1));
    assert.ok(!canRecall(undefined));
  });

  test('se gasta al usarla', async () => {
    const state = await stateWith(0, { 'poke-flute': 1 });
    assert.ok(await useFlute(state));
    assert.ok(!(await useFlute(state)));
    assert.strictEqual(state.get().items['poke-flute'], 0);
  });
});

suite('objetos en la partida', () => {
  test('una partida antigua sin objetos se rellena al leerla', () => {
    const old = new StateManager(new FakeMemento()).get() as Partial<GameState>;
    delete old.items;
    delete old.incenseUntil;
    const fixed = normalizeState(old as GameState);
    assert.deepStrictEqual(fixed.items, {});
    assert.strictEqual(fixed.incenseUntil, 0);
  });

  test('al combinar se suman los objetos y la Moneda Amuleto sigue siendo una', async () => {
    const base = (await stateWith(0, { incense: 1 })).get();
    const local = (await stateWith(0, { incense: 3, 'amulet-coin': 1 })).get();
    const remote = (await stateWith(0, { incense: 1, 'fire-stone': 2, 'amulet-coin': 1 })).get();
    remote.incenseUntil = 5000;

    const merged = normalizeState(mergeStates(base, local, remote));
    assert.strictEqual(merged.items.incense, 3);
    assert.strictEqual(merged.items['fire-stone'], 2);
    assert.strictEqual(merged.items['amulet-coin'], 1);
    assert.strictEqual(merged.incenseUntil, 5000);
  });
});
