import * as vscode from 'vscode';
import { CapturedPokemon, StateManager } from '../data/state';
import { sellPrice } from '../game/economy';
import {
  GenerationProgress,
  generationProgress,
  maxPokemonId,
} from '../game/generations';
import { BALLS, BallType, ballSpriteUrl } from '../game/items';

type Section = 'balls' | 'pokemon';

class BackpackItem extends vscode.TreeItem {
  pokemonId?: number;

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
  count: number
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

export class BackpackProvider
  implements vscode.TreeDataProvider<BackpackItem>, vscode.Disposable
{
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private readonly subscription: vscode.Disposable;

  constructor(private readonly state: StateManager) {
    this.subscription = state.onDidChange(() => this.emitter.fire());
  }

  getTreeItem(element: BackpackItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: BackpackItem): BackpackItem[] {
    const { balls, captured, generationsUnlocked } = this.state.get();
    const None = vscode.TreeItemCollapsibleState.None;
    const Expanded = vscode.TreeItemCollapsibleState.Expanded;

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

      return [
        progressItem(progress),
        new BackpackItem('Pokéballs', Expanded, 'balls'),
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

    if (element.section === 'pokemon') {
      const groups = groupCaptured(captured);
      if (groups.length === 0) {
        const empty = new BackpackItem('Aún no has capturado ninguno', None);
        empty.description = '¡Sigue programando!';
        return [empty];
      }
      return groups.map(({ pokemon, count }) => {
        const number = String(pokemon.id).padStart(3, '0');
        const item = new BackpackItem(
          `#${number} ${pokemon.shiny ? '★ ' : ''}${pokemon.name}`,
          None
        );
        item.pokemonId = pokemon.id;
        // Solo los repetidos normales muestran el botón de vender (ver package.json)
        item.contextValue =
          !pokemon.shiny && count > 1 ? 'duplicatePokemon' : 'singlePokemon';

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
        item.tooltip = pokemonTooltip(pokemon, count);
        return item;
      });
    }

    return [];
  }

  dispose(): void {
    this.subscription.dispose();
    this.emitter.dispose();
  }
}
