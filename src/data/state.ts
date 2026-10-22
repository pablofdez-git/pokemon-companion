import * as vscode from 'vscode';
import { EMPTY_STATS, GameStats } from '../game/stats';

export interface CapturedPokemon {
  id: number;
  name: string;
  spriteUrl: string | null;
  captureRate?: number; // dificultad; no existe en capturas antiguas
  shiny?: boolean;      // variocolor; no existe en capturas antiguas
}

export interface GameState {
  coins: number;
  balls: Record<string, number>;
  captured: CapturedPokemon[];
  generationsUnlocked: number;
  updatedAt: number; // momento (ms) del último cambio; sirve para sincronizar
  stats: GameStats;
  achievements: string[];        // ids de los logros conseguidos
  achievementsClaimed: string[]; // ids de los logros cuya recompensa ya capturaste
}

const KEY = 'pokemonCompanion.state';

const DEFAULT_STATE: GameState = {
  coins: 0,
  balls: { pokeball: 5 },
  captured: [],
  generationsUnlocked: 1,
  updatedAt: 0,
  stats: EMPTY_STATS,
  achievements: [],
  achievementsClaimed: [],
};

// Copia una partida guardada (aquí, en el archivo de sincronización o de una versión antigua)
// y rellena lo que le falte, sin modificar el original
export function normalizeState(saved: GameState): GameState {
  const state: GameState = JSON.parse(JSON.stringify(saved));
  // Descarta capturas guardadas con el formato antiguo (solo ids)
  state.captured = state.captured.filter((c) => typeof c === 'object');
  // Partidas anteriores a las generaciones y a la sincronización no tienen estos campos
  state.generationsUnlocked = state.generationsUnlocked ?? 1;
  state.updatedAt = state.updatedAt ?? 0;
  // Las anteriores a la 0.3.0 no tienen estadísticas; si se añaden contadores, llegan a 0
  state.stats = { ...EMPTY_STATS, ...state.stats };
  // Las anteriores a los logros no tienen estas listas
  state.achievements = state.achievements ?? [];
  state.achievementsClaimed = state.achievementsClaimed ?? [];
  return state;
}

export class StateManager {
  private readonly emitter = new vscode.EventEmitter<void>();
  // La interfaz se suscribe aquí para refrescarse cuando el estado cambia
  readonly onDidChange = this.emitter.event;

  constructor(private readonly memento: vscode.Memento) {}

  get(): GameState {
    return normalizeState(this.memento.get<GameState>(KEY) ?? DEFAULT_STATE);
  }

  async update(change: (state: GameState) => void): Promise<void> {
    const state = this.get();
    change(state);
    state.updatedAt = Date.now();
    await this.memento.update(KEY, state);
    this.emitter.fire();
  }

  // Aplica una partida que viene de otro ordenador, conservando su marca de tiempo
  async replaceWith(state: GameState): Promise<void> {
    await this.memento.update(KEY, state);
    this.emitter.fire();
  }

  // Las partidas anteriores a la sincronización no tienen fecha: si ya hay progreso, se la damos
  async stampLegacyProgress(): Promise<void> {
    const state = this.get();
    const hasProgress = state.coins > 0 || state.captured.length > 0;
    if (state.updatedAt === 0 && hasProgress) {
      state.updatedAt = Date.now();
      await this.memento.update(KEY, state);
    }
  }

  async reset(): Promise<void> {
    const fresh: GameState = JSON.parse(JSON.stringify(DEFAULT_STATE));
    fresh.updatedAt = Date.now(); // con fecha, para que el reinicio también se sincronice
    await this.memento.update(KEY, fresh);
    this.emitter.fire();
  }
}
