import * as assert from 'assert';
import { CapturedPokemon, GameState, StateManager } from '../data/state';
import { PokemonData } from '../data/pokeapi';
import { coinsForChanges, rewardForCapture, rewardForSave } from '../game/economy';
import { catchProbability, rollShiny } from '../game/encounter';
import { evolvePokemon } from '../game/evolution';
import {
  PERK_BY_TYPE,
  PERK_TEXTS,
  PerkKind,
  activePerk,
  clearFavorite,
  findFavorite,
  isFavorite,
  ownedSpecies,
  perkOfType,
  perkValue,
  setFavorite,
} from '../game/favorite';
import { BALLS } from '../game/items';
import { rollStoneDrop } from '../game/objects';
import { EMPTY_STATS } from '../game/stats';
import { mergeStates } from '../game/syncMerge';
import { FakeMemento } from './fakeMemento';

function mon(id: number, types: string[] = ['normal'], shiny = false): CapturedPokemon {
  return {
    id,
    name: `P${id}`,
    spriteUrl: null,
    captureRate: 120,
    types,
    ...(shiny ? { shiny: true } : {}),
  };
}

function data(id: number, types: string[], captureRate = 45): PokemonData {
  return {
    id,
    name: `P${id}`,
    captureRate,
    types,
    spriteUrl: `n${id}`,
    animatedSpriteUrl: null,
    shinySpriteUrl: `s${id}`,
    animatedShinySpriteUrl: null,
  };
}

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

async function stateWith(captured: CapturedPokemon[], coins = 0): Promise<StateManager> {
  const state = new StateManager(new FakeMemento());
  await state.update((s) => {
    s.captured = captured;
    s.coins = coins;
  });
  return state;
}

const ALL_TYPES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
];
const PERKS: PerkKind[] = ['coinsSave', 'coinsCapture', 'encounter', 'capture', 'shiny', 'stone'];

// Una partida con un favorito del tipo dado
function withFavorite(type: string): GameState {
  return game({ captured: [mon(1, [type])], favorite: { id: 1, shiny: false, type } });
}

suite('favorito: efectos por tipo', () => {
  test('los 18 tipos tienen un efecto y cada efecto lo comparten 3 tipos', () => {
    for (const type of ALL_TYPES) {
      assert.ok(perkOfType(type), type);
    }
    assert.strictEqual(Object.keys(PERK_BY_TYPE).length, ALL_TYPES.length);
    for (const perk of PERKS) {
      assert.strictEqual(ALL_TYPES.filter((t) => perkOfType(t) === perk).length, 3, perk);
      assert.ok(PERK_TEXTS[perk].length > 0);
    }
    assert.strictEqual(perkOfType('desconocido'), undefined);
    assert.strictEqual(perkOfType(undefined), undefined);
  });

  test('sin favorito, todos los efectos son neutros', () => {
    const s = game();
    assert.strictEqual(activePerk(s), undefined);
    for (const perk of PERKS) {
      const neutral = perkValue(s, perk);
      assert.ok(neutral === 0 || neutral === 1, perk);
    }
  });

  test('con favorito solo está activo el efecto de su tipo', () => {
    const s = withFavorite('electric'); // coinsSave
    assert.strictEqual(activePerk(s), 'coinsSave');
    assert.ok(perkValue(s, 'coinsSave') > 0);
    assert.strictEqual(perkValue(s, 'coinsCapture'), 0);
    assert.strictEqual(perkValue(s, 'shiny'), 1);
    assert.strictEqual(perkValue(withFavorite('ghost'), 'shiny'), 1.5);
  });

  test('si ya no tienes al favorito, no da efecto', () => {
    const s = game({ captured: [mon(2)], favorite: { id: 1, shiny: false, type: 'electric' } });
    assert.strictEqual(findFavorite(s), undefined);
    assert.strictEqual(activePerk(s), undefined);
    assert.strictEqual(perkValue(s, 'coinsSave'), 0);
  });

  test('el variocolor es un favorito distinto del normal', () => {
    const s = game({
      captured: [mon(1, ['fire'], true)],
      favorite: { id: 1, shiny: false, type: 'fire' },
    });
    assert.strictEqual(findFavorite(s), undefined); // solo tienes el variocolor
    assert.ok(isFavorite(s, 1, false));
    assert.ok(!isFavorite(s, 1, true));
  });
});

suite('favorito: elegir', () => {
  test('ownedSpecies agrupa, separa el variocolor, ordena y recuerda el tipo', () => {
    const list = ownedSpecies([mon(25, ['electric']), mon(4, ['fire']), mon(25), mon(4, ['fire'], true)]);
    assert.deepStrictEqual(
      list.map((s) => `${s.id}${s.shiny ? '★' : ''}`),
      ['4', '4★', '25']
    );
    assert.strictEqual(list[2].type, 'electric');
  });

  test('solo se puede elegir un Pokémon que tienes', async () => {
    const state = await stateWith([mon(4, ['fire'])]);
    assert.strictEqual((await setFavorite(state, 7, false, 'water')).ok, false);
    assert.strictEqual((await setFavorite(state, 4, true, 'fire')).ok, false); // no tienes el variocolor
    assert.strictEqual(state.get().favorite, undefined);

    const ok = await setFavorite(state, 4, false, 'fire');
    assert.deepStrictEqual(ok, { ok: true, name: 'P4', perk: 'encounter' });
    assert.deepStrictEqual(state.get().favorite, { id: 4, shiny: false, type: 'fire' });
  });

  test('quitar el favorito', async () => {
    const state = await stateWith([mon(4, ['fire'])]);
    await setFavorite(state, 4, false, 'fire');
    await clearFavorite(state);
    assert.strictEqual(state.get().favorite, undefined);
  });

  test('una partida antigua sin favorito se lee bien', async () => {
    const memento = new FakeMemento();
    await memento.update('pokemonCompanion.state', {
      coins: 1,
      balls: {},
      captured: [{ id: 1, name: 'Bulbasaur', spriteUrl: null }],
      generationsUnlocked: 1,
      updatedAt: 1,
    });
    const s = new StateManager(memento).get();
    assert.strictEqual(s.favorite, undefined);
    assert.strictEqual(activePerk(s), undefined);
  });
});

