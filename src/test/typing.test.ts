import * as assert from 'assert';
import { MAX_IDENTICAL_INSERTS, RepeatFilter, countableChars } from '../game/typing';

const DOC = 'file:///a.ts';

// Total que cuenta una secuencia de inserciones, como las va recibiendo el ActivityTracker
function typed(inserts: string[], filter = new RepeatFilter()): number {
  return inserts.reduce((sum, text) => sum + filter.countable(DOC, text), 0);
}

suite('escritura: qué cuenta para las monedas', () => {
  test('espacios, tabuladores y saltos de línea no cuentan', () => {
    assert.strictEqual(countableChars('a b\n\tc  '), 3);
    assert.strictEqual(countableChars('\n    '), 0);
  });

  test('escribir normal cuenta todo, letras dobles incluidas', () => {
    assert.strictEqual(typed([...'hello world']), 10);
    assert.strictEqual(typed([...'a == b']), 4);
  });

  test('mantener una tecla solo cuenta las primeras repeticiones', () => {
    assert.strictEqual(typed(Array(100).fill('a')), MAX_IDENTICAL_INSERTS);
  });

  test('mantener un paréntesis que se cierra solo tampoco sirve', () => {
    assert.strictEqual(typed(Array(50).fill('()')), 2 * MAX_IDENTICAL_INSERTS);
  });

  test('mantener Espacio, Enter o Tab no cuenta nada', () => {
    assert.strictEqual(typed(Array(50).fill(' ')), 0);
    assert.strictEqual(typed(Array(50).fill('\n    ')), 0);
    assert.strictEqual(typed(Array(50).fill('\t')), 0);
  });

  test('alternar con Retroceso no corta la repetición', () => {
    const inserts: string[] = [];
    for (let i = 0; i < 50; i += 1) {
      inserts.push('a', ''); // el borrado llega como inserción vacía
    }
    assert.strictEqual(typed(inserts), MAX_IDENTICAL_INSERTS);
  });

  test('tras escribir otra cosa, la misma tecla vuelve a contar', () => {
    assert.strictEqual(typed(['a', 'a', 'a', 'b', 'a', 'a']), 5);
  });

  test('cada archivo lleva su propia cuenta', () => {
    const filter = new RepeatFilter();
    filter.countable(DOC, 'a');
    filter.countable(DOC, 'a');
    assert.strictEqual(filter.countable('file:///b.ts', 'a'), 1);
  });

  test('al olvidar un archivo se reinicia su cuenta', () => {
    const filter = new RepeatFilter();
    typed(Array(5).fill('a'), filter);
    filter.forget(DOC);
    assert.strictEqual(filter.countable(DOC, 'a'), 1);
  });

  test('un pegado o autocompletado cuenta sin espacios', () => {
    assert.strictEqual(typed(['const total = items.length;']), 24);
  });
});
