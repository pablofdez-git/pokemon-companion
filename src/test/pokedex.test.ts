import * as assert from 'assert';
import { CapturedPokemon, GameState } from '../data/state';
import { buildPokedex, parseSpeciesInfo, speciesSpriteUrl } from '../game/pokedex';
import { typeName } from '../game/types';
import { EMPTY_STATS } from '../game/stats';

function state(captured: CapturedPokemon[], generationsUnlocked = 1): GameState {
  return {
    coins: 0,
    balls: {},
    items: {},
    incenseUntil: 0,
    captured,
    generationsUnlocked,
    updatedAt: 0,
    achievements: [],
    achievementsClaimed: [],
    stats: { ...EMPTY_STATS },
  };
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

suite('pokédex: ficha de cada especie', () => {
  test('guarda los tipos (con su nombre en español), la fecha más antigua y los variocolores', () => {
    const dex = buildPokedex(
      state([
        caught(25, { types: ['electric'], capturedAt: 3000 }),
        caught(25, { capturedAt: 1000 }),
        caught(25, { shiny: true, capturedAt: 2000 }),
        caught(1),
      ])
    );
    const [bulbasaur, pikachu] = [dex.generations[0].entries[0], dex.generations[0].entries[24]];

    assert.deepStrictEqual(pikachu.types, [{ id: 'electric', name: 'eléctrico' }]);
    assert.strictEqual(pikachu.firstCaughtAt, 1000);
    assert.strictEqual(pikachu.count, 3);
    assert.strictEqual(pikachu.shinyCount, 1);
    assert.strictEqual(pikachu.shinySpriteUrl, speciesSpriteUrl(25, true));

    // Una captura antigua no tiene tipos ni fecha: la ficha lo dice en vez de inventarlo
    assert.deepStrictEqual(bulbasaur.types, []);
    assert.strictEqual(bulbasaur.firstCaughtAt, null);
    assert.strictEqual(bulbasaur.shinyCount, 0);
  });

  test('las especies sin capturar no llevan datos de ficha', () => {
    const missing = buildPokedex(state([])).generations[0].entries[0];
    assert.deepStrictEqual(missing.types, []);
    assert.strictEqual(missing.firstCaughtAt, null);
    assert.strictEqual(missing.shinyCount, 0);
  });

  test('typeName traduce los tipos y deja pasar los desconocidos', () => {
    assert.strictEqual(typeName('fire'), 'fuego');
    assert.strictEqual(typeName('psychic'), 'psíquico');
    assert.strictEqual(typeName('stellar'), 'stellar');
  });
});

suite('pokédex: descripción de la especie', () => {
  const entry = (language: string, text: string) => ({ flavor_text: text, language: { name: language } });
  const genus = (language: string, text: string) => ({ genus: text, language: { name: language } });

  test('prefiere el español y la última entrada, y limpia los saltos de línea', () => {
    const info = parseSpeciesInfo({
      genera: [genus('en', 'Mouse Pokémon'), genus('es', 'Pokémon Ratón')],
      flavor_text_entries: [
        entry('es', 'Texto\nviejo.'),
        entry('en', 'English text.'),
        entry('es', 'Cuando varios\nde ellos\fse juntan,   se   cargan.'),
      ],
    });
    assert.strictEqual(info.genus, 'Pokémon Ratón');
    assert.strictEqual(info.description, 'Cuando varios de ellos se juntan, se cargan.');
  });

  test('sin español usa el inglés; sin nada, null', () => {
    const english = parseSpeciesInfo({
      genera: [genus('en', 'Mouse Pokémon')],
      flavor_text_entries: [entry('en', 'English text.')],
    });
    assert.deepStrictEqual(english, { genus: 'Mouse Pokémon', description: 'English text.' });

    const none = parseSpeciesInfo({ genera: [], flavor_text_entries: [entry('ja', 'テキスト')] });
    assert.deepStrictEqual(none, { genus: null, description: null });
  });
});
