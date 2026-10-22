import * as assert from 'assert';
import {
  GENERATIONS,
  UNLOCK_FRACTION,
  generationProgress,
  maxPokemonId,
  requiredToUnlockNext,
  unlockedAfterCaptures,
} from '../game/generations';

// Ids del 1 al n
function ids(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i + 1);
}

suite('generaciones', () => {
  test('las generaciones son consecutivas y sin huecos', () => {
    GENERATIONS.forEach((g, i) => {
      assert.strictEqual(g.number, i + 1);
      if (i > 0) {
        assert.strictEqual(g.firstId, GENERATIONS[i - 1].lastId + 1);
      }
    });
  });

  test('maxPokemonId se limita al rango de generaciones', () => {
    assert.strictEqual(maxPokemonId(1), 151);
    assert.strictEqual(maxPokemonId(0), 151);
    assert.strictEqual(maxPokemonId(9), 1025);
    assert.strictEqual(maxPokemonId(99), 1025);
  });

  test('requiredToUnlockNext usa la fracción de los disponibles', () => {
    assert.strictEqual(requiredToUnlockNext(1), Math.ceil(151 * UNLOCK_FRACTION));
    assert.strictEqual(requiredToUnlockNext(GENERATIONS.length), null);
  });

  test('no se desbloquea hasta llegar al mínimo', () => {
    const required = requiredToUnlockNext(1)!;
    assert.strictEqual(unlockedAfterCaptures(1, ids(required - 1)), 1);
    assert.strictEqual(unlockedAfterCaptures(1, ids(required)), 2);
  });

  test('los repetidos no cuentan', () => {
    const required = requiredToUnlockNext(1)!;
    const repeated = Array.from({ length: required * 2 }, () => 25);
    assert.strictEqual(unlockedAfterCaptures(1, repeated), 1);
  });

  test('puede desbloquear varias generaciones de golpe', () => {
    const required = requiredToUnlockNext(2)!;
    assert.strictEqual(unlockedAfterCaptures(1, ids(required)), 3);
  });

  test('generationProgress calcula lo que falta', () => {
    const required = requiredToUnlockNext(1)!;
    const progress = generationProgress(1, [1, 2, 3, 3]);
    assert.strictEqual(progress.distinct, 3);
    assert.strictEqual(progress.required, required);
    assert.strictEqual(progress.remaining, required - 3);
    assert.strictEqual(progress.next?.number, 2);
  });

  test('con todo desbloqueado no hay siguiente', () => {
    const progress = generationProgress(GENERATIONS.length, [1]);
    assert.strictEqual(progress.next, null);
    assert.strictEqual(progress.remaining, null);
  });
});
