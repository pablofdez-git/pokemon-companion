export type SyncAction = 'push' | 'pull' | 'conflict' | 'none';

// Decide qué hacer comparando tres marcas de tiempo (en milisegundos):
// - localUpdatedAt: último cambio de la partida de este ordenador
// - remoteSavedAt: último cambio guardado en el archivo (undefined si no existe)
// - lastSyncedAt: la marca con la que ambos coincidieron por última vez
export function decideSync(
  localUpdatedAt: number,
  remoteSavedAt: number | undefined,
  lastSyncedAt: number
): SyncAction {
  if (remoteSavedAt === undefined) {
    // Sin archivo: se sube la partida, salvo que aún no se haya jugado nada
    return localUpdatedAt > 0 ? 'push' : 'none';
  }
  if (remoteSavedAt === localUpdatedAt) {
    return 'none';
  }

  const localChanged = localUpdatedAt > lastSyncedAt;
  const remoteChanged = remoteSavedAt > lastSyncedAt;

  if (localChanged && remoteChanged) {
    return 'conflict';
  }
  if (remoteChanged) {
    return 'pull';
  }
  if (localChanged) {
    return 'push';
  }
  return 'none';
}
