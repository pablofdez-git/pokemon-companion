import * as vscode from 'vscode';

export interface CapturedPokemon {
  id: number;
  name: string;
  spriteUrl: string | null;
  captureRate?: number; // dificultad; no existe en capturas antiguas
}

export interface GameState {
  coins: number;
  balls: Record<string, number>;
  captured: CapturedPokemon[];
  generationsUnlocked: number;
  updatedAt: number; // momento (ms) del último cambio; sirve para sincronizar
}

const KEY = 'pokemonCompanion.state';

const DEFAULT_STATE: GameState = {
  coins: 0,
  balls: { pokeball: 5 },
  captured: [],
  generationsUnlocked: 1,
  updatedAt: 0,
};

export class StateManager {
  private readonly emitter = new vscode.EventEmitter<void>();
  // La interfaz se suscribe aquí para refrescarse cuando el estado cambia
  readonly onDidChange = this.emitter.event;

  constructor(private readonly memento: vscode.Memento) {}

  get(): GameState {
    const saved = this.memento.get<GameState>(KEY);
    // Copia profunda para no modificar nunca DEFAULT_STATE por accidente
    const state: GameState = JSON.parse(JSON.stringify(saved ?? DEFAULT_STATE));
    // Descarta capturas guardadas con el formato antiguo (solo ids)
    state.captured = state.captured.filter((c) => typeof c === 'object');
    // Partidas anteriores a las generaciones y a la sincronización no tienen estos campos
    state.generationsUnlocked = state.generationsUnlocked ?? 1;
    state.updatedAt = state.updatedAt ?? 0;
    return state;
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
