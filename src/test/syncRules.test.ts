import * as assert from 'assert';
import { decideSync } from '../game/syncRules';

suite('decideSync', () => {
  test('sin archivo remoto se sube la partida, salvo que no se haya jugado', () => {
    assert.strictEqual(decideSync(0, undefined, 0), 'none');
    assert.strictEqual(decideSync(500, undefined, 0), 'push');
  });

  test('si ambas marcas coinciden no hay nada que hacer', () => {
    assert.strictEqual(decideSync(300, 300, 100), 'none');
    assert.strictEqual(decideSync(300, 300, 300), 'none');
  });

  test('solo ha cambiado la remota: se descarga', () => {
    assert.strictEqual(decideSync(100, 200, 100), 'pull');
  });

  test('solo ha cambiado la local: se sube', () => {
    assert.strictEqual(decideSync(200, 100, 100), 'push');
  });

  test('han cambiado las dos: conflicto', () => {
    assert.strictEqual(decideSync(200, 300, 100), 'conflict');
  });

  test('ninguna es más nueva que la última sincronización', () => {
    assert.strictEqual(decideSync(50, 80, 100), 'none');
  });
});
