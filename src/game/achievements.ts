import { GameState, StateManager } from '../data/state';
import { PokemonData } from '../data/pokeapi';

// Ajusta estos valores a tu gusto
export const REWARD_BATCH = 8;    // candidatos que se piden a la vez al buscar la recompensa
export const REWARD_ROUNDS = 4;   // tandas antes de conformarse con el más parecido

// 1 = fácil … 4 = épico. Cuanto más difícil, más raro es el Pokémon de la recompensa.
export type Tier = 1 | 2 | 3 | 4;

export const TIER_LABELS: Record<Tier, string> = {
  1: 'común',
  2: 'poco común',
  3: 'raro',
  4: 'legendario',
};

// Rango de captureRate del Pokémon de la recompensa (más bajo = más difícil de capturar)
export const TIER_CAPTURE_RATES: Record<Tier, [min: number, max: number]> = {
  1: [150, 255],
  2: [75, 149],
  3: [11, 74],
  4: [0, 10],
};

// Secciones en las que se agrupan los logros, en el orden en que se muestran.
// `icon` es el nombre de un icono SVG de media/achievements.js
export const ACHIEVEMENT_GROUPS = [
  { name: 'Capturas', icon: 'target' },
  { name: 'Especies', icon: 'book' },
  { name: 'Constancia', icon: 'flame' },
  { name: 'Código', icon: 'code' },
  { name: 'Monedas', icon: 'coin' },
  { name: 'Encuentros', icon: 'leaf' },
  { name: 'Evoluciones', icon: 'arrow-up' },
  { name: 'Variocolores', icon: 'sparkle' },
  { name: 'Generaciones', icon: 'map' },
] as const;

export interface Achievement {
  id: string;
  group: (typeof ACHIEVEMENT_GROUPS)[number]['name'];
  name: string;
  description: string;
  tier: Tier;
  target: number;
  progress: (state: GameState) => number;
}

function distinctSpecies(state: GameState): number {
  return new Set(state.captured.map((c) => c.id)).size;
}

function shinySpecies(state: GameState): number {
  return new Set(state.captured.filter((c) => c.shiny).map((c) => c.id)).size;
}

