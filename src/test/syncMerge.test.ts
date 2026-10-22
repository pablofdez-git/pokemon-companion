import * as assert from 'assert';
import { CapturedPokemon, GameState } from '../data/state';
import { requiredToUnlockNext } from '../game/generations';
import { EMPTY_STATS } from '../game/stats';
import { mergeStates } from '../game/syncMerge';

function game(overrides: Partial<GameState> = {}): GameState {
  return {
    coins: 100,
    balls: { pokeball: 5 },
    captured: [],
    generationsUnlocked: 1,
    updatedAt: 1,
    stats: { ...EMPTY_STATS },
    ...overrides,
  };
}

function mon(id: number, shiny = false): CapturedPokemon {
  return { id, name: `P${id}`, spriteUrl: null, ...(shiny ? { shiny: true } : {}) };
}

// Cuántas copias hay de cada especie (normal y variocolor por separado)
function counts(captured: CapturedPokemon[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const c of captured) {
    const key = `${c.id}${c.shiny ? '★' : ''}`;
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

suite('combinar partidas con base', () => {
  test('una evolución en un lado se junta con una captura en el otro', () => {
    const base = game({ captured: [mon(4), mon(4)] });
    const local = game({ captured: [mon(4), mon(5)], stats: { ...EMPTY_STATS, evolutions: 1 } });
    const remote = game({ captured: [mon(4), mon(4), mon(7)] });
    const merged = mergeStates(base, local, remote);
    assert.deepStrictEqual(counts(merged.captured), { 4: 1, 5: 1, 7: 1 });
    assert.strictEqual(merged.stats.evolutions, 1);
  });

  test('suma los cambios de monedas de los dos lados', () => {
    // Las dos partían de 100: aquí se ganan 50 y allí se gastan 30
    const merged = mergeStates(game(), game({ coins: 150 }), game({ coins: 70 }));
    assert.strictEqual(merged.coins, 120);
  });

  test('balls: compras en un lado, lanzamientos en el otro', () => {
    const base = game({ balls: { pokeball: 5 } });
    const local = game({ balls: { pokeball: 5, greatball: 3 } });
    const remote = game({ balls: { pokeball: 2 } });
    assert.deepStrictEqual(mergeStates(base, local, remote).balls, {
      pokeball: 2,
      greatball: 3,
    });
  });

  test('junta las capturas nuevas de los dos lados', () => {
    const base = game({ captured: [mon(1)] });
    const local = game({ captured: [mon(1), mon(4)] });
    const remote = game({ captured: [mon(1), mon(7), mon(7, true)] });
    assert.deepStrictEqual(counts(mergeStates(base, local, remote).captured), {
      1: 1,
      4: 1,
      7: 1,
      '7★': 1,
    });
  });

  test('un repetido vendido en un lado no reaparece', () => {
    const base = game({ captured: [mon(19), mon(19), mon(19)] });
    const local = game({ captured: [mon(19), mon(19)] }); // vendió uno
    const remote = game({ captured: [mon(19), mon(19), mon(19), mon(25)] });
    assert.deepStrictEqual(counts(mergeStates(base, local, remote).captured), {
      19: 2,
      25: 1,
    });
  });

  test('nunca deja monedas negativas', () => {
    const merged = mergeStates(game(), game({ coins: 10 }), game({ coins: 0 }));
    assert.strictEqual(merged.coins, 0);
  });

  test('los contadores se suman y la racha no se duplica', () => {
    const base = game({ stats: { ...EMPTY_STATS, encounters: 10 } });
    const local = game({
      stats: {
        ...EMPTY_STATS,
        encounters: 12,
        activeDays: 5,
        streak: 3,
        bestStreak: 4,
        lastActiveDay: '2026-10-22',
      },
    });
    const remote = game({
      stats: {
        ...EMPTY_STATS,
        encounters: 13,
        activeDays: 5,
        streak: 3,
        bestStreak: 6,
        lastActiveDay: '2026-10-22',
      },
    });
    const stats = mergeStates(base, local, remote).stats;

    assert.strictEqual(stats.encounters, 15);
    assert.strictEqual(stats.activeDays, 5);
    assert.strictEqual(stats.streak, 3);
    assert.strictEqual(stats.bestStreak, 6);
    assert.strictEqual(stats.lastActiveDay, '2026-10-22');
  });

  test('la racha viene del lado que programó más tarde', () => {
    const local = game({
      stats: { ...EMPTY_STATS, streak: 1, lastActiveDay: '2026-10-20' },
    });
    const remote = game({
      stats: { ...EMPTY_STATS, streak: 4, lastActiveDay: '2026-10-22' },
    });
    const stats = mergeStates(game(), local, remote).stats;
    assert.strictEqual(stats.streak, 4);
    assert.strictEqual(stats.lastActiveDay, '2026-10-22');
  });

  test('la colección combinada puede desbloquear la siguiente generación', () => {
    const required = requiredToUnlockNext(1)!;
    const half = Math.ceil(required / 2);
    const local = game({
      captured: Array.from({ length: half }, (_, i) => mon(i + 1)),
    });
    const remote = game({
      captured: Array.from({ length: required - half }, (_, i) => mon(half + i + 1)),
    });
    assert.strictEqual(mergeStates(game(), local, remote).generationsUnlocked, 2);
  });
});

suite('combinar partidas sin base', () => {
  test('se queda con lo mayor de cada cosa', () => {
    const local = game({
      coins: 150,
      balls: { pokeball: 1, ultraball: 2 },
      captured: [mon(1), mon(1)],
    });
    const remote = game({
      coins: 70,
      balls: { pokeball: 4 },
      captured: [mon(1), mon(4)],
    });
    const merged = mergeStates(undefined, local, remote);

    assert.strictEqual(merged.coins, 150);
    assert.deepStrictEqual(merged.balls, { pokeball: 4, ultraball: 2 });
    assert.deepStrictEqual(counts(merged.captured), { 1: 2, 4: 1 });
  });

  test('combinar dos partidas iguales no cambia nada', () => {
    const same = game({ coins: 42, captured: [mon(1), mon(25, true)] });
    const merged = mergeStates(undefined, same, same);
    assert.strictEqual(merged.coins, 42);
    assert.deepStrictEqual(counts(merged.captured), { 1: 1, '25★': 1 });
  });
});
