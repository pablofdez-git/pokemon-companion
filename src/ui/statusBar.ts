import * as vscode from 'vscode';
import { StateManager } from '../data/state';

export class CoinStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly subscription: vscode.Disposable;

  constructor(private readonly state: StateManager) {
    this.item = vscode.window.createStatusBarItem(
      'pokemonCompanion.coins',
      vscode.StatusBarAlignment.Right,
      100
    );
    this.item.name = 'Ctrl+Catch: monedas';
    this.item.command = 'pokemonCompanion.openShop';
    this.item.tooltip = 'Tus monedas · Haz clic para abrir la tienda';
    this.subscription = state.onDidChange(() => this.refresh());
    this.refresh();
    this.item.show();
  }

  refresh(): void {
    this.item.text = `🪙 ${this.state.get().coins}`;
  }

  // Oculta o muestra el contador (por ejemplo, al pausar el juego)
  setVisible(visible: boolean): void {
    if (visible) {
      this.item.show();
    } else {
      this.item.hide();
    }
  }

  dispose(): void {
    this.subscription.dispose();
    this.item.dispose();
  }
}
