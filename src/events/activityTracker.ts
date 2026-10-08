import * as vscode from 'vscode';

export class ActivityTracker implements vscode.Disposable {
  private readonly changedChars = new Map<string, number>();
  private readonly subscription: vscode.Disposable;

  constructor() {
    this.subscription = vscode.workspace.onDidChangeTextDocument((e) => {
      // Solo archivos reales (ignora consola de depuración, salida, etc.)
      if (e.document.uri.scheme !== 'file') {
        return;
      }
      // Cambios sin contenido (por ejemplo, solo el estado "modificado")
      if (e.contentChanges.length === 0) {
        return;
      }

      let total = 0;
      for (const change of e.contentChanges) {
        // Cuenta lo escrito o lo borrado, lo que sea mayor
        total += Math.max(change.text.length, change.rangeLength);
      }

      const key = e.document.uri.toString();
      this.changedChars.set(key, (this.changedChars.get(key) ?? 0) + total);
    });
  }

  // Mira cuántos caracteres hay acumulados sin borrar el contador
  peek(document: vscode.TextDocument): number {
    return this.changedChars.get(document.uri.toString()) ?? 0;
  }

  // Devuelve los caracteres acumulados del archivo y pone el contador a 0
  consume(document: vscode.TextDocument): number {
    const key = document.uri.toString();
    const total = this.changedChars.get(key) ?? 0;
    this.changedChars.delete(key);
    return total;
  }

  dispose(): void {
    this.subscription.dispose();
  }
}
