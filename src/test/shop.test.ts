import * as assert from 'assert';
import { CapturedPokemon, StateManager } from '../data/state';
import { sellPrice } from '../game/economy';
import { BALLS } from '../game/items';
import { buyBall, sellDuplicate } from '../game/shop';
import { FakeMemento } from './fakeMemento';

const greatBall = BALLS.find((b) => b.id === 'greatball')!;

function pikachu(shiny = false): CapturedPokemon {
  return {
    id: 25,
    name: 'Pikachu',
    spriteUrl: null,
    captureRate: 190,
    ...(shiny ? { shiny: true } : {}),
  };
}

async function stateWith(
  coins: number,
  captured: CapturedPokemon[] = []
): Promise<StateManager> {
  const state = new StateManager(new FakeMemento());
  await state.update((s) => {
    s.coins = coins;
    s.captured = captured;
  });
  return state;
}

suite('tienda', () => {
  test('comprar descuenta monedas y suma balls', async () => {
    const state = await stateWith(100);
    const result = await buyBall(state, greatBall, 2);

    assert.deepStrictEqual(result, { ok: true, spent: greatBall.price * 2 });
    assert.strictEqual(state.get().coins, 100 - greatBall.price * 2);
    assert.strictEqual(state.get().balls.greatball, 2);
  });

  test('no se puede comprar sin monedas suficientes', async () => {
    const state = await stateWith(greatBall.price - 1);
    const result = await buyBall(state, greatBall, 1);

    assert.strictEqual(result.ok, false);
    assert.strictEqual(state.get().coins, greatBall.price - 1);
    assert.strictEqual(state.get().balls.greatball, undefined);
  });

  test('cantidades no válidas', async () => {
    const state = await stateWith(1000);
    assert.strictEqual((await buyBall(state, greatBall, 0)).ok, false);
    assert.strictEqual((await buyBall(state, greatBall, 1.5)).ok, false);
    assert.strictEqual(state.get().coins, 1000);
  });
});

suite('venta de repetidos', () => {
  test('vende una copia y paga su precio', async () => {
    const state = await stateWith(0, [pikachu(), pikachu()]);
    const result = await sellDuplicate(state, 25);

    assert.deepStrictEqual(result, { ok: true, name: 'Pikachu', earned: sellPrice(190) });
    assert.strictEqual(state.get().captured.length, 1);
    assert.strictEqual(state.get().coins, sellPrice(190));
  });

  test('no vende la última copia', async () => {
    const state = await stateWith(0, [pikachu()]);
    const result = await sellDuplicate(state, 25);

    assert.strictEqual(result.ok, false);
    assert.strictEqual(state.get().captured.length, 1);
  });

  test('el variocolor no cuenta como copia ni se vende', async () => {
    const state = await stateWith(0, [pikachu(), pikachu(true)]);
    assert.strictEqual((await sellDuplicate(state, 25)).ok, false);

    const withTwo = await stateWith(0, [pikachu(), pikachu(true), pikachu()]);
    assert.strictEqual((await sellDuplicate(withTwo, 25)).ok, true);
    const left = withTwo.get().captured;
    assert.strictEqual(left.length, 2);
    assert.ok(left.some((c) => c.shiny));
  });

  test('un Pokémon que no tienes', async () => {
    const state = await stateWith(0);
    const result = await sellDuplicate(state, 25);
    assert.deepStrictEqual(result, { ok: false, reason: 'No tienes ese Pokémon.' });
  });
});
