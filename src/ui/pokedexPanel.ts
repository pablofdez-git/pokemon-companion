import { randomBytes } from 'crypto';
import * as vscode from 'vscode';
import { StateManager } from '../data/state';
import { PokedexData, buildPokedex } from '../game/pokedex';

// Mensajes de la extensión hacia el panel
type ToPanel = { type: 'update'; pokedex: PokedexData };

// Mensajes del panel hacia la extensión
type FromPanel = { type: 'ready' };

// Pokédex en una pestaña del editor: hay más sitio que en la barra lateral
export class PokedexPanel implements vscode.Disposable {
  static readonly viewType = 'pokemonCompanion.pokedex';

  private panel: vscode.WebviewPanel | undefined;
  private readonly subscription: vscode.Disposable;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly state: StateManager
  ) {
    // Con la pestaña abierta, cada captura o venta se ve al momento
    this.subscription = state.onDidChange(() => this.refresh());
  }

  // Abre la Pokédex, o la trae al frente si ya estaba abierta
  show(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    const mediaRoot = vscode.Uri.joinPath(this.extensionUri, 'media');
    const panel = vscode.window.createWebviewPanel(
      PokedexPanel.viewType,
      'Pokédex',
      vscode.ViewColumn.Active,
      { enableScripts: true, localResourceRoots: [mediaRoot] }
    );
    panel.webview.html = this.getHtml(panel.webview, mediaRoot);

    panel.webview.onDidReceiveMessage((message: FromPanel) => {
      if (message.type === 'ready') {
        this.refresh();
      }
    });
    panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.panel = panel;
  }

  private refresh(): void {
    const message: ToPanel = {
      type: 'update',
      pokedex: buildPokedex(this.state.get()),
    };
    void this.panel?.webview.postMessage(message);
  }

  dispose(): void {
    this.subscription.dispose();
    this.panel?.dispose();
  }

  private getHtml(webview: vscode.Webview, mediaRoot: vscode.Uri): string {
    const css = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'pokedex.css'));
    const js = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'pokedex.js'));
    const nonce = randomBytes(16).toString('hex');

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${css}">
  <title>Pokédex</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${js}"></script>
</body>
</html>`;
  }
}
