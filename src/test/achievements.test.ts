import * as assert from 'assert';
import { CapturedPokemon, GameState, StateManager } from '../data/state';
import { PokemonData } from '../data/pokeapi';
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_GROUPS,
  TIER_CAPTURE_RATES,
  Tier,
  buildAchievements,
  claimReward,
  newlyCompleted,
  pendingRewards,
  pickRewardPokemon,
  unlockAchievements,
} from '../game/achievements';
import { EMPTY_STATS } from '../game/stats';
import { mergeStates } from '../game/syncMerge';
import { FakeMemento } from './fakeMemento';

function game(overrides: Partial<GameState> = {}): GameState {
  return {
    coins: 0,
    balls: {},
    items: {},
    incenseUntil: 0,
    captured: [],
    generationsUnlocked: 1,
    updatedAt: 1,
    stats: { ...EMPTY_STATS },
    achievements: [],
    achievementsClaimed: [],
    ...overrides,
  };
}

function mon(id: number, shiny = false): CapturedPokemon {
  return { id, name: `P${id}`, spriteUrl: null, ...(shiny ? { shiny: true } : {}) };
}

function ids(list: { id: string }[]): string[] {
  return list.map((a) => a.id);
}

suite('logros', () => {
  test('los logros tienen ids distintos y objetivos positivos', () => {
    assert.strictEqual(new Set(ids(ACHIEVEMENTS)).size, ACHIEVEMENTS.length);
    assert.ok(ACHIEVEMENTS.every((a) => a.target > 0));
  });

  test('una partida nueva no tiene logros', () => {
    assert.deepStrictEqual(newlyCompleted(game()), []);
  });

  test('capturar y evolucionar completan sus logros', () => {
    const s = game({
      captured: [mon(1)],
      stats: { ...EMPTY_STATS, captures: 1, evolutions: 1 },
    });
    assert.deepStrictEqual(ids(newlyCompleted(s)).sort(), ['captures-1', 'evolutions-1']);
  });

  test('las especies distintas no cuentan los repetidos y el variocolor va aparte', () => {
    const copies = Array.from({ length: 12 }, () => mon(1));
    assert.ok(!ids(newlyCompleted(game({ captured: copies }))).includes('species-10'));

    const ten = Array.from({ length: 10 }, (_, i) => mon(i + 1));
    assert.ok(ids(newlyCompleted(game({ captured: ten }))).includes('species-10'));

    const shiny = game({ captured: [mon(1), mon(1, true)] });
    assert.ok(ids(newlyCompleted(shiny)).includes('shiny-1'));
  });

  test('un logro ya apuntado no se vuelve a dar', () => {
    const s = game({
      stats: { ...EMPTY_STATS, captures: 1 },
      achievements: ['captures-1'],
    });
    assert.deepStrictEqual(newlyCompleted(s), []);
  });

  test('unlockAchievements los apunta una sola vez y deja la recompensa pendiente', async () => {
    const state = new StateManager(new FakeMemento());
    await state.update((s) => {
      s.stats.captures = 1;
    });

    const first = await unlockAchievements(state);
    assert.deepStrictEqual(ids(first), ['captures-1']);
    assert.deepStrictEqual(ids(pendingRewards(state.get())), ['captures-1']);
    assert.deepStrictEqual(await unlockAchievements(state), []);

    await claimReward(state, 'captures-1');
    await claimReward(state, 'captures-1');
    assert.deepStrictEqual(state.get().achievementsClaimed, ['captures-1']);
    assert.deepStrictEqual(pendingRewards(state.get()), []);
  });

  test('una partida antigua sin logros se rellena al leerla', async () => {
    const memento = new FakeMemento();
    await memento.update('pokemonCompanion.state', {
      coins: 10,
      balls: {},
      captured: [],
      generationsUnlocked: 1,
      updatedAt: 1,
    });
    const s = new StateManager(memento).get();
    assert.deepStrictEqual(s.achievements, []);
    assert.deepStrictEqual(s.achievementsClaimed, []);
  });

  test('combinar partidas junta los logros y las recompensas cobradas', () => {
    const local = game({ achievements: ['a', 'b'], achievementsClaimed: ['a'] });
    const remote = game({ achievements: ['b', 'c'], achievementsClaimed: ['b'] });
    const merged = mergeStates(undefined, local, remote);
    assert.deepStrictEqual([...merged.achievements].sort(), ['a', 'b', 'c']);
    assert.deepStrictEqual([...merged.achievementsClaimed].sort(), ['a', 'b']);
  });
});

