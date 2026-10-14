import { randomBytes } from 'crypto';
import * as vscode from 'vscode';

export interface PokemonView {
  id: number;
  name: string;
  spriteUrl: string | null;
  animatedSpriteUrl: string | null; // sprite animado (solo existe hasta el #649)
}

export interface BallOption {
  id: string;
  name: string;
  count: number;
  multiplier: string;  // texto, por ejemplo "×1.5" o "captura segura"
  probability: number; // porcentaje estimado, de 0 a 100
  spriteUrl: string;
}

export type EncounterChoice =
  | { kind: 'throw'; ballId: string }
  | { kind: 'flee' }
  | { kind: 'timeout' };

// Mensajes de la extensión hacia el panel
type ToPanel =
  | { type: 'idle' }
  | {
      type: 'encounter';
      pokemon: PokemonView;
      message: string;
      balls: BallOption[];
      deadline: number;  // momento (ms) en que el Pokémon se va si no respondes
      timeoutMs: number; // duración total de la espera, para dibujar la barra
    }
  | {
      type: 'ended';
      pokemon: PokemonView;
      outcome: 'captured' | 'fled';
      message: string;
    }
  | {
      type: 'playThrow';
      ballSpriteUrl: string;
      shakes: number;
      caught: boolean;
    };

// Mensajes del panel hacia la extensión
type FromPanel =
  | { type: 'ready' }
  | { type: 'throw'; ballId: string }
  | { type: 'flee' }
  | { type: 'throwDone' };

const END_DISPLAY_MS = 8000;    // cuánto se ve el resultado antes de volver a la calma
const REVEAL_WAIT_MS = 3000;    // espera máxima a que se cree la vista
const THROW_MAX_WAIT_MS = 7000; // espera máxima a que termine la animación del lanzamiento

export class EncounterPanel
  implements vscode.WebviewViewProvider, vscode.Disposable
{
  static readonly viewId = 'pokemonCompanion.encounter';

  private view: vscode.WebviewView | undefined;
  private lastMessage: ToPanel = { type: 'idle' };
  private pending:
    | {
        resolve: (choice: EncounterChoice) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    | undefined;
  private throwDone: (() => void) | undefined;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private markResolved!: () => void;
  private readonly resolved = new Promise<void>((resolve) => {
    this.markResolved = resolve;
  });

  constructor(private readonly extensionUri: vscode.Uri) {}

  // VS Code llama a esto cuando la vista se muestra por primera vez
  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;

    const mediaRoot = vscode.Uri.joinPath(this.extensionUri, 'media');
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [mediaRoot],
    };
    view.webview.html = this.getHtml(view.webview, mediaRoot);

    view.webview.onDidReceiveMessage((message: FromPanel) =>
      this.onMessage(message)
    );
    view.onDidChangeVisibility(() => {
      if (view.visible) {
        this.send(this.lastMessage);
      }
    });
    view.onDidDispose(() => {
      if (this.view === view) {
        this.view = undefined;
      }
    });

    this.markResolved();
  }

  // Enseña la vista sin quitarle el foco al editor
  async reveal(): Promise<void> {
    if (this.view) {
      this.view.show(true); // true = conservar el foco donde estaba
      return;
    }

    // La vista aún no existe en esta sesión: hay que abrirla una vez
    await vscode.commands.executeCommand(`${EncounterPanel.viewId}.focus`);
    await Promise.race([
      this.resolved,
      new Promise<void>((resolve) => setTimeout(resolve, REVEAL_WAIT_MS)),
    ]);
    // Abrirla le da el foco: se lo devolvemos al editor para no cortarte al escribir
    await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
  }

  // Enseña el encuentro y espera tu decisión (o a que se acabe el tiempo)
  ask(
    pokemon: PokemonView,
    message: string,
    balls: BallOption[],
    timeoutMs: number
  ): Promise<EncounterChoice> {
    clearTimeout(this.idleTimer);
    this.settle({ kind: 'timeout' }); // por seguridad, no puede haber dos preguntas a la vez

    return new Promise((resolve) => {
      const timer = setTimeout(() => this.settle({ kind: 'timeout' }), timeoutMs);
      this.pending = { resolve, timer };
      this.post({
        type: 'encounter',
        pokemon,
        message,
        balls,
        deadline: Date.now() + timeoutMs,
        timeoutMs,
      });
    });
  }

  // Anima el lanzamiento y espera a que termine (o a que se agote el tiempo máximo)
  playThrow(
    ballSpriteUrl: string,
    shakes: number,
    caught: boolean
  ): Promise<void> {
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = () => {
        clearTimeout(timer);
        this.throwDone = undefined;
        resolve();
      };
      timer = setTimeout(finish, THROW_MAX_WAIT_MS);
      this.throwDone = finish;
      this.post({ type: 'playThrow', ballSpriteUrl, shakes, caught });
    });
  }

  // Enseña el resultado y, pasado un rato, vuelve al estado tranquilo
  showEnd(
    pokemon: PokemonView,
    outcome: 'captured' | 'fled',
    message: string
  ): void {
    this.post({ type: 'ended', pokemon, outcome, message });
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.showIdle(), END_DISPLAY_MS);
  }

  showIdle(): void {
    clearTimeout(this.idleTimer);
    this.post({ type: 'idle' });
  }

    // Corta el encuentro en curso (por ejemplo, al pausar el juego): el Pokémon se va
  abort(): void {
    this.settle({ kind: 'flee' });
    this.showIdle();
  }

  dispose(): void {
    clearTimeout(this.idleTimer);
    this.settle({ kind: 'timeout' });
    this.throwDone?.();
  }

  private onMessage(message: FromPanel): void {
    switch (message.type) {
      case 'ready':
        this.send(this.lastMessage);
        break;
      case 'throw':
        this.settle({ kind: 'throw', ballId: message.ballId });
        break;
      case 'flee':
        this.settle({ kind: 'flee' });
        break;
      case 'throwDone':
        this.throwDone?.();
        break;
    }
  }

  private settle(choice: EncounterChoice): void {
    if (!this.pending) {
      return;
    }
    clearTimeout(this.pending.timer);
    const { resolve } = this.pending;
    this.pending = undefined;
    resolve(choice);
  }

  // Guarda el estado (para repintarlo si hace falta) y lo envía al panel
  private post(message: ToPanel): void {
    this.lastMessage = message;
    this.send(message);
  }

  private send(message: ToPanel): void {
    void this.view?.webview.postMessage(message);
  }

  private getHtml(webview: vscode.Webview, mediaRoot: vscode.Uri): string {
    const css = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'encounter.css'));
    const js = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'encounter.js'));
    const nonce = randomBytes(16).toString('hex');

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${css}">
  <title>Encuentro</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${js}"></script>
</body>
</html>`;
  }
}
