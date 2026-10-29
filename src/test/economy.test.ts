import * as assert from 'assert';
import { PokemonData } from '../data/pokeapi';
import { StateManager } from '../data/state';
import {
  CHARS_PER_COIN,
  MAX_EXTRA_CAPTURE_REWARD,
  MIN_CAPTURE_REWARD,
  MIN_CHARS_TO_REWARD,
  SHINY_BONUS_COINS,
  captureReward,
  coinsForChanges,
  rewardForCapture,
  sellPrice,
} from '../game/economy';
import { requiredToUnlockNext } from '../game/generations';
import { FakeMemento } from './fakeMemento';

function pokemon(id: number, captureRate = 45): PokemonData {
  return {
    id,
    name: `Pokemon${id}`,
    captureRate,
    types: [],
    spriteUrl: 'normal.png',
    animatedSpriteUrl: null,
    shinySpriteUrl: 'shiny.png',
    animatedShinySpriteUrl: null,
  };
}

suite('economía', () => {
  test('coinsForChanges respeta el mínimo y redondea hacia abajo', () => {
    assert.strictEqual(coinsForChanges(0), 0);
    assert.strictEqual(coinsForChanges(MIN_CHARS_TO_REWARD - 1), 0);
    assert.strictEqual(coinsForChanges(CHARS_PER_COIN * 3), 3);
    assert.strictEqual(coinsForChanges(CHARS_PER_COIN * 3 + CHARS_PER_COIN - 1), 3);
  });

  test('captureReward va del mínimo (fácil) al máximo (difícil)', () => {
    assert.strictEqual(captureReward(255), MIN_CAPTURE_REWARD);
    assert.strictEqual(captureReward(0), MIN_CAPTURE_REWARD + MAX_EXTRA_CAPTURE_REWARD);
    assert.ok(captureReward(45) > captureReward(190));
  });

  test('vender siempre paga algo, pero menos que capturar', () => {
    for (const rate of [0, 3, 45, 120, 190, 255]) {
      assert.ok(sellPrice(rate) >= 1);
      assert.ok(sellPrice(rate) < captureReward(rate));
    }
    assert.ok(sellPrice() >= 1); // capturas antiguas sin captureRate
  });

  test('rewardForCapture guarda la captura y paga', async () => {
    const state = new StateManager(new FakeMemento());
    const result = await rewardForCapture(state, pokemon(1), false);

    const s = state.get();
    assert.strictEqual(result.coins, captureReward(45));
    assert.strictEqual(s.coins, captureReward(45));
    assert.strictEqual(s.captured.length, 1);
    assert.strictEqual(s.captured[0].spriteUrl, 'normal.png');
    assert.strictEqual(s.captured[0].shiny, undefined);
    assert.deepStrictEqual(result.newGenerations, []);
  });

  test('rewardForCapture apunta la fecha de captura', async () => {
    const state = new StateManager(new FakeMemento());
    const before = Date.now();
    await rewardForCapture(state, pokemon(1), false);
    const at = state.get().captured[0].capturedAt;
    assert.ok(at !== undefined && at >= before && at <= Date.now());
  });

  test('un variocolor da bonus y guarda su sprite', async () => {
    const state = new StateManager(new FakeMemento());
    const result = await rewardForCapture(state, pokemon(1), true);

    const captured = state.get().captured[0];
    assert.strictEqual(result.coins, captureReward(45) + SHINY_BONUS_COINS);
    assert.strictEqual(captured.shiny, true);
    assert.strictEqual(captured.spriteUrl, 'shiny.png');
  });

  test('la captura que completa el mínimo desbloquea la generación', async () => {
    const state = new StateManager(new FakeMemento());
    const required = requiredToUnlockNext(1)!;
    await state.update((s) => {
      for (let id = 1; id < required; id += 1) {
        s.captured.push({ id, name: `P${id}`, spriteUrl: null });
      }
    });

    const result = await rewardForCapture(state, pokemon(required), false);
    assert.deepStrictEqual(result.newGenerations.map((g) => g.number), [2]);
    assert.strictEqual(state.get().generationsUnlocked, 2);
  });
});