function fakeFetch(captureRates: Record<number, number>) {
  return async (id: number): Promise<PokemonData> => {
    if (!(id in captureRates)) {
      throw new Error('sin datos');
    }
    return {
      id,
      name: `P${id}`,
      captureRate: captureRates[id],
      types: [],
      spriteUrl: null,
      animatedSpriteUrl: null,
      shinySpriteUrl: null,
      animatedShinySpriteUrl: null,
    };
  };
}

// Aleatorio repetible: recorre los ids 1, 2, 3…
function counter(maxId: number): () => number {
  let next = 0;
  return () => (next++ % maxId) / maxId;
}

suite('recompensas de logros', () => {
  const rates: Record<number, number> = { 1: 255, 2: 120, 3: 45, 4: 3 };

  test('cada nivel elige un Pokémon de su rango de dificultad', async () => {
    for (const tier of [1, 2, 3, 4] as Tier[]) {
      const [min, max] = TIER_CAPTURE_RATES[tier];
      const picked = await pickRewardPokemon(tier, 4, fakeFetch(rates), counter(4));
      assert.ok(picked.captureRate >= min && picked.captureRate <= max, `nivel ${tier}`);
    }
  });

  test('si nada encaja, se queda con el más cercano', async () => {
    // Solo hay Pokémon fáciles: para el nivel 4 gana el de captureRate más bajo
    const picked = await pickRewardPokemon(4, 2, fakeFetch({ 1: 255, 2: 190 }), counter(2));
    assert.strictEqual(picked.captureRate, 190);
  });

  test('si falla toda la red, lanza error', async () => {
    await assert.rejects(pickRewardPokemon(1, 5, fakeFetch({}), counter(5)));
  });
});

suite('pestaña de logros', () => {
  test('todos los logros están en algún grupo y no se repiten', () => {
    const data = buildAchievements(game());
    const all = data.groups.flatMap((g) => g.achievements.map((a) => a.id));
    assert.strictEqual(data.total, ACHIEVEMENTS.length);
    assert.strictEqual(all.length, ACHIEVEMENTS.length);
    assert.strictEqual(new Set(all).size, ACHIEVEMENTS.length);
    assert.strictEqual(data.groups.length, ACHIEVEMENT_GROUPS.length);
    assert.ok(data.groups.every((g) => g.achievements.length > 0));
  });

  test('el progreso se limita al objetivo y marca conseguido y cobrado', () => {
    const s = game({
      stats: { ...EMPTY_STATS, captures: 40 },
      achievements: ['captures-1'],
      achievementsClaimed: ['captures-1'],
    });
    const data = buildAchievements(s);
    const find = (id: string) =>
      data.groups.flatMap((g) => g.achievements).find((a) => a.id === id)!;

    assert.deepStrictEqual(
      [find('captures-1').done, find('captures-1').claimed, find('captures-1').current],
      [true, true, 1]
    );
    // Cumplido pero sin apuntar todavía: se ve conseguido, con la recompensa pendiente
    assert.deepStrictEqual([find('captures-25').done, find('captures-25').claimed], [true, false]);
    assert.deepStrictEqual([find('captures-100').done, find('captures-100').current], [false, 40]);
    assert.strictEqual(data.done, 2);
  });

  test('cuenta las recompensas pendientes', () => {
    const s = game({ achievements: ['a'], achievementsClaimed: [] });
    // 'a' no existe: no cuenta; con uno real sí
    assert.strictEqual(buildAchievements(s).pendingRewards, 0);
    const real = game({ achievements: ['captures-1'], achievementsClaimed: [] });
    assert.strictEqual(buildAchievements(real).pendingRewards, 1);
  });
});
