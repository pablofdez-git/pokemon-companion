import * as vscode from 'vscode';
import { CapturedPokemon, StateManager } from '../data/state';
import { sellPrice } from '../game/economy';
import { MAX_POKEMON_ID } from '../game/encounter';
import { BALLS } from '../game/items';

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

// Agrupa las capturas repetidas y las ordena por número de Pokédex
function groupCaptured(captured: CapturedPokemon[]): CapturedGroup[] {
  const groups = new Map<number, CapturedGroup>();
  for (const pokemon of captured) {
    const existing = groups.get(pokemon.id);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(pokemon.id, { pokemon, count: 1 });
    }
  }
  return [...groups.values()].sort((a, b) => a.pokemon.id - b.pokemon.id);
}

// Los iconos del árbol van fijados a 16x16, así que el sprite grande va en el tooltip
function pokemonTooltip(
  pokemon: CapturedPokemon,
  count: number
): vscode.MarkdownString {
  const tooltip = new vscode.MarkdownString();
  tooltip.supportHtml = true;

  const number = String(pokemon.id).padStart(3, '0');
  tooltip.appendMarkdown(`**#${number} ${pokemon.name}**\n\n`);
  if (pokemon.spriteUrl) {
    tooltip.appendMarkdown(
      `<img src="${pokemon.spriteUrl}" width="128" height="128" alt="${pokemon.name}">\n\n`
    );
  }
  tooltip.appendMarkdown(count > 1 ? `Capturado ${count} veces` : 'Capturado 1 vez');
  if (count > 1) {
    tooltip.appendMarkdown(
      `\n\nVender un repetido: ${sellPrice(pokemon.captureRate)} 🪙`
    );
  }
  return tooltip;
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
    const { balls, captured } = this.state.get();
    const None = vscode.TreeItemCollapsibleState.None;
    const Expanded = vscode.TreeItemCollapsibleState.Expanded;

    // Raíz: las dos secciones
    if (!element) {
      const groups = groupCaptured(captured);
      return [
        new BackpackItem('Pokéballs', Expanded, 'balls'),
        new BackpackItem(
          `Pokémon capturados (${groups.length}/${MAX_POKEMON_ID})`,
          Expanded,
          'pokemon'
        ),
      ];
    }

    if (element.section === 'balls') {
      return BALLS.map((ball) => {
        const item = new BackpackItem(ball.name, None);
        item.description = `x${balls[ball.id] ?? 0}`;
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
        const item = new BackpackItem(
          `#${String(pokemon.id).padStart(3, '0')} ${pokemon.name}`,
          None
        );
        item.pokemonId = pokemon.id;
        // Solo los repetidos muestran el botón de vender (ver package.json)
        item.contextValue = count > 1 ? 'duplicatePokemon' : 'singlePokemon';
        if (count > 1) {
          item.description = `x${count}`;
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
