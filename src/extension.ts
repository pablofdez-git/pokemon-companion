import * as vscode from 'vscode';
import { StateManager } from './data/state';
import { fetchPokemon } from './data/pokeapi';
import { rewardForSave } from './game/economy';
import {
  EncounterGate,
  randomPokemonId,
  rollEncounter,
} from './game/encounter';
import { ActivityTracker } from './events/activityTracker';
import { CoinStatusBar } from './ui/statusBar';
import { runEncounter } from './ui/encounterView';

export function activate(context: vscode.ExtensionContext) {
  const state = new StateManager(context.globalState);
  const statusBar = new CoinStatusBar(state);
  const tracker = new ActivityTracker();
  const gate = new EncounterGate();

  async function startEncounter(forced: boolean): Promise<void> {
    if (!gate.canStart(forced)) {
      if (forced) {
        vscode.window.showInformationMessage('Ya hay un encuentro en curso.');
      }
      return;
    }

    gate.start();
    try {
      const pokemon = await fetchPokemon(randomPokemonId());
      await runEncounter(state, pokemon);
    } catch (error) {
      console.error('Error en el encuentro:', error);
      if (forced) {
        vscode.window.showWarningMessage(
          'No se pudo cargar el Pokémon (¿sin conexión?).'
        );
      }
    } finally {
      gate.end();
    }
  }

  context.subscriptions.push(
    statusBar,
    tracker,

    vscode.workspace.onDidSaveTextDocument(async (document) => {
      const changedChars = tracker.consume(document);
      const gained = await rewardForSave(state, changedChars);

      if (gained > 0) {
        statusBar.refresh();
        vscode.window.setStatusBarMessage(`+${gained} 🪙`, 3000);

        if (rollEncounter()) {
          // Sin await: el encuentro espera tu respuesta y no debe bloquear el guardado
          void startEncounter(false);
        }
      }
    }),

    vscode.commands.registerCommand('pokemonCompanion.forceEncounter', () =>
      startEncounter(true)
    ),

    vscode.commands.registerCommand('pokemonCompanion.resetProgress', async () => {
      await state.reset();
      statusBar.refresh();
      vscode.window.showInformationMessage('Progreso reiniciado');
    })
  );
}

export function deactivate() {}