export const ACHIEVEMENTS: Achievement[] = [
  // Capturas
  { id: 'captures-1', group: 'Capturas', name: 'Primera captura', description: 'Captura tu primer Pokémon.', tier: 1, target: 1, progress: (s) => s.stats.captures },
  { id: 'captures-25', group: 'Capturas', name: 'Aficionado', description: 'Captura 25 Pokémon.', tier: 2, target: 25, progress: (s) => s.stats.captures },
  { id: 'captures-100', group: 'Capturas', name: 'Cazador', description: 'Captura 100 Pokémon.', tier: 3, target: 100, progress: (s) => s.stats.captures },
  { id: 'captures-500', group: 'Capturas', name: 'Leyenda de la captura', description: 'Captura 500 Pokémon.', tier: 4, target: 500, progress: (s) => s.stats.captures },

  // Especies distintas
  { id: 'species-10', group: 'Especies', name: 'Pokédex en marcha', description: 'Ten 10 especies distintas.', tier: 1, target: 10, progress: distinctSpecies },
  { id: 'species-50', group: 'Especies', name: 'Coleccionista', description: 'Ten 50 especies distintas.', tier: 2, target: 50, progress: distinctSpecies },
  { id: 'species-150', group: 'Especies', name: 'Gran coleccionista', description: 'Ten 150 especies distintas.', tier: 3, target: 150, progress: distinctSpecies },
  { id: 'species-400', group: 'Especies', name: 'Maestro Pokémon', description: 'Ten 400 especies distintas.', tier: 4, target: 400, progress: distinctSpecies },

  // Constancia
  { id: 'streak-3', group: 'Constancia', name: 'Buen comienzo', description: 'Programa 3 días seguidos.', tier: 1, target: 3, progress: (s) => s.stats.bestStreak },
  { id: 'streak-7', group: 'Constancia', name: 'Una semana entera', description: 'Programa 7 días seguidos.', tier: 2, target: 7, progress: (s) => s.stats.bestStreak },
  { id: 'streak-30', group: 'Constancia', name: 'Hábito de hierro', description: 'Programa 30 días seguidos.', tier: 3, target: 30, progress: (s) => s.stats.bestStreak },
  { id: 'streak-100', group: 'Constancia', name: 'Imparable', description: 'Programa 100 días seguidos.', tier: 4, target: 100, progress: (s) => s.stats.bestStreak },

  // Código escrito
  { id: 'chars-2000', group: 'Código', name: 'Primeras líneas', description: 'Escribe 2.000 caracteres que den monedas.', tier: 1, target: 2_000, progress: (s) => s.stats.charsWritten },
  { id: 'chars-25000', group: 'Código', name: 'Picando código', description: 'Escribe 25.000 caracteres que den monedas.', tier: 2, target: 25_000, progress: (s) => s.stats.charsWritten },
  { id: 'chars-150000', group: 'Código', name: 'Teclado en llamas', description: 'Escribe 150.000 caracteres que den monedas.', tier: 3, target: 150_000, progress: (s) => s.stats.charsWritten },
  { id: 'chars-1000000', group: 'Código', name: 'Novelista del código', description: 'Escribe 1.000.000 de caracteres que den monedas.', tier: 4, target: 1_000_000, progress: (s) => s.stats.charsWritten },

  // Monedas
  { id: 'coins-500', group: 'Monedas', name: 'Ahorrador', description: 'Gana 500 monedas en total.', tier: 1, target: 500, progress: (s) => s.stats.coinsEarned },
  { id: 'coins-5000', group: 'Monedas', name: 'Con buen bolsillo', description: 'Gana 5.000 monedas en total.', tier: 2, target: 5_000, progress: (s) => s.stats.coinsEarned },
  { id: 'coins-30000', group: 'Monedas', name: 'Magnate', description: 'Gana 30.000 monedas en total.', tier: 3, target: 30_000, progress: (s) => s.stats.coinsEarned },

  // Encuentros y balls
  { id: 'encounters-10', group: 'Encuentros', name: 'Hierba alta', description: 'Vive 10 encuentros.', tier: 1, target: 10, progress: (s) => s.stats.encounters },
  { id: 'encounters-100', group: 'Encuentros', name: 'Explorador', description: 'Vive 100 encuentros.', tier: 2, target: 100, progress: (s) => s.stats.encounters },
  { id: 'encounters-500', group: 'Encuentros', name: 'Rastreador', description: 'Vive 500 encuentros.', tier: 3, target: 500, progress: (s) => s.stats.encounters },
  { id: 'throws-50', group: 'Encuentros', name: 'Buen brazo', description: 'Lanza 50 balls.', tier: 1, target: 50, progress: (s) => s.stats.throws },
  { id: 'throws-500', group: 'Encuentros', name: 'Lanzador estrella', description: 'Lanza 500 balls.', tier: 2, target: 500, progress: (s) => s.stats.throws },

  // Evoluciones
  { id: 'evolutions-1', group: 'Evoluciones', name: 'Algo está cambiando', description: 'Evoluciona un Pokémon.', tier: 1, target: 1, progress: (s) => s.stats.evolutions },
  { id: 'evolutions-10', group: 'Evoluciones', name: 'Criador', description: 'Evoluciona 10 Pokémon.', tier: 2, target: 10, progress: (s) => s.stats.evolutions },
  { id: 'evolutions-40', group: 'Evoluciones', name: 'Maestro de la evolución', description: 'Evoluciona 40 Pokémon.', tier: 3, target: 40, progress: (s) => s.stats.evolutions },

  // Variocolores
  { id: 'shiny-1', group: 'Variocolores', name: 'Destellos', description: 'Captura un Pokémon variocolor.', tier: 3, target: 1, progress: shinySpecies },
  { id: 'shiny-5', group: 'Variocolores', name: 'Cazador de brillos', description: 'Ten 5 especies variocolor distintas.', tier: 4, target: 5, progress: shinySpecies },

  // Generaciones
  { id: 'gen-2', group: 'Generaciones', name: 'Más allá de Kanto', description: 'Desbloquea la segunda generación.', tier: 2, target: 2, progress: (s) => s.generationsUnlocked },
  { id: 'gen-5', group: 'Generaciones', name: 'Gran viaje', description: 'Desbloquea la quinta generación.', tier: 3, target: 5, progress: (s) => s.generationsUnlocked },
  { id: 'gen-9', group: 'Generaciones', name: 'Hasta Paldea', description: 'Desbloquea las nueve generaciones.', tier: 4, target: 9, progress: (s) => s.generationsUnlocked },
];

