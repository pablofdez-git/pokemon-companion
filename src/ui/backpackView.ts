import * as vscode from 'vscode';
import { CapturedPokemon, GameState, StateManager } from '../data/state';
import { cachedEvolutionIds, fetchEvolutions } from '../data/pokeapi';
import { ACHIEVEMENTS, pendingRewards } from '../game/achievements';
import { sellPrice } from '../game/economy';
import { availableEvolutions } from '../game/evolution';
import { isReady, parentNames, reservedCopies, savesNeeded } from '../game/nursery';
import {
  PERK_TEXTS,
  activePerk,
  findFavorite,
  isFavorite,
  typeName,
} from '../game/favorite';
import {
  GenerationProgress,
  generationProgress,
  maxPokemonId,
} from '../game/generations';
import { BALLS, BallType, ballSpriteUrl } from '../game/items';
import {
  FledPokemon,
  GameObject,
  OBJECTS,
  canRecall,
  incenseActive,
  objectSpriteUrl,
} from '../game/objects';
import {
  GameStats,
  captureRate,
  currentStreak,
  dayKey,
} from '../game/stats';

type Section = 'balls' | 'objects' | 'pokemon' | 'stats';

const RETRY_AFTER_MS = 60 * 1000; // espera antes de volver a consultar una evolución que falló

class BackpackItem extends vscode.TreeItem {
  pokemonId?: number;
  shiny?: boolean;
  objectId?: string;

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
    tooltip.appendMarkdown('\n\nPuede evolucionar: usa el botón de la flecha hacia arriba');
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
    `${ball.rule}\n\nTienes: ${count} · ` +
      (ball.price === null ? 'No se vende' : `Precio: ${ball.price} 🪙`)
  );
  return tooltip;
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

