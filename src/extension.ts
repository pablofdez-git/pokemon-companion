import * as vscode from 'vscode';
import { StateManager } from './data/state';
import { SyncService } from './data/syncService';
import { PokemonData, fetchPokemon } from './data/pokeapi';
import {
  Achievement,
  TIER_LABELS,
  claimReward,
  pendingRewards,
  pickRewardPokemon,
  unlockAchievements,
} from './game/achievements';
import { rewardForSave } from './game/economy';
import { clearFavorite, perkValue } from './game/favorite';
import { sellDuplicate } from './game/shop';
import { maxPokemonId } from './game/generations';
import {
  ENCOUNTER_CHANCE,
  ENCOUNTER_COOLDOWN_MS,
  EncounterGate,
  clampEncounterChance,
  cooldownMsFromSeconds,
  randomPokemonId,
  rollEncounter,
  rollShiny,
} from './game/encounter';
import { ActivityTracker } from './events/activityTracker';
import { AchievementsPanel } from './ui/achievementsPanel';
import { BackpackProvider } from './ui/backpackView';
import { EncounterPanel } from './ui/encounterPanel';
import { chooseFavorite, setFavoriteFor } from './ui/favorite';
import { runEncounter } from './ui/encounterView';
import { BALLS } from './game/items';
import {
  FledPokemon,
  canRecall,
  encounterChanceWithIncense,
  incenseActive,
  useFlute,
  useIncense,
} from './game/objects';
import { evolveFromBackpack } from './ui/evolution';
import { PauseController } from './ui/pauseToggle';
import { PokedexPanel } from './ui/pokedexPanel';
import { openShop } from './ui/shop';
import { CoinStatusBar } from './ui/statusBar';

let syncService: SyncService | undefined;

const REWARD_DELAY_MS = 4000; // para que se vea el final de la captura antes de la recompensa

// De dónde sale un encuentro
type EncounterSource =
  | { kind: 'random' }
  | { kind: 'reward'; achievement: Achievement }           // recompensa de un logro
  | { kind: 'recall'; pokemon: PokemonData; shiny: boolean }; // vuelve con la Pokéflauta

