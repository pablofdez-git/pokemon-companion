// Ajusta este valor a tu gusto
// Inserciones idénticas seguidas que cuentan. Al mantener pulsada una tecla, el teclado
// repite el mismo texto sin parar; escribiendo de verdad casi nunca pasa de dos ("ll", "==").
export const MAX_IDENTICAL_INSERTS = 2;

// Espacios, tabuladores y saltos de línea no son escribir código: no dan monedas
export function countableChars(text: string): number {
  return text.replace(/\s/g, '').length;
}

// Filtra lo que se repite al mantener una tecla pulsada (también "()" o '""' que se cierran solos)
export class RepeatFilter {
  private readonly last = new Map<string, { text: string; count: number }>();

  // Caracteres de esta inserción que cuentan para las monedas
  countable(documentKey: string, text: string): number {
    // Borrar no inserta nada: no corta la racha de repeticiones (así no vale alternar con Retroceso)
    if (text === '') {
      return 0;
    }

    const previous = this.last.get(documentKey);
    const count = previous?.text === text ? previous.count + 1 : 1;
    this.last.set(documentKey, { text, count });

    return count > MAX_IDENTICAL_INSERTS ? 0 : countableChars(text);
  }

  forget(documentKey: string): void {
    this.last.delete(documentKey);
  }
}
