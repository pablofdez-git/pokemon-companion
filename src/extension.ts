import * as vscode from 'vscode';
import { StateManager } from './data/state';
import { SyncService } from './data/syncService';
import { fetchPokemon } from './data/pokeapi';
import { rewardForSave } from './game/economy';
import { sellDuplicate } from './game/shop';
import { maxPokemonId } from './game/generations';
import {
  EncounterGate,
  randomPokemonId,
  rollEncounter,
  rollShiny,
} from './game/encounter';
import { ActivityTracker } from './events/activityTracker';
import { BackpackProvider } from './ui/backpackView';
import { EncounterPanel } from './ui/encounterPanel';
import { runEncounter } from './ui/encounterView';
import { PauseController } from './ui/pauseToggle';
import { openShop } from './ui/shop';
import { CoinStatusBar } from './ui/statusBar';

let syncService: SyncService | undefined;

export function activate(context: vscode.ExtensionContext) {
  const state = new StateManager(context.globalState);
  const pause = new PauseController(context.globalState);
  const statusBar = new CoinStatusBar(state);
  const backpack = new BackpackProvider(state);
  const encounterPanel = new EncounterPanel(context.extensionUri);
  const tracker = new ActivityTracker();
  const gate = new EncounterGate();
  const sync = new SyncService(state, context.globalState);
  syncService = sync;

  // Si el juego arranca en pausa, el contador de monedas no se ve
  statusBar.setVisible(!pause.isPaused);

  async function startEncounter(): Promise<void> {
    if (pause.isPaused || !gate.canStart()) {
      return;
    }

    gate.start();
    try {
      const maxId = maxPokemonId(state.get().generationsUnlocked);
      const pokemon = await fetchPokemon(randomPokemonId(maxId));
      const shiny = rollShiny(Boolean(pokemon.shinySpriteUrl));
      await runEncounter(state, encounterPanel, pokemon, shiny);
    } catch (error) {
      console.error('Error en el encuentro:', error);
      encounterPanel.showIdle();
    } finally {
      gate.end();
    }
  }

  context.subscriptions.push(
    pause,
    statusBar,
    backpack,
    encounterPanel,
    tracker,
    sync,

    pause.onDidChange((paused) => {
      statusBar.setVisible(!paused);
      if (paused) {
        encounterPanel.abort();
      }
    }),

    vscode.window.registerTreeDataProvider('pokemonCompanion.backpack', backpack),

    vscode.window.registerWebviewViewProvider(
      EncounterPanel.viewId,
      encounterPanel,
      { webviewOptions: { retainContextWhenHidden: true } }
    ),

    vscode.workspace.onDidSaveTextDocument(async (document) => {
      if (pause.isPaused) {
        tracker.consume(document); // lo escrito en pausa no cuenta
        return;
      }

      const changedChars = tracker.peek(document);
      const gained = await rewardForSave(state, changedChars);

      if (gained > 0) {
        tracker.consume(document); // solo se descuentan si dieron monedas
        vscode.window.setStatusBarMessage(`+${gained} 🪙`, 3000);

        if (rollEncounter()) {
          // Sin await: el encuentro espera tu respuesta y no debe bloquear el guardado
          void startEncounter();
        }
      }
    }),

    vscode.commands.registerCommand('pokemonCompanion.togglePause', () =>
      pause.toggle()
    ),

    vscode.commands.registerCommand('pokemonCompanion.openShop', () =>
      openShop(state)
    ),

    vscode.commands.registerCommand(
      'pokemonCompanion.sellDuplicate',
      async (item?: { pokemonId?: number }) => {
        if (item?.pokemonId === undefined) {
          return;
        }
        const result = await sellDuplicate(state, item.pokemonId);
        if (result.ok) {
          vscode.window.setStatusBarMessage(
            `${result.name} vendido: +${result.earned} 🪙`,
            4000
          );
        } else {
          vscode.window.showWarningMessage(result.reason);
        }
      }
    ),

    vscode.commands.registerCommand('pokemonCompanion.syncNow', () =>
      sync.syncNow()
    ),

    vscode.commands.registerCommand('pokemonCompanion.resetProgress', async () => {
      await state.reset();
      vscode.window.showInformationMessage('Progreso reiniciado');
    })
  );

  void sync.start();
}

// Al cerrar VS Code, sube lo que quede pendiente
export function deactivate(): Thenable<void> | undefined {
  return syncService?.flush();
}
