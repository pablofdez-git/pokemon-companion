import * as vscode from 'vscode';

export interface GameState {
  coins: number;
  balls: Record<string, number>;
  captured: number[]; // ids de Pokémon capturados
}

const KEY = 'pokemonCompanion.state';

const DEFAULT_STATE: GameState = {
  coins: 0,
  balls: { pokeball: 5 },
  captured: [],
};

export class StateManager {
  constructor(private readonly memento: vscode.Memento) {}

  get(): GameState {
    const saved = this.memento.get<GameState>(KEY);
    // Copia profunda para no modificar nunca DEFAULT_STATE por accidente
    return JSON.parse(JSON.stringify(saved ?? DEFAULT_STATE));
  }

  async update(change: (state: GameState) => void): Promise<void> {
    const state = this.get();
    change(state);
    await this.memento.update(KEY, state);
  }

  async reset(): Promise<void> {
    await this.memento.update(KEY, undefined);
  }
}