export function findAchievement(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

export function isCompleted(achievement: Achievement, state: GameState): boolean {
  return achievement.progress(state) >= achievement.target;
}

// Logros que se cumplen ahora y aún no estaban apuntados
export function newlyCompleted(state: GameState): Achievement[] {
  const known = new Set(state.achievements);
  return ACHIEVEMENTS.filter((a) => !known.has(a.id) && isCompleted(a, state));
}

// Logros conseguidos cuya recompensa (el Pokémon) aún no has capturado
export function pendingRewards(state: GameState): Achievement[] {
  const claimed = new Set(state.achievementsClaimed);
  return state.achievements
    .filter((id) => !claimed.has(id))
    .map(findAchievement)
    .filter((a): a is Achievement => a !== undefined);
}

// Apunta los logros nuevos; devuelve cuáles son (vacío si no hay ninguno)
export async function unlockAchievements(state: StateManager): Promise<Achievement[]> {
  if (newlyCompleted(state.get()).length === 0) {
    return [];
  }
  let unlocked: Achievement[] = [];
  await state.update((s) => {
    unlocked = newlyCompleted(s);
    s.achievements.push(...unlocked.map((a) => a.id));
  });
  return unlocked;
}

// La recompensa se da por buena cuando capturas el Pokémon
export async function claimReward(state: StateManager, id: string): Promise<void> {
  if (state.get().achievementsClaimed.includes(id)) {
    return;
  }
  await state.update((s) => {
    s.achievementsClaimed.push(id);
  });
}

function distanceToRange(captureRate: number, [min, max]: [number, number]): number {
  return captureRate < min ? min - captureRate : captureRate > max ? captureRate - max : 0;
}

// Busca un Pokémon cuya dificultad encaje con el nivel del logro. Prueba tandas de candidatos al
// azar; si ninguno encaja, se queda con el más cercano al rango.
export async function pickRewardPokemon(
  tier: Tier,
  maxId: number,
  fetchPokemon: (id: number) => Promise<PokemonData>,
  random: () => number = Math.random
): Promise<PokemonData> {
  const range = TIER_CAPTURE_RATES[tier];
  let best: PokemonData | null = null;

  for (let round = 0; round < REWARD_ROUNDS; round += 1) {
    const ids = Array.from({ length: REWARD_BATCH }, () => Math.floor(random() * maxId) + 1);
    const results = await Promise.allSettled(ids.map((id) => fetchPokemon(id)));

    for (const result of results) {
      if (result.status !== 'fulfilled') {
        continue;
      }
      const distance = distanceToRange(result.value.captureRate, range);
      if (distance === 0) {
        return result.value;
      }
      if (!best || distance < distanceToRange(best.captureRate, range)) {
        best = result.value;
      }
    }
  }

  if (!best) {
    throw new Error('No se pudo cargar ningún Pokémon para la recompensa');
  }
  return best;
}

// --- Datos para la pestaña de logros ---
export interface AchievementView {
  id: string;
  name: string;
  description: string;
  tier: Tier;
  tierLabel: string;
  current: number; // limitado al objetivo
  target: number;
  done: boolean;
  claimed: boolean; // ya capturaste el Pokémon de la recompensa
}

export interface AchievementGroupView {
  name: string;
  icon: string;
  done: number;
  achievements: AchievementView[];
}

export interface AchievementsData {
  done: number;
  total: number;
  pendingRewards: number;
  groups: AchievementGroupView[];
}

export function buildAchievements(state: GameState): AchievementsData {
  const unlocked = new Set(state.achievements);
  const claimed = new Set(state.achievementsClaimed);

  const groups = ACHIEVEMENT_GROUPS.map((group): AchievementGroupView => {
    const achievements = ACHIEVEMENTS.filter((a) => a.group === group.name).map(
      (a): AchievementView => ({
        id: a.id,
        name: a.name,
        description: a.description,
        tier: a.tier,
        tierLabel: TIER_LABELS[a.tier],
        current: Math.min(a.progress(state), a.target),
        target: a.target,
        done: unlocked.has(a.id) || isCompleted(a, state),
        claimed: claimed.has(a.id),
      })
    );
    return {
      name: group.name,
      icon: group.icon,
      done: achievements.filter((a) => a.done).length,
      achievements,
    };
  });

  return {
    done: groups.reduce((sum, g) => sum + g.done, 0),
    total: ACHIEVEMENTS.length,
    pendingRewards: pendingRewards(state).length,
    groups,
  };
}
