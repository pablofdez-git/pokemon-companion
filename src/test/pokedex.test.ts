import * as assert from 'assert';
import { CapturedPokemon, GameState } from '../data/state';
import { buildPokedex, speciesSpriteUrl } from '../game/pokedex';

function state(captured: CapturedPokemon[], generationsUnlocked = 1): GameState {
  return { coins: 0, balls: {}, captured, generationsUnlocked, updatedAt: 0 };
}

function caught(id: number, extra: Partial<CapturedPokemon> = {}): CapturedPokemon {
  return { id, name: `P${id}`, spriteUrl: `normal-${id}.png`, ...extra };
}

suite('pokédex', () => {
  test('sin capturas: todo en silueta en las generaciones desbloqueadas', () => {
    const dex = buildPokedex(state([]));
    assert.strictEqual(dex.caught, 0);
    assert.strictEqual(dex.total, 151);
    assert.strictEqual(dex.generations[0].entries.length, 151);
    assert.ok(dex.generations[0].entries.every((e) => e.name === null));
    assert.strictEqual(dex.generations[0].entries[0].spriteUrl, speciesSpriteUrl(1));
  });

  test('las generaciones bloqueadas no muestran especies', () => {
    const dex = buildPokedex(state([]));
    assert.strictEqual(dex.generations[1].unlocked, false);
    assert.deepStrictEqual(dex.generations[1].entries, []);
    assert.strictEqual(dex.generations[1].total, 100);
  });

  test('agrupa repetidos y cuenta especies distintas', () => {
    const dex = buildPokedex(state([caught(25), caught(25), caught(1)]));
    const pikachu = dex.generations[0].entries[24];

    assert.strictEqual(dex.caught, 2);
    assert.strictEqual(pikachu.name, 'P25');
    assert.strictEqual(pikachu.count, 2);
    assert.strictEqual(pikachu.spriteUrl, 'normal-25.png');
  });

  test('variocolor: estrella y, si solo tienes ese, su sprite', () => {
    const dex = buildPokedex(
      state([
        caught(4, { shiny: true, spriteUrl: 'shiny-4.png' }),
        caught(7, { shiny: true, spriteUrl: 'shiny-7.png' }),
        caught(7),
      ])
    );
    const [charmander, squirtle] = [dex.generations[0].entries[3], dex.generations[0].entries[6]];

    assert.strictEqual(dex.shinies, 2);
    assert.ok(charmander.shiny);
    assert.strictEqual(charmander.spriteUrl, speciesSpriteUrl(4, true));
    assert.ok(squirtle.shiny);
    assert.strictEqual(squirtle.spriteUrl, 'normal-7.png');
    assert.strictEqual(squirtle.count, 2);
  });

  test('capturas de una generación bloqueada cuentan en su sección', () => {
    // Puede pasar con partidas antiguas o tras reiniciar en otro ordenador
    const dex = buildPokedex(state([caught(200)]));
    assert.strictEqual(dex.generations[1].caught, 1);
    assert.strictEqual(dex.caught, 0); // el total solo cuenta lo desbloqueado
  });
});
