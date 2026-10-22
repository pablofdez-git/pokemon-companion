import * as vscode from 'vscode';

const STORAGE_KEY = 'pokemonCompanion.paused';
const CONTEXT_KEY = 'pokemonCompanion.paused';

// Pausa o reanuda el juego. El estado se guarda en este ordenador y no se sincroniza.
export class PauseController implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<boolean>();
  readonly onDidChange = this.emitter.event;
  private readonly item: vscode.StatusBarItem;
  private paused: boolean;

  constructor(private readonly memento: vscode.Memento) {
    this.paused = memento.get<boolean>(STORAGE_KEY, false);
    this.item = vscode.window.createStatusBarItem(
      'pokemonCompanion.pause',
      vscode.StatusBarAlignment.Right,
      100
    );
    this.item.name = 'Ctrl+Catch: pausa';
    this.item.command = 'pokemonCompanion.togglePause';
    this.apply();
    this.item.show();
  }

  get isPaused(): boolean {
    return this.paused;
  }

  async toggle(): Promise<void> {
    this.paused = !this.paused;
    await this.memento.update(STORAGE_KEY, this.paused);
    this.apply();
    this.emitter.fire(this.paused);
  }

  private apply(): void {
    // Con este valor se ocultan las vistas del juego (ver "when" en package.json)
    void vscode.commands.executeCommand('setContext', CONTEXT_KEY, this.paused);

    if (this.paused) {
      this.item.text = '$(play) Pokémon en pausa';
      this.item.tooltip = 'Reanudar Ctrl+Catch';
    } else {
      this.item.text = '$(debug-pause)';
      this.item.tooltip =
        'Pausar Ctrl+Catch: sin monedas, encuentros ni paneles';
    }
  }

  dispose(): void {
    this.emitter.dispose();
    this.item.dispose();
  }
}