suite('favorito: aplicación de los efectos', () => {
  test('monedas al guardar: +5 % (eléctrico), también sumado a la Moneda Amuleto', () => {
    assert.ok(coinsForChanges(300, 0.05) > coinsForChanges(300, 0));
    assert.strictEqual(coinsForChanges(300, 0.05 + 0.1), Math.floor((300 * 1.15) / 15));
  });

  test('rewardForSave paga más con un favorito eléctrico', async () => {
    const plain = await stateWith([mon(1, ['grass'])]);
    await setFavorite(plain, 1, false, 'grass');
    const boosted = await stateWith([mon(1, ['electric'])]);
    await setFavorite(boosted, 1, false, 'electric');

    const base = await rewardForSave(plain, 1000);
    const more = await rewardForSave(boosted, 1000);
    assert.ok(more > base, `${more} > ${base}`);
  });

  test('monedas al capturar: +20 % (tierra) y se guardan los tipos', async () => {
    const plain = await stateWith([mon(1, ['grass'])]);
    await setFavorite(plain, 1, false, 'grass');
    const boosted = await stateWith([mon(1, ['ground'])]);
    await setFavorite(boosted, 1, false, 'ground');

    const target = data(10, ['bug'], 45);
    const base = await rewardForCapture(plain, target, false);
    const more = await rewardForCapture(boosted, target, false);
    assert.ok(more.coins > base.coins);
    assert.strictEqual(more.coins, Math.round(base.coins * 1.2));
    assert.deepStrictEqual(boosted.get().captured.at(-1)?.types, ['bug']);
  });

  test('probabilidad de encuentro, captura, variocolor y piedras', () => {
    const ball = BALLS.find((b) => b.id === 'pokeball')!;
    const ctx = { throwNumber: 1, hour: 12 };
    const base = catchProbability(100, ball, ctx);
    const boosted = catchProbability(100, ball, { ...ctx, captureBonus: 1.1 });
    assert.ok(Math.abs(boosted - base * 1.1) < 1e-9);
    assert.strictEqual(catchProbability(255, ball, { ...ctx, captureBonus: 1.1 }), 1);

    for (let i = 0; i < 50; i += 1) {
      assert.strictEqual(rollShiny(true, 0), false);
      assert.strictEqual(rollShiny(true, 1000), true);
    }
    assert.strictEqual(rollStoneDrop(['fire'], () => 0.5), null); // 0,5 está muy por encima del 5 %
  });

  test('el doble de piedras: lo que no sale con el 5 % sale con el 10 %', () => {
    assert.strictEqual(rollStoneDrop(['fire'], () => 0.07), null);
    assert.strictEqual(rollStoneDrop(['fire'], () => 0.07, 2), 'fire-stone');
  });
});

suite('favorito: evolución y sincronización', () => {
  test('si evoluciona su última copia, el favorito evoluciona y toma el tipo nuevo', async () => {
    const state = await stateWith([mon(4, ['fire'])], 1000);
    await setFavorite(state, 4, false, 'fire');
    await evolvePokemon(state, 4, false, data(5, ['water']));
    assert.deepStrictEqual(state.get().favorite, { id: 5, shiny: false, type: 'water' });
    assert.deepStrictEqual(state.get().captured[0].types, ['water']);
  });

  test('si quedan más copias, el favorito se queda como estaba', async () => {
    const state = await stateWith([mon(4, ['fire']), mon(4, ['fire'])], 1000);
    await setFavorite(state, 4, false, 'fire');
    await evolvePokemon(state, 4, false, data(5, ['water']));
    assert.deepStrictEqual(state.get().favorite, { id: 4, shiny: false, type: 'fire' });
  });

  test('evolucionar otro Pokémon no mueve al favorito', async () => {
    const state = await stateWith([mon(4, ['fire']), mon(7, ['water'])], 1000);
    await setFavorite(state, 7, false, 'water');
    await evolvePokemon(state, 4, false, data(5, ['fire']));
    assert.deepStrictEqual(state.get().favorite, { id: 7, shiny: false, type: 'water' });
  });

  test('combinar: el lado que cambió de favorito gana', () => {
    const base = game({ favorite: { id: 1, shiny: false, type: 'fire' } });
    const local = game({ favorite: { id: 1, shiny: false, type: 'fire' } });
    const remote = game({ favorite: { id: 4, shiny: false, type: 'water' } });
    assert.strictEqual(mergeStates(base, local, remote).favorite?.id, 4);
    assert.strictEqual(mergeStates(base, remote, local).favorite?.id, 4);
  });

  test('combinar: si cambiaron los dos, el más reciente; sin favorito no se añade', () => {
    const base = game({ favorite: { id: 1, shiny: false, type: 'fire' } });
    const older = game({ updatedAt: 1, favorite: { id: 4, shiny: false, type: 'water' } });
    const newer = game({ updatedAt: 9, favorite: { id: 7, shiny: false, type: 'grass' } });
    assert.strictEqual(mergeStates(base, older, newer).favorite?.id, 7);

    const none = mergeStates(undefined, game(), game());
    assert.ok(!('favorite' in none));
  });
});
