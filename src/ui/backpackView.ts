import * as vscode from 'vscode';
import { CapturedPokemon, StateManager } from '../data/state';
import { cachedEvolutionIds, fetchEvolutionIds } from '../data/pokeapi';
import { sellPrice } from '../game/economy';
import { availableEvolutions } from '../game/evolution';
import {
  GenerationProgress,
  generationProgress,
  maxPokemonId,
} from '../game/generations';
import { BALLS, BallType, ballSpriteUrl } from '../game/items';
import {
  GameStats,
  captureRate,
  currentStreak,
  dayKey,
} from '../game/stats';

type Section = 'balls' | 'pokemon' | 'stats';

const RETRY_AFTER_MS = 60 * 1000; // espera antes de volver a consultar una evolución que falló

class BackpackItem extends vscode.TreeItem {
  pokemonId?: number;
  shiny?: boolean;

  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly section?: Section
  ) {
    super(label, collapsibleState);
  }
}

interface CapturedGroup {
  pokemon: CapturedPokemon;
  count: number;
}

// Agrupa las capturas repetidas (el variocolor va aparte del normal) y las ordena por Pokédex
function groupCaptured(captured: CapturedPokemon[]): CapturedGroup[] {
  const groups = new Map<string, CapturedGroup>();
  for (const pokemon of captured) {
    const key = `${pokemon.id}:${pokemon.shiny ? 's' : 'n'}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, { pokemon, count: 1 });
    }
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.pokemon.id - b.pokemon.id ||
      Number(Boolean(a.pokemon.shiny)) - Number(Boolean(b.pokemon.shiny))
  );
}

// Los iconos del árbol van fijados a 16x16, así que el sprite grande va en el tooltip
function pokemonTooltip(
  pokemon: CapturedPokemon,
  count: number,
  evolvable: boolean
): vscode.MarkdownString {
  const tooltip = new vscode.MarkdownString();
  tooltip.supportHtml = true;

  const number = String(pokemon.id).padStart(3, '0');
  const star = pokemon.shiny ? ' ★' : '';
  tooltip.appendMarkdown(`**#${number} ${pokemon.name}${star}**\n\n`);
  if (pokemon.spriteUrl) {
    tooltip.appendMarkdown(
      `<img src="${pokemon.spriteUrl}" width="128" height="128" alt="${pokemon.name}">\n\n`
    );
  }
  tooltip.appendMarkdown(count > 1 ? `Capturado ${count} veces` : 'Capturado 1 vez');
  if (pokemon.shiny) {
    tooltip.appendMarkdown('\n\nVariocolor: no se puede vender');
  } else if (count > 1) {
    tooltip.appendMarkdown(
      `\n\nVender un repetido: ${sellPrice(pokemon.captureRate)} 🪙`
    );
  }
  if (evolvable) {
    tooltip.appendMarkdown('\n\nPuede evolucionar: pulsa ⬆');
  }
  return tooltip;
}

function ballTooltip(ball: BallType, count: number): vscode.MarkdownString {
  const tooltip = new vscode.MarkdownString();
  tooltip.supportHtml = true;

  tooltip.appendMarkdown(`**${ball.name}**\n\n`);
  tooltip.appendMarkdown(
    `<img src="${ballSpriteUrl(ball)}" width="90" height="90" alt="${ball.name}">\n\n`
  );
  tooltip.appendMarkdown(
    `${ball.rule}\n\nTienes: ${count} · Precio: ${ball.price} 🪙`
  );
  return tooltip;
}

// Línea de progreso hacia la siguiente generación
function progressItem(progress: GenerationProgress): BackpackItem {
  const None = vscode.TreeItemCollapsibleState.None;

  if (!progress.next || progress.required === null || progress.remaining === null) {
    const done = new BackpackItem('Todas las generaciones desbloqueadas', None);
    done.iconPath = new vscode.ThemeIcon('check');
    return done;
  }

  const item = new BackpackItem(
    `Siguiente: Gen ${progress.next.number} · ${progress.next.name}`,
    None
  );
  item.description = `faltan ${progress.remaining} (${Math.min(
    progress.distinct,
    progress.required
  )}/${progress.required})`;
  item.iconPath = new vscode.ThemeIcon('lock');
  item.tooltip = `Captura ${progress.required} Pokémon distintos para desbloquear la generación ${progress.next.number}. Los repetidos no cuentan.`;
  return item;
}

function formatNumber(n: number): string {
  return n.toLocaleString('es-ES');
}

function statItem(
  label: string,
  value: string,
  icon: string,
  tooltip?: string
): BackpackItem {
  const item = new BackpackItem(label, vscode.TreeItemCollapsibleState.None);
  item.description = value;
  item.iconPath = new vscode.ThemeIcon(icon);
  item.tooltip = tooltip;
  return item;
}

function statsItems(stats: GameStats, shinies: number): BackpackItem[] {
  const streak = currentStreak(stats, dayKey(new Date()));
  const rate = captureRate(stats);
  const days = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;

  return [
    statItem(
      'Racha',
      `${days(streak)} · mejor: ${days(stats.bestStreak)}`,
      'flame',
      'Días seguidos programando. Cuenta un día si algún guardado te dio monedas.'
    ),
    statItem('Días programando', formatNumber(stats.activeDays), 'calendar'),
    statItem('Caracteres escritos', formatNumber(stats.charsWritten), 'edit'),
    statItem('Monedas ganadas', formatNumber(stats.coinsEarned), 'arrow-up'),
    statItem('Monedas gastadas', formatNumber(stats.coinsSpent), 'arrow-down'),
    statItem('Encuentros', formatNumber(stats.encounters), 'eye'),
    statItem(
      'Capturas',
      rate === null ? '0' : `${formatNumber(stats.captures)} (${rate}%)`,
      'pass',
      'Incluye los que vendiste después. El porcentaje es sobre los encuentros.'
    ),
    statItem('Huidas', formatNumber(stats.fled), 'run-all'),
    statItem('Balls lanzadas', formatNumber(stats.throws), 'circle-large-outline'),
    statItem('Evoluciones', formatNumber(stats.evolutions), 'arrow-circle-up'),
    statItem('Variocolores', formatNumber(shinies), 'star-full'),
  ];
}

export class BackpackProvider
  implements vscode.TreeDataProvider<BackpackItem>, vscode.Disposable
{
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private readonly subscription: vscode.Disposable;
  private readonly loading = new Set<number>();   // especies que se están consultando
  private readonly failedAt = new Map<number, number>(); // para reintentar sin insistir
  private disposed = false;

  constructor(private readonly state: StateManager) {
    this.subscription = state.onDidChange(() => this.emitter.fire());
  }

  // Consulta en segundo plano las evoluciones que aún no se conocen y refresca al terminar.
  // Se hace de una en una para no saturar la PokéAPI.
  private async prefetchEvolutions(ids: number[]): Promise<void> {
    const now = Date.now();
    const pending = ids.filter(
      (id) =>
        cachedEvolutionIds(id) === undefined &&
        !this.loading.has(id) &&
        now - (this.failedAt.get(id) ?? 0) > RETRY_AFTER_MS
    );
    if (pending.length === 0) {
      return;
    }

    pending.forEach((id) => this.loading.add(id));
    for (const id of pending) {
      try {
        await fetchEvolutionIds(id);
      } catch {
        this.failedAt.set(id, Date.now()); // sin conexión: el botón no sale
      }
      this.loading.delete(id);
      if (this.disposed) {
        return;
      }
    }
    this.emitter.fire();
  }

  getTreeItem(element: BackpackItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: BackpackItem): BackpackItem[] {
    const { balls, captured, generationsUnlocked, stats } = this.state.get();
    const None = vscode.TreeItemCollapsibleState.None;
    const Expanded = vscode.TreeItemCollapsibleState.Expanded;
    const Collapsed = vscode.TreeItemCollapsibleState.Collapsed;

    // Raíz: progreso de generaciones y las dos secciones
    if (!element) {
      const progress = generationProgress(
        generationsUnlocked,
        captured.map((c) => c.id)
      );
      const shinyCount = groupCaptured(captured).filter(
        (g) => g.pokemon.shiny
      ).length;
      const shinyText = shinyCount > 0 ? ` · ★ ${shinyCount}` : '';

      // Id fijo: así VS Code recuerda si la tienes abierta aunque la mochila se refresque
      const statsSection = new BackpackItem('Estadísticas', Collapsed, 'stats');
      statsSection.id = 'section-stats';

      return [
        progressItem(progress),
        new BackpackItem('Pokéballs', Expanded, 'balls'),
        statsSection,
        new BackpackItem(
          `Pokémon capturados (${progress.distinct}/${maxPokemonId(generationsUnlocked)})${shinyText}`,
          Expanded,
          'pokemon'
        ),
      ];
    }

    if (element.section === 'balls') {
      return BALLS.map((ball) => {
        const item = new BackpackItem(ball.name, None);
        item.description = `x${balls[ball.id] ?? 0}`;
        item.iconPath = vscode.Uri.parse(ballSpriteUrl(ball));
        item.tooltip = ballTooltip(ball, balls[ball.id] ?? 0);
        return item;
      });
    }

    if (element.section === 'stats') {
      const shinies = groupCaptured(captured).filter((g) => g.pokemon.shiny).length;
      return statsItems(stats, shinies);
    }

    if (element.section === 'pokemon') {
      const groups = groupCaptured(captured);
      if (groups.length === 0) {
        const empty = new BackpackItem('Aún no has capturado ninguno', None);
        empty.description = '¡Sigue programando!';
        return [empty];
      }
      void this.prefetchEvolutions([...new Set(groups.map((g) => g.pokemon.id))]);
      return groups.map(({ pokemon, count }) => {
        const number = String(pokemon.id).padStart(3, '0');
        const item = new BackpackItem(
          `#${number} ${pokemon.shiny ? '★ ' : ''}${pokemon.name}`,
          None
        );
        item.pokemonId = pokemon.id;
        item.shiny = Boolean(pokemon.shiny);
        const evolvable =
          availableEvolutions(cachedEvolutionIds(pokemon.id) ?? [], generationsUnlocked)
            .length > 0;
        // Solo los repetidos normales muestran vender y solo los que evolucionan, el ⬆ (ver package.json)
        item.contextValue = [
          !pokemon.shiny && count > 1 ? 'duplicatePokemon' : 'singlePokemon',
          evolvable ? 'evolvable' : '',
        ]
          .filter(Boolean)
          .join(' ');

        const details = [
          count > 1 ? `x${count}` : '',
          pokemon.shiny ? 'variocolor' : '',
        ].filter(Boolean);
        if (details.length > 0) {
          item.description = details.join(' · ');
        }
        if (pokemon.spriteUrl) {
          item.iconPath = vscode.Uri.parse(pokemon.spriteUrl);
        }
        item.tooltip = pokemonTooltip(pokemon, count, evolvable);
        return item;
      });
    }

    return [];
  }

  dispose(): void {
    this.disposed = true;
    this.subscription.dispose();
    this.emitter.dispose();
  }
}
