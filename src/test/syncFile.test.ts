import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  Snapshot,
  readSnapshot,
  resolveSyncFile,
  writeSnapshot,
} from '../data/syncFile';
import { EMPTY_STATS } from '../game/stats';

const SNAPSHOT: Snapshot = {
  version: 1,
  savedAt: 1234,
  state: {
    coins: 42,
    balls: { pokeball: 3 },
    captured: [{ id: 1, name: 'Bulbasaur', spriteUrl: null }],
    generationsUnlocked: 1,
    updatedAt: 1234,
    stats: { ...EMPTY_STATS, encounters: 3 },
  },
};

suite('archivo de sincronización', () => {
  let dir: string;

  setup(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pokemon-companion-'));
  });

  teardown(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  test('si no existe, devuelve undefined', async () => {
    assert.strictEqual(await readSnapshot(path.join(dir, 'partida.json')), undefined);
  });

  test('escribe (creando la carpeta) y vuelve a leer lo mismo', async () => {
    const file = path.join(dir, 'sub', 'partida.json');
    await writeSnapshot(file, SNAPSHOT);

    assert.deepStrictEqual(await readSnapshot(file), SNAPSHOT);
    assert.deepStrictEqual(await fs.readdir(path.dirname(file)), ['partida.json']);
  });

  test('un archivo que no es JSON da error en vez de undefined', async () => {
    const file = path.join(dir, 'partida.json');
    await fs.writeFile(file, 'esto no es json', 'utf8');
    await assert.rejects(readSnapshot(file));
  });

  test('un JSON con otro formato da error', async () => {
    const file = path.join(dir, 'partida.json');
    await fs.writeFile(file, JSON.stringify({ hola: 1 }), 'utf8');
    await assert.rejects(readSnapshot(file), /formato esperado/);
  });

  test('resolveSyncFile usa la carpeta configurada o la de OneDrive', () => {
    assert.strictEqual(
      resolveSyncFile(`  ${dir}  `),
      path.join(dir, 'partida.json')
    );

    const original = process.env['OneDrive'];
    try {
      process.env['OneDrive'] = dir;
      assert.strictEqual(
        resolveSyncFile(''),
        path.join(dir, 'PokemonCompanion', 'partida.json')
      );
      delete process.env['OneDrive'];
      assert.strictEqual(resolveSyncFile(''), undefined);
    } finally {
      if (original === undefined) {
        delete process.env['OneDrive'];
      } else {
        process.env['OneDrive'] = original;
      }
    }
  });
});
