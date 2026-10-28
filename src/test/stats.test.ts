import * as assert from 'assert';
import { StateManager } from '../data/state';
import { rewardForCapture, rewardForSave } from '../game/economy';
import { BALLS } from '../game/items';
import { buyBall, sellDuplicate } from '../game/shop';
import {
  EMPTY_STATS,
  GameStats,
  captureRate,
  currentStreak,
  dayKey,
  recordActivity,
} from '../game/stats';
import { FakeMemento } from './fakeMemento';

function fresh(): GameStats {
  return { ...EMPTY_STATS };
}

suite('estadísticas: racha', () => {
  test('dayKey usa la fecha local con ceros', () => {
    assert.strictEqual(dayKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  });

  test('el primer día empieza la racha', () => {
    const stats = fresh();
    recordActivity(stats, '2026-10-20');
    assert.deepStrictEqual(
      [stats.streak, stats.bestStreak, stats.activeDays, stats.lastActiveDay],
      [1, 1, 1, '2026-10-20']
    );
  });

  test('el mismo día no cuenta dos veces', () => {
    const stats = fresh();
    recordActivity(stats, '2026-10-20');
    recordActivity(stats, '2026-10-20');
    assert.strictEqual(stats.activeDays, 1);
    assert.strictEqual(stats.streak, 1);
  });

  test('días seguidos suman, también al cambiar de mes y de año', () => {
    const stats = fresh();
    for (const day of ['2026-12-30', '2026-12-31', '2027-01-01']) {
      recordActivity(stats, day);
    }
    assert.strictEqual(stats.streak, 3);
    assert.strictEqual(stats.bestStreak, 3);
  });

  test('saltarse un día reinicia la racha pero conserva la mejor', () => {
    const stats = fresh();
    for (const day of ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05']) {
      recordActivity(stats, day);
    }
    assert.strictEqual(stats.streak, 1);
    assert.strictEqual(stats.bestStreak, 3);
    assert.strictEqual(stats.activeDays, 4);
  });

  test('currentStreak solo sigue viva si programaste hoy o ayer', () => {
    const stats = fresh();
    recordActivity(stats, '2026-10-01');
    recordActivity(stats, '2026-10-02');
    assert.strictEqual(currentStreak(stats, '2026-10-02'), 2);
    assert.strictEqual(currentStreak(stats, '2026-10-03'), 2);
    assert.strictEqual(currentStreak(stats, '2026-10-04'), 0);
  });

  test('captureRate', () => {
    assert.strictEqual(captureRate(fresh()), null);
    assert.strictEqual(captureRate({ ...fresh(), encounters: 3, captures: 2 }), 67);
  });
});

suite('estadísticas: contadores', () => {
  test('una partida antigua sin estadísticas empieza a 0', async () => {
    const memento = new FakeMemento();
    await memento.update('pokemonCompanion.state', {
      coins: 10,
      balls: {},
      captured: [],
      generationsUnlocked: 1,
      updatedAt: 1,
    });
    assert.deepStrictEqual(new StateManager(memento).get().stats, EMPTY_STATS);
  });

  test('guardar apunta monedas, caracteres y el día', async () => {
    const state = new StateManager(new FakeMemento());
    const coins = await rewardForSave(state, 100, new Date(2026, 9, 22));
    const { stats } = state.get();

    assert.strictEqual(stats.coinsEarned, coins);
    assert.strictEqual(stats.charsWritten, 100);
    assert.strictEqual(stats.lastActiveDay, '2026-10-22');
  });

  test('un guardado sin monedas no cuenta como día programando', async () => {
    const state = new StateManager(new FakeMemento());
    await rewardForSave(state, 1);
    assert.strictEqual(state.get().stats.activeDays, 0);
  });

  test('capturar, comprar y vender', async () => {
    const state = new StateManager(new FakeMemento());
    const pokemon = {
      id: 19,
      name: 'Rattata',
      captureRate: 255,
      types: [],
      spriteUrl: null,
      animatedSpriteUrl: null,
      shinySpriteUrl: null,
      animatedShinySpriteUrl: null,
    };
    const first = await rewardForCapture(state, pokemon, false);
    const second = await rewardForCapture(state, pokemon, false);
    const sale = await sellDuplicate(state, 19);
    assert.ok(sale.ok);

    const pokeball = BALLS.find((b) => b.id === 'pokeball')!;
    await buyBall(state, pokeball, 1);

    const { stats } = state.get();
    assert.strictEqual(stats.captures, 2);
    assert.strictEqual(stats.coinsEarned, first.coins + second.coins + sale.earned);
    assert.strictEqual(stats.coinsSpent, pokeball.price!);
  });
});
