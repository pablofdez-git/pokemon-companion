// Contadores que se van acumulando durante la partida.
// Las partidas anteriores a la 0.3.0 empiezan con todo a 0: no se pueden reconstruir.
export interface GameStats {
  coinsEarned: number;   // al escribir, al capturar y al vender
  coinsSpent: number;
  charsWritten: number;  // caracteres que han dado monedas
  encounters: number;
  captures: number;      // incluye los que luego se vendieron
  fled: number;          // encuentros que terminaron sin captura
  throws: number;        // balls lanzadas
  evolutions: number;    // Pokémon evolucionados
  eggs: number;          // huevos eclosionados
  activeDays: number;    // días distintos con algún guardado que dio monedas
  streak: number;        // días seguidos hasta lastActiveDay
  bestStreak: number;
  lastActiveDay: string | null; // 'AAAA-MM-DD', hora local
}

export const EMPTY_STATS: GameStats = {
  coinsEarned: 0,
  coinsSpent: 0,
  charsWritten: 0,
  encounters: 0,
  captures: 0,
  fled: 0,
  throws: 0,
  evolutions: 0,
  eggs: 0,
  activeDays: 0,
  streak: 0,
  bestStreak: 0,
  lastActiveDay: null,
};

// Día en hora local, para que la racha siga tu calendario y no el de UTC
export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function previousDay(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  return dayKey(new Date(year, month - 1, day - 1));
}

// Apunta que hoy has programado y actualiza la racha
export function recordActivity(stats: GameStats, today: string): void {
  if (stats.lastActiveDay === today) {
    return;
  }
  stats.streak =
    stats.lastActiveDay === previousDay(today) ? stats.streak + 1 : 1;
  stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
  stats.activeDays += 1;
  stats.lastActiveDay = today;
}

// La racha guardada solo sigue viva si programaste hoy o ayer
export function currentStreak(stats: GameStats, today: string): number {
  if (stats.lastActiveDay === today || stats.lastActiveDay === previousDay(today)) {
    return stats.streak;
  }
  return 0;
}

export function captureRate(stats: GameStats): number | null {
  return stats.encounters > 0
    ? Math.round((stats.captures / stats.encounters) * 100)
    : null;
}
