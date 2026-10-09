import * as vscode from 'vscode';
import { StateManager } from './data/state';
import { fetchPokemon } from './data/pokeapi';
import { rewardForSave } from './game/economy';
import { sellDuplicate } from './game/shop';
import { maxPokemonId } from './game/generations';
import {
  EncounterGate,
  randomPokemonId,
  rollEncounter,
} from './game/encounter';
import { ActivityTracker } from './events/activityTracker';
import { BackpackProvider } from './ui/backpackView';
import { runEncounter } from './ui/encounterView';
import { openShop } from './ui/shop';
import { CoinStatusBar } from './ui/statusBar';

export function activate(context: vscode.ExtensionContext) {
  const state = new StateManager(context.globalState);
  const statusBar = new CoinStatusBar(state);
  const backpack = new BackpackProvider(state);
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
      const maxId = maxPokemonId(state.get().generationsUnlocked);
      const pokemon = await fetchPokemon(randomPokemonId(maxId));
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
    backpack,
    tracker,

    vscode.window.registerTreeDataProvider('pokemonCompanion.backpack', backpack),


    vscode.workspace.onDidSaveTextDocument(async (document) => {
      const changedChars = tracker.peek(document);
      const gained = await rewardForSave(state, changedChars);

      if (gained > 0) {
        tracker.consume(document); // solo se descuentan si dieron monedas
        vscode.window.setStatusBarMessage(`+${gained} 🪙`, 3000);

        if (rollEncounter()) {
          // Sin await: el encuentro espera tu respuesta y no debe bloquear el guardado
          void startEncounter(false);
        }
      }
    }),

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

    vscode.commands.registerCommand('pokemonCompanion.forceEncounter', () =>
      startEncounter(true)
    ),

    vscode.commands.registerCommand('pokemonCompanion.resetProgress', async () => {
      await state.reset();
      vscode.window.showInformationMessage('Progreso reiniciado');
    })
  );
}

export function deactivate() {}