// Un objeto de la mochila. El Incienso y la Pokéflauta llevan el botón de usar (ver package.json)
function objectItem(
  object: GameObject,
  count: number,
  incenseUntil: number | null,
  fled: FledPokemon | undefined
): BackpackItem {
  const item = new BackpackItem(object.name, vscode.TreeItemCollapsibleState.None);
  item.objectId = object.id;
  item.iconPath = vscode.Uri.parse(objectSpriteUrl(object));

  const details = object.unique ? [] : [`x${count}`];
  let status = '';
  if (object.kind === 'incense' && incenseUntil !== null) {
    details.push(`encendido hasta las ${formatTime(incenseUntil)}`);
  } else if (object.kind === 'amulet') {
    details.push('activa');
  } else if (object.kind === 'flute') {
    status = canRecall(fled)
      ? `Puede llamar a ${fled.shiny ? `${fled.name} variocolor` : fled.name}, que huyó a las ${formatTime(fled.at)}`
      : 'Ningún Pokémon ha huido hace poco';
  }
  item.description = details.join(' · ');

  const usable =
    (object.kind === 'incense' && incenseUntil === null) ||
    (object.kind === 'flute' && canRecall(fled));
  item.contextValue = usable ? 'usableObject' : 'object';

  const tooltip = new vscode.MarkdownString();
  tooltip.supportHtml = true;
  tooltip.appendMarkdown(`**${object.name}**\n\n`);
  tooltip.appendMarkdown(
    `<img src="${objectSpriteUrl(object)}" width="90" height="90" alt="${object.name}">\n\n`
  );
  tooltip.appendMarkdown(object.rule);
  if (status) {
    tooltip.appendMarkdown(`\n\n${status}`);
  }
  if (usable) {
    tooltip.appendMarkdown('\n\nÚsalo con el botón de esta línea');
  }
  item.tooltip = tooltip;
  return item;
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

// Línea de la guardería: la pareja y lo que falta para el huevo (clic para abrirla)
function nurseryItem(state: GameState): BackpackItem {
  const item = new BackpackItem('Guardería', vscode.TreeItemCollapsibleState.None);
  item.iconPath = new vscode.ThemeIcon('home');
  item.command = { command: 'pokemonCompanion.openNursery', title: 'Abrir guardería' };

  const nursery = state.nursery;
  if (!nursery) {
    item.description = 'vacía';
    item.tooltip =
      'Deja dos repetidos (o cualquier Pokémon con un Ditto) y, tras unos guardados con monedas, nace un Pokémon que no tengas. Haz clic para elegir la pareja.';
    return item;
  }

  const progress = isReady(nursery) ? 'huevo listo' : `${nursery.saves}/${savesNeeded(nursery)}`;
  item.description = `${parentNames(state, nursery)} · ${progress}`;
  item.tooltip = isReady(nursery)
    ? 'El huevo está listo: eclosiona en el siguiente guardado con monedas (hace falta conexión). Haz clic para ver el estado.'
    : 'Los guardados con monedas hacen avanzar el huevo. Haz clic para ver el estado o sacar a los Pokémon.';
  return item;
}

// Línea con el Pokémon favorito y su efecto (clic para elegir otro)
function favoriteItem(state: GameState): BackpackItem {
  const item = new BackpackItem('Favorito', vscode.TreeItemCollapsibleState.None);
  item.iconPath = new vscode.ThemeIcon('heart');
  item.command = { command: 'pokemonCompanion.chooseFavorite', title: 'Elegir favorito' };

  const favorite = findFavorite(state);
  const perk = activePerk(state);
  if (!favorite || !state.favorite) {
    item.description = 'ninguno';
    item.tooltip =
      'Elige un Pokémon favorito: su tipo te da un pequeño efecto. Haz clic aquí, o clic derecho sobre un Pokémon.';
    item.contextValue = 'noFavorite';
    return item;
  }

  item.description = `${favorite.name} · ${perk ? PERK_TEXTS[perk] : 'sin efecto'}`;
  item.tooltip = `${favorite.name} (${typeName(state.favorite.type)}). Haz clic para elegir otro.`;
  item.contextValue = 'favorite';
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
    statItem('Huevos eclosionados', formatNumber(stats.eggs), 'home'),
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
  private incenseTimer: ReturnType<typeof setTimeout> | undefined;

  // fled: el último Pokémon que huyó (para la Pokéflauta), que no se guarda en la partida
  constructor(
    private readonly state: StateManager,
    private readonly fled: () => FledPokemon | undefined
  ) {
    this.subscription = state.onDidChange(() => this.emitter.fire());
  }

  refresh(): void {
    this.emitter.fire();
  }

  // Refresca la mochila cuando se apaga el Incienso, para que vuelva a salir el botón
  private refreshWhenIncenseEnds(until: number): void {
    clearTimeout(this.incenseTimer);
    this.incenseTimer = setTimeout(() => this.emitter.fire(), until - Date.now() + 1000);
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
        await fetchEvolutions(id);
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

      const game = this.state.get();
      const done = ACHIEVEMENTS.filter((a) => game.achievements.includes(a.id)).length;
      const rewards = pendingRewards(game).length;
      const achievementsLine = new BackpackItem('Logros', None);
      const pending = rewards === 1 ? '1 recompensa pendiente' : `${rewards} recompensas pendientes`;
      achievementsLine.description = `${done}/${ACHIEVEMENTS.length}${rewards > 0 ? ` · ${pending}` : ''}`;
      achievementsLine.iconPath = new vscode.ThemeIcon('trophy');
      achievementsLine.tooltip = 'Abrir los logros';
      achievementsLine.command = {
        command: 'pokemonCompanion.openAchievements',
        title: 'Abrir logros',
      };

      const favoriteLine = favoriteItem(game);

      return [
        progressItem(progress),
        favoriteLine,
        nurseryItem(game),
        new BackpackItem('Pokéballs', Expanded, 'balls'),
        new BackpackItem('Objetos', Expanded, 'objects'),
        achievementsLine,
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

    if (element.section === 'objects') {
      const game = this.state.get();
      const incenseUntil = incenseActive(game) ? game.incenseUntil : null;
      if (incenseUntil !== null) {
        this.refreshWhenIncenseEnds(incenseUntil);
      }
      // Solo los que tienes (el Incienso también mientras está encendido)
      const owned = OBJECTS.filter(
        (o) => (game.items[o.id] ?? 0) > 0 || (o.kind === 'incense' && incenseUntil !== null)
      );
      if (owned.length === 0) {
        const empty = new BackpackItem('No tienes objetos', None);
        empty.description = 'Los venden en la tienda';
        empty.command = { command: 'pokemonCompanion.openShop', title: 'Abrir tienda' };
        return [empty];
      }
      return owned.map((o) => objectItem(o, game.items[o.id] ?? 0, incenseUntil, this.fled()));
    }

    if (element.section === 'stats') {
      const shinies = groupCaptured(captured).filter((g) => g.pokemon.shiny).length;
      return statsItems(stats, shinies);
    }

    if (element.section === 'pokemon') {
      const game = this.state.get();
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
        // Solo los repetidos normales muestran vender y solo los que evolucionan, el de evolucionar (ver package.json)
        item.contextValue = [
          !pokemon.shiny && count > 1 ? 'duplicatePokemon' : 'singlePokemon',
          evolvable ? 'evolvable' : '',
        ]
          .filter(Boolean)
          .join(' ');

        const details = [
          count > 1 ? `x${count}` : '',
          pokemon.shiny ? 'variocolor' : '',
          isFavorite(game, pokemon.id, Boolean(pokemon.shiny)) ? 'favorito' : '',
          !pokemon.shiny && reservedCopies(game, pokemon.id) > 0 ? 'en la guardería' : '',
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
    clearTimeout(this.incenseTimer);
    this.subscription.dispose();
    this.emitter.dispose();
  }
}
