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
}

const KEY = 'pokemonCompanion.state';

const DEFAULT_STATE: GameState = {
  coins: 0,
  balls: { pokeball: 5 },
  captured: [],
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
    return state;
  }

  async update(change: (state: GameState) => void): Promise<void> {
    const state = this.get();
    change(state);
    await this.memento.update(KEY, state);
    this.emitter.fire();
  }

  async reset(): Promise<void> {
    await this.memento.update(KEY, undefined);
    this.emitter.fire();
  }
}
