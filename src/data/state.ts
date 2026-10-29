import * as vscode from 'vscode';
import { Tier } from '../game/achievements';
import { RETIRED_BALLS } from '../game/items';
import { EMPTY_STATS, GameStats } from '../game/stats';

export interface CapturedPokemon {
  id: number;
  name: string;
  spriteUrl: string | null;
  captureRate?: number; // dificultad; no existe en capturas antiguas
  shiny?: boolean;      // variocolor; no existe en capturas antiguas
  types?: string[];     // tipos en inglés (fire, water…); no existe en capturas antiguas
  capturedAt?: number;  // momento (ms) en que lo conseguiste; no existe en capturas antiguas
}

// El Pokémon favorito: su primer tipo decide el efecto pasivo (ver game/favorite.ts)
export interface Favorite {
  id: number;
  shiny: boolean;
  type: string;
}

// Pareja en la guardería: sus copias se quedan en la mochila, pero no se pueden vender ni evolucionar
export interface Nursery {
  a: number;     // especie (nunca Ditto)
  b: number;     // la misma especie, o Ditto
  tier: Tier;    // categoría de la especie: decide cuánto tarda y de qué categoría es la cría
  saves: number; // guardados con monedas desde que se dejaron
}

export interface GameState {
  coins: number;
  balls: Record<string, number>;
  items: Record<string, number>; // objetos (Incienso, piedras…): id → cantidad
  incenseUntil: number;          // hasta cuándo (ms) dura el Incienso encendido; 0 = apagado
  captured: CapturedPokemon[];
  generationsUnlocked: number;
  updatedAt: number; // momento (ms) del último cambio; sirve para sincronizar
  stats: GameStats;
  achievements: string[];        // ids de los logros conseguidos
  achievementsClaimed: string[]; // ids de los logros cuya recompensa ya capturaste
  favorite?: Favorite;           // opcional: las partidas antiguas no lo tienen
  nursery?: Nursery;             // opcional: hay pareja en la guardería
}

const KEY = 'pokemonCompanion.state';

const DEFAULT_STATE: GameState = {
  coins: 0,
  balls: { pokeball: 5 },
  items: {},
  incenseUntil: 0,
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
  // Las anteriores a los objetos (0.7.0) no tienen estos campos
  state.items = state.items ?? {};
  state.incenseUntil = state.incenseUntil ?? 0;
  // La Moneda Amuleto es única (al combinar dos partidas podrían salir dos)
  if ((state.items['amulet-coin'] ?? 0) > 1) {
    state.items['amulet-coin'] = 1;
  }
  // Las balls retiradas (Repeat y Timer, hasta la 0.6.1) se devuelven en monedas.
  // No cuenta como monedas ganadas: no debe dar logros
  for (const [id, price] of Object.entries(RETIRED_BALLS)) {
    state.coins += (state.balls[id] ?? 0) * price;
    delete state.balls[id];
  }
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
