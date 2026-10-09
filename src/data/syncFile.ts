import * as fs from 'fs/promises';
import * as path from 'path';
import { GameState } from './state';

export interface Snapshot {
  version: number;
  savedAt: number;
  state: GameState;
}

const FOLDER_NAME = 'PokemonCompanion';
const FILE_NAME = 'partida.json';

// Carpeta indicada en los ajustes o, si está vacía, la de OneDrive de este equipo
export function resolveSyncFile(configuredFolder: string): string | undefined {
  const configured = configuredFolder.trim();
  if (configured) {
    return path.join(configured, FILE_NAME);
  }
  const oneDrive = process.env['OneDrive'];
  return oneDrive ? path.join(oneDrive, FOLDER_NAME, FILE_NAME) : undefined;
}

// Devuelve undefined si el archivo no existe; lanza un error si existe pero no es válido
// (así nunca se sobrescribe por error una partida que no se ha podido leer)
export async function readSnapshot(file: string): Promise<Snapshot | undefined> {
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }

  const data = JSON.parse(raw) as Partial<Snapshot>;
  if (
    typeof data.savedAt !== 'number' ||
    !data.state ||
    typeof data.state.coins !== 'number'
  ) {
    throw new Error('El archivo de la partida no tiene el formato esperado');
  }
  return data as Snapshot;
}

export async function writeSnapshot(
  file: string,
  snapshot: Snapshot
): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  await fs.writeFile(temp, JSON.stringify(snapshot, null, 2), 'utf8');
  await fs.rename(temp, file);
}
