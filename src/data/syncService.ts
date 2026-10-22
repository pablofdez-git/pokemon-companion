import * as vscode from 'vscode';
import { mergeStates } from '../game/syncMerge';
import { decideSync } from '../game/syncRules';
import { GameState, StateManager, normalizeState } from './state';
import {
  Snapshot,
  readSnapshot,
  resolveSyncFile,
  writeSnapshot,
} from './syncFile';

const LAST_SYNC_KEY = 'pokemonCompanion.lastSyncedAt';
// La partida tal como quedó en la última sincronización: la base para combinar en un conflicto
const LAST_SYNC_STATE_KEY = 'pokemonCompanion.lastSyncedState';
const PUSH_DELAY_MS = 3000;
const MERGE = 'Combinar las dos';
const USE_CLOUD = 'Usar la de OneDrive';
const KEEP_THIS = 'Mantener esta';

function summarize(state: GameState): string {
  const distinct = new Set(state.captured.map((c) => c.id)).size;
  return `${state.coins} monedas · ${distinct} Pokémon distintos · generación ${state.generationsUnlocked}`;
}

export class SyncService implements vscode.Disposable {
  private queue: Promise<unknown> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly subscriptions: vscode.Disposable[] = [];
  private warned = false;
  private dismissedConflict = 0;

  constructor(
    private readonly state: StateManager,
    private readonly memento: vscode.Memento
  ) {}

  private get filePath(): string | undefined {
    const folder = vscode.workspace
      .getConfiguration('pokemonCompanion')
      .get<string>('syncFolder', '');
    return resolveSyncFile(folder);
  }

  async start(): Promise<void> {
    if (!this.filePath) {
      console.log('Ctrl+Catch: sincronización desactivada (sin carpeta)');
      return;
    }

    await this.state.stampLegacyProgress();
    await this.enqueue(() => this.runSync(false));

    this.subscriptions.push(
      this.state.onDidChange(() => this.schedulePush()),
      vscode.window.onDidChangeWindowState((e) => {
        if (e.focused) {
          void this.enqueue(() => this.runSync(false));
        }
      })
    );
  }

  // Comando manual: sincroniza ahora y dice dónde está el archivo
  async syncNow(): Promise<void> {
    const file = this.filePath;
    if (!file) {
      vscode.window.showWarningMessage(
        'No se encontró la carpeta de OneDrive. Indícala en los ajustes: "pokemonCompanion.syncFolder".'
      );
      return;
    }
    const ok = await this.enqueue(() => this.runSync(false));
    if (ok) {
      vscode.window.showInformationMessage(`Partida sincronizada en: ${file}`);
    }
  }

  // Al cerrar VS Code: sube lo pendiente, sin preguntar nada
  async flush(): Promise<void> {
    if (!this.filePath) {
      return;
    }
    clearTimeout(this.timer);
    await this.enqueue(() => this.runSync(true));
  }

  private schedulePush(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.enqueue(() => this.runSync(false));
    }, PUSH_DELAY_MS);
  }

  // Ejecuta las tareas de una en una; devuelve false si alguna falla
  private enqueue(task: () => Promise<void>): Promise<boolean> {
    const run = this.queue.then(task).then(
      () => true,
      (error) => {
        this.report(error);
        return false;
      }
    );
    this.queue = run;
    return run;
  }

  private async runSync(pushOnly: boolean): Promise<void> {
    const file = this.filePath;
    if (!file) {
      return;
    }

    const local = this.state.get();
    const remote = await readSnapshot(file);
    const lastSynced = this.memento.get<number>(LAST_SYNC_KEY, 0);
    const action = decideSync(local.updatedAt, remote?.savedAt, lastSynced);

    if (action === 'push') {
      await this.push(file, local);
    } else if (pushOnly) {
      return;
    } else if (action === 'pull' && remote) {
      await this.pull(remote);
    } else if (action === 'conflict' && remote) {
      await this.resolveConflict(file, local, remote);
    }
  }

  private async push(file: string, local: GameState): Promise<void> {
    await writeSnapshot(file, {
      version: 1,
      savedAt: local.updatedAt,
      state: local,
    });
    await this.markSynced(local.updatedAt, local);
  }

  private async pull(remote: Snapshot): Promise<void> {
    const state = { ...remote.state, updatedAt: remote.savedAt };
    await this.state.replaceWith(state);
    await this.markSynced(remote.savedAt, state);
    vscode.window.setStatusBarMessage('Partida actualizada desde OneDrive', 4000);
  }

  private async markSynced(at: number, state: GameState): Promise<void> {
    await this.memento.update(LAST_SYNC_KEY, at);
    await this.memento.update(LAST_SYNC_STATE_KEY, state);
  }

  private async resolveConflict(
    file: string,
    local: GameState,
    remote: Snapshot
  ): Promise<void> {
    // Si ya dijiste que no quieres decidir ahora, no vuelve a preguntar en esta sesión
    if (this.dismissedConflict === remote.savedAt) {
      return;
    }

    const saved = this.memento.get<GameState>(LAST_SYNC_STATE_KEY);
    const base = saved ? normalizeState(saved) : undefined;
    const merged = mergeStates(base, local, normalizeState(remote.state));

    const choice = await vscode.window.showWarningMessage(
      'La partida de este ordenador y la de OneDrive han cambiado por separado. Puedes combinarlas o quedarte con una (la otra se perderá).',
      {
        modal: true,
        detail: [
          `Este ordenador: ${summarize(local)}`,
          `OneDrive: ${summarize(remote.state)}`,
          `Combinadas: ${summarize(merged)}`,
        ].join('\n'),
      },
      MERGE,
      USE_CLOUD,
      KEEP_THIS
    );

    if (choice === MERGE) {
      await this.state.replaceWith({ ...merged, updatedAt: Date.now() });
      await this.push(file, this.state.get());
      vscode.window.setStatusBarMessage('Partidas combinadas', 4000);
    } else if (choice === USE_CLOUD) {
      await this.pull(remote);
    } else if (choice === KEEP_THIS) {
      await this.push(file, local);
    } else {
      this.dismissedConflict = remote.savedAt;
    }
  }

  private report(error: unknown): void {
    console.error('Ctrl+Catch: error al sincronizar', error);
    if (!this.warned) {
      this.warned = true;
      void vscode.window.showWarningMessage(
        'No se pudo sincronizar la partida con OneDrive. Se reintentará más tarde.'
      );
    }
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.subscriptions.forEach((s) => s.dispose());
  }
}
