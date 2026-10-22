import * as vscode from 'vscode';

// Velocidad máxima a la que se cuentan caracteres. Escribir de verdad casi nunca
// llega a este ritmo, pero pegar o autocompletar en bucle sí, y entonces deja de pagar.
const REFILL_CHARS_PER_SECOND = 8;
const BURST_CHARS = 200; // lo que puede contarse de golpe (un pegado, un autocompletado)

export class ActivityTracker implements vscode.Disposable {
  private readonly changedChars = new Map<string, number>();
  private readonly subscriptions: vscode.Disposable[];
  private allowance = BURST_CHARS;
  private lastRefill = Date.now();

  constructor() {
    const onChange = vscode.workspace.onDidChangeTextDocument((e) => {
      // Solo archivos reales (ignora consola de depuración, salida, etc.)
      if (e.document.uri.scheme !== 'file') {
        return;
      }
      // Cambios sin contenido (por ejemplo, solo el estado "modificado")
      if (e.contentChanges.length === 0) {
        return;
      }
      // Si el documento no queda modificado, el cambio viene del disco
      // (git checkout, git pull, otro programa): no lo has escrito tú.
      // Lo que añade el formateador al guardar sí cuenta, pero lo frena el límite de velocidad.
      if (!e.document.isDirty) {
        return;
      }
      // Deshacer y rehacer no son trabajo nuevo: así no se puede repetir el truco
      if (
        e.reason === vscode.TextDocumentChangeReason.Undo ||
        e.reason === vscode.TextDocumentChangeReason.Redo
      ) {
        return;
      }

      // Solo cuenta lo que se añade; borrar no da monedas
      let added = 0;
      for (const change of e.contentChanges) {
        added += change.text.length;
      }

      const counted = this.takeFromAllowance(added);
      if (counted <= 0) {
        return;
      }

      const key = e.document.uri.toString();
      this.changedChars.set(key, (this.changedChars.get(key) ?? 0) + counted);
    });

    // Al cerrar un archivo se olvida lo que tenía acumulado
    const onClose = vscode.workspace.onDidCloseTextDocument((document) => {
      this.changedChars.delete(document.uri.toString());
    });

    this.subscriptions = [onChange, onClose];
  }

  // Rellena el depósito según el tiempo pasado y descuenta lo que se cuenta ahora
  private takeFromAllowance(chars: number): number {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;
    this.lastRefill = now;
    this.allowance = Math.min(
      BURST_CHARS,
      this.allowance + elapsedSeconds * REFILL_CHARS_PER_SECOND
    );

    const counted = Math.min(chars, this.allowance);
    this.allowance -= counted;
    return counted;
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
    this.subscriptions.forEach((s) => s.dispose());
  }
}
