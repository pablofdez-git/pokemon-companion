import * as vscode from 'vscode';
import { StateManager } from '../data/state';

export class CoinStatusBar {
  private readonly item: vscode.StatusBarItem;

  constructor(private readonly state: StateManager) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.item.tooltip = 'Pokémon Companion: tus monedas';
    this.refresh();
    this.item.show();
  }

  refresh(): void {
    this.item.text = `🪙 ${this.state.get().coins}`;
  }

  dispose(): void {
    this.item.dispose();
  }
}
