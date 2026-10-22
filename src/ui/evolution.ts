import * as vscode from 'vscode';
import { StateManager } from '../data/state';
import { PokemonData, fetchEvolutionIds, fetchPokemon } from '../data/pokeapi';
import { availableEvolutions, evolutionCost, evolvePokemon } from '../game/evolution';
import { announceUnlocks } from './encounterView';

interface EvolutionPick extends vscode.QuickPickItem {
  target: PokemonData;
}

// Pregunta a qué evoluciona el Pokémon elegido en la mochila y lo evoluciona pagando monedas
export async function evolveFromBackpack(
  state: StateManager,
  pokemonId: number,
  shiny: boolean
): Promise<void> {
  const owned = state.get().captured.find(
    (c) => c.id === pokemonId && Boolean(c.shiny) === shiny
  );
  if (!owned) {
    return;
  }

  let targets: PokemonData[];
  let blocked = 0; // evoluciones de generaciones aún bloqueadas
  try {
    targets = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Buscando evoluciones de ${owned.name}…` },
      async () => {
        const ids = await fetchEvolutionIds(pokemonId);
        const available = availableEvolutions(ids, state.get().generationsUnlocked);
        blocked = ids.length - available.length;
        return Promise.all(available.map((id) => fetchPokemon(id)));
      }
    );
  } catch (error) {
    console.error('No se pudieron cargar las evoluciones:', error);
    vscode.window.showWarningMessage(
      'No se pudieron consultar las evoluciones: no hay conexión con la PokéAPI.'
    );
    return;
  }

  if (targets.length === 0) {
    vscode.window.showInformationMessage(
      blocked > 0
        ? `${owned.name} evoluciona a un Pokémon de una generación que aún no has desbloqueado.`
        : `${owned.name} no tiene más evoluciones.`
    );
    return;
  }

  const coins = state.get().coins;
  const items: EvolutionPick[] = targets.map((target) => ({
    label: target.name,
    description: `${evolutionCost(target.captureRate)} 🪙`,
    detail: `#${String(target.id).padStart(3, '0')}${shiny ? ' · conserva el variocolor' : ''}`,
    iconPath: target.spriteUrl ? vscode.Uri.parse(target.spriteUrl) : undefined,
    target,
  }));

  const pick = await vscode.window.showQuickPick(items, {
    title: `Evolucionar a ${owned.name} · Tienes ${coins} 🪙`,
    placeHolder: 'Elige la evolución (se usa una copia de este Pokémon)',
  });
  if (!pick) {
    return;
  }

  const result = await evolvePokemon(state, pokemonId, shiny, pick.target);
  if (result.ok) {
    vscode.window.showInformationMessage(
      `¡${result.from} ha evolucionado a ${result.to}! −${result.cost} 🪙`
    );
    announceUnlocks(result.newGenerations);
  } else {
    vscode.window.showWarningMessage(result.reason);
  }
}
