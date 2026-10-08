import * as vscode from 'vscode';
import { StateManager } from './data/state';
import { rewardForSave } from './game/economy';
import { CoinStatusBar } from './ui/statusBar';

export function activate(context: vscode.ExtensionContext) {
  const state = new StateManager(context.globalState);
  const statusBar = new CoinStatusBar(state);

  context.subscriptions.push(
    statusBar,

    vscode.workspace.onDidSaveTextDocument(async () => {
      const gained = await rewardForSave(state);
      statusBar.refresh();
      vscode.window.setStatusBarMessage(`+${gained} 🪙`, 3000);
    }),

    vscode.commands.registerCommand('pokemonCompanion.resetProgress', async () => {
      await state.reset();
      statusBar.refresh();
      vscode.window.showInformationMessage('Progreso reiniciado');
    })
  );
}

export function deactivate() {}