export function activate(context: vscode.ExtensionContext) {
  const state = new StateManager(context.globalState);
  const pause = new PauseController(context.globalState);
  const statusBar = new CoinStatusBar(state);
  // El último Pokémon que huyó, para la Pokéflauta. Solo en memoria: dura unos minutos
  let lastFled: FledPokemon | undefined;
  const backpack = new BackpackProvider(state, () => lastFled);
  const encounterPanel = new EncounterPanel(context.extensionUri);
  const pokedex = new PokedexPanel(context.extensionUri, state);
  const achievementsPanel = new AchievementsPanel(context.extensionUri, state);
  const tracker = new ActivityTracker();
  const settings = () => vscode.workspace.getConfiguration('pokemonCompanion');
  const encounterChance = () =>
    clampEncounterChance(settings().get<number>('encounterChance', ENCOUNTER_CHANCE));
  // Con el Incienso encendido y el efecto del favorito, si los hay
  const currentEncounterChance = () => {
    const game = state.get();
    const chance = encounterChanceWithIncense(encounterChance(), incenseActive(game));
    return Math.min(1, chance * perkValue(game, 'encounter'));
  };
  const gate = new EncounterGate(() =>
    cooldownMsFromSeconds(
      settings().get<number>('encounterCooldownSeconds', ENCOUNTER_COOLDOWN_MS / 1000)
    )
  );
  const sync = new SyncService(state, context.globalState);
  syncService = sync;

  // Si el juego arranca en pausa, el contador de monedas no se ve
  statusBar.setVisible(!pause.isPaused);

  // Los logros se comprueban de uno en uno para que no se pisen al cambiar el estado
  let checking: Promise<void> = Promise.resolve();
  function checkAchievements(): Promise<void> {
    checking = checking
      .then(async () => {
        announceAchievements(await unlockAchievements(state));
      })
      .catch((error) => console.error('Error al comprobar los logros:', error));
    return checking;
  }

  function announceAchievements(unlocked: Achievement[]): void {
    if (unlocked.length === 0) {
      return;
    }
    const text =
      unlocked.length > 3
        ? `Has conseguido ${unlocked.length} logros. Cada uno trae un Pokémon de recompensa.`
        : unlocked
            .map((a) => `Logro conseguido: ${a.name}. Recompensa: un Pokémon ${TIER_LABELS[a.tier]}.`)
            .join(' ');
    void vscode.window.showInformationMessage(text, 'Ver logros').then((choice) => {
      if (choice === 'Ver logros') {
        void vscode.commands.executeCommand('pokemonCompanion.openAchievements');
      }
    });
  }

  // Las recompensas esperan a que haya una ball con la que capturarlas
  function nextReward(): Achievement | undefined {
    const { balls } = state.get();
    const hasBalls = BALLS.some((ball) => (balls[ball.id] ?? 0) > 0);
    return hasBalls ? pendingRewards(state.get())[0] : undefined;
  }

  // Un encuentro normal, el de recompensa de un logro (sin cooldown, y se elige por su nivel)
  // o el de la Pokéflauta (sin cooldown, con el Pokémon que huyó)
  async function startEncounter(source: EncounterSource = { kind: 'random' }): Promise<void> {
    if (pause.isPaused || !gate.canStart(source.kind !== 'random')) {
      return;
    }

    gate.start();
    const reward = source.kind === 'reward' ? source.achievement : undefined;

    let pokemon: PokemonData;
    try {
      const maxId = maxPokemonId(state.get().generationsUnlocked);
      pokemon =
        source.kind === 'recall'
          ? source.pokemon
          : reward
            ? await pickRewardPokemon(reward.tier, maxId, fetchPokemon)
            : await fetchPokemon(randomPokemonId(maxId));
    } catch (error) {
      console.error('No se pudo cargar el Pokémon:', error);
      vscode.window.setStatusBarMessage(
        'Un Pokémon salvaje se ha escapado: no hay conexión con la PokéAPI',
        5000
      );
      gate.cancel();
      return;
    }

    try {
      const shiny =
        source.kind === 'recall'
          ? source.shiny
          : rollShiny(Boolean(pokemon.shinySpriteUrl), perkValue(state.get(), 'shiny'));
      const outcome = await runEncounter(state, encounterPanel, pokemon, shiny, {
        rewardFor: reward?.name,
        recalled: source.kind === 'recall',
      });
      if (reward && outcome === 'captured') {
        await claimReward(state, reward.id);
      }
      // La Pokéflauta puede llamar a los que huyen de un encuentro normal (no a los ya llamados)
      if (source.kind === 'random' && outcome === 'fled') {
        lastFled = { id: pokemon.id, name: pokemon.name, shiny, at: Date.now() };
        backpack.refresh();
      }
    } catch (error) {
      console.error('Error en el encuentro:', error);
      encounterPanel.showIdle();
    } finally {
      gate.end();
    }

    // Si esta captura ha dado un logro, su recompensa llega enseguida
    if (!reward) {
      const pendingBefore = pendingRewards(state.get()).length;
      await checkAchievements();
      const next = nextReward();
      if (next && pendingRewards(state.get()).length > pendingBefore) {
        await new Promise((resolve) => setTimeout(resolve, REWARD_DELAY_MS));
        void startEncounter({ kind: 'reward', achievement: next });
      }
    }
  }

  // La Pokéflauta vuelve a llamar al último que huyó; solo se gasta si el encuentro empieza
  async function playFlute(): Promise<void> {
    const fled = lastFled;
    if (!canRecall(fled)) {
      vscode.window.showWarningMessage('Ningún Pokémon ha huido hace poco.');
      return;
    }
    if (pause.isPaused || !gate.canStart(true)) {
      vscode.window.showWarningMessage('Espera a que termine el encuentro que tienes en marcha.');
      return;
    }
    if (!BALLS.some((b) => (state.get().balls[b.id] ?? 0) > 0)) {
      vscode.window.showWarningMessage('No te quedan Pokéballs para capturarlo.');
      return;
    }

    let pokemon: PokemonData;
    try {
      pokemon = await fetchPokemon(fled.id);
    } catch {
      vscode.window.showWarningMessage('No se pudo llamar al Pokémon: no hay conexión con la PokéAPI.');
      return;
    }
    if (!(await useFlute(state))) {
      vscode.window.showWarningMessage('No tienes ninguna Pokéflauta.');
      return;
    }
    lastFled = undefined; // solo se le puede llamar una vez
    void startEncounter({ kind: 'recall', pokemon, shiny: fled.shiny });
  }

  context.subscriptions.push(
    pause,
    statusBar,
    backpack,
    encounterPanel,
    pokedex,
    achievementsPanel,
    tracker,
    sync,

    // Evoluciones, ventas, compras… cualquier cambio puede completar un logro
    state.onDidChange(() => void checkAchievements()),

    pause.onDidChange((paused) => {
      statusBar.setVisible(!paused);
      if (paused) {
        encounterPanel.abort();
      }
    }),

    vscode.window.registerTreeDataProvider('pokemonCompanion.backpack', backpack),

    vscode.window.registerWebviewViewProvider(
      EncounterPanel.viewId,
      encounterPanel,
      { webviewOptions: { retainContextWhenHidden: true } }
    ),

    vscode.workspace.onDidSaveTextDocument(async (document) => {
      if (pause.isPaused) {
        tracker.consume(document); // lo escrito en pausa no cuenta
        return;
      }

      const changedChars = tracker.peek(document);
      const gained = await rewardForSave(state, changedChars);

      if (gained > 0) {
        tracker.consume(document); // solo se descuentan si dieron monedas
        vscode.window.setStatusBarMessage(`+${gained} 🪙`, 3000);

        await checkAchievements();
        const reward = nextReward();
        if (reward) {
          // Las recompensas pendientes van antes que el azar
          void startEncounter({ kind: 'reward', achievement: reward });
        } else if (
          rollEncounter(currentEncounterChance())
        ) {
          // Sin await: el encuentro espera tu respuesta y no debe bloquear el guardado
          void startEncounter();
        }
      }
    }),

    vscode.commands.registerCommand('pokemonCompanion.togglePause', () =>
      pause.toggle()
    ),

    vscode.commands.registerCommand('pokemonCompanion.openShop', () =>
      openShop(state)
    ),

    vscode.commands.registerCommand('pokemonCompanion.openPokedex', () =>
      pokedex.show()
    ),

    vscode.commands.registerCommand('pokemonCompanion.openAchievements', () =>
      achievementsPanel.show()
    ),

    vscode.commands.registerCommand(
      'pokemonCompanion.sellDuplicate',
      async (item?: { pokemonId?: number }) => {
        if (item?.pokemonId === undefined) {
          return;
        }
        const result = await sellDuplicate(state, item.pokemonId);
        if (result.ok) {
          vscode.window.setStatusBarMessage(
            `${result.name} vendido: +${result.earned} 🪙`,
            4000
          );
        } else {
          vscode.window.showWarningMessage(result.reason);
        }
      }
    ),

    vscode.commands.registerCommand(
      'pokemonCompanion.evolve',
      async (item?: { pokemonId?: number; shiny?: boolean }) => {
        if (item?.pokemonId === undefined) {
          return;
        }
        await evolveFromBackpack(state, item.pokemonId, Boolean(item.shiny));
      }
    ),

    vscode.commands.registerCommand(
      'pokemonCompanion.useObject',
      async (item?: { objectId?: string }) => {
        if (item?.objectId === 'incense') {
          const result = await useIncense(state);
          if (result.ok) {
            const until = new Date(result.until).toLocaleTimeString('es-ES', {
              hour: '2-digit',
              minute: '2-digit',
            });
            vscode.window.showInformationMessage(
              `Incienso encendido hasta las ${until}: los Pokémon salvajes aparecen el doble.`
            );
          } else {
            vscode.window.showWarningMessage(result.reason);
          }
        } else if (item?.objectId === 'poke-flute') {
          await playFlute();
        }
      }
    ),

    vscode.commands.registerCommand('pokemonCompanion.chooseFavorite', () =>
      chooseFavorite(state)
    ),

    vscode.commands.registerCommand(
      'pokemonCompanion.setFavorite',
      async (item?: { pokemonId?: number; shiny?: boolean }) => {
        if (item?.pokemonId === undefined) {
          return;
        }
        await setFavoriteFor(state, item.pokemonId, Boolean(item.shiny));
      }
    ),

    vscode.commands.registerCommand('pokemonCompanion.clearFavorite', async () => {
      await clearFavorite(state);
      vscode.window.showInformationMessage('Ya no tienes Pokémon favorito.');
    }),

    vscode.commands.registerCommand('pokemonCompanion.syncNow', () =>
      sync.syncNow()
    ),

    vscode.commands.registerCommand('pokemonCompanion.resetProgress', async () => {
      const confirm = 'Reiniciar';
      const choice = await vscode.window.showWarningMessage(
        '¿Seguro que quieres reiniciar el progreso? Perderás tus monedas, balls y Pokémon, también en los demás ordenadores sincronizados.',
        { modal: true },
        confirm
      );
      if (choice !== confirm) {
        return;
      }
      await state.reset();
      vscode.window.showInformationMessage('Progreso reiniciado');
    })
  );

  void sync.start();
}

// Al cerrar VS Code, sube lo que quede pendiente
export function deactivate(): Thenable<void> | undefined {
  return syncService?.flush();
}
