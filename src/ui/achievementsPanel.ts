import { randomBytes } from 'crypto';
import * as vscode from 'vscode';
import { StateManager } from '../data/state';
import { AchievementsData, Tier, buildAchievements } from '../game/achievements';
import { BALLS, ballSpriteUrl } from '../game/items';

// La ball de la tarjeta indica lo rara que es la recompensa
const TIER_BALL_IDS: Record<Tier, string> = {
  1: 'pokeball',
  2: 'greatball',
  3: 'ultraball',
  4: 'masterball',
};

function tierBallUrls(): Record<number, string> {
  const urls: Record<number, string> = {};
  for (const tier of [1, 2, 3, 4] as Tier[]) {
    const ball = BALLS.find((b) => b.id === TIER_BALL_IDS[tier]);
    if (ball) {
      urls[tier] = ballSpriteUrl(ball);
    }
  }
  return urls;
}

// Mensajes de la extensión hacia el panel
type ToPanel = {
  type: 'update';
  achievements: AchievementsData;
  tierBalls: Record<number, string>;
};

// Mensajes del panel hacia la extensión
type FromPanel = { type: 'ready' };

// Logros en una pestaña del editor, igual que la Pokédex
export class AchievementsPanel implements vscode.Disposable {
  static readonly viewType = 'pokemonCompanion.achievements';

  private panel: vscode.WebviewPanel | undefined;
  private readonly subscription: vscode.Disposable;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly state: StateManager
  ) {
    // Con la pestaña abierta, cada logro nuevo se ve al momento
    this.subscription = state.onDidChange(() => this.refresh());
  }

  // Abre los logros, o los trae al frente si ya estaban abiertos
  show(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    const mediaRoot = vscode.Uri.joinPath(this.extensionUri, 'media');
    const panel = vscode.window.createWebviewPanel(
      AchievementsPanel.viewType,
      'Logros',
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
      achievements: buildAchievements(this.state.get()),
      tierBalls: tierBallUrls(),
    };
    void this.panel?.webview.postMessage(message);
  }

  dispose(): void {
    this.subscription.dispose();
    this.panel?.dispose();
  }

  private getHtml(webview: vscode.Webview, mediaRoot: vscode.Uri): string {
    const css = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'achievements.css'));
    const js = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'achievements.js'));
    const nonce = randomBytes(16).toString('hex');

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${css}">
  <title>Logros</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${js}"></script>
</body>
</html>`;
  }
}
