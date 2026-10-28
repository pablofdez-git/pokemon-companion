import * as vscode from 'vscode';
import { StateManager } from '../data/state';
import { PokemonData, fetchEvolutions, fetchPokemon } from '../data/pokeapi';
import { availableEvolutions, evolutionCost, evolvePokemon } from '../game/evolution';
import { findObject } from '../game/objects';
import { announceUnlocks } from './encounterView';

interface EvolutionTarget {
  pokemon: PokemonData;
  stone: string | null;
}

interface EvolutionPick extends vscode.QuickPickItem {
  target: EvolutionTarget;
}

// Pregunta a qué evoluciona el Pokémon elegido en la mochila y lo evoluciona pagando monedas
// (o gastando una piedra, si esa evolución la necesita)
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

  let targets: EvolutionTarget[];
  let blocked = 0; // evoluciones de generaciones aún bloqueadas
  try {
    targets = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Buscando evoluciones de ${owned.name}…` },
      async () => {
        const steps = await fetchEvolutions(pokemonId);
        const available = availableEvolutions(
          steps.map((step) => step.id),
          state.get().generationsUnlocked
        );
        blocked = steps.length - available.length;
        return Promise.all(
          steps
            .filter((step) => available.includes(step.id))
            .map(async (step) => ({ pokemon: await fetchPokemon(step.id), stone: step.stone }))
        );
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

  const { coins, items: objects } = state.get();
  const items: EvolutionPick[] = targets.map((target) => {
    const stoneName = target.stone ? findObject(target.stone)?.name ?? target.stone : null;
    const details = [
      `#${String(target.pokemon.id).padStart(3, '0')}`,
      stoneName ? `necesita una ${stoneName} (tienes ${objects[target.stone!] ?? 0})` : '',
      shiny ? 'conserva el variocolor' : '',
    ].filter(Boolean);
    return {
      label: target.pokemon.name,
      description: stoneName ?? `${evolutionCost(target.pokemon.captureRate)} 🪙`,
      detail: details.join(' · '),
      iconPath: target.pokemon.spriteUrl ? vscode.Uri.parse(target.pokemon.spriteUrl) : undefined,
      target,
    };
  });

  const pick = await vscode.window.showQuickPick(items, {
    title: `Evolucionar a ${owned.name} · Tienes ${coins} 🪙`,
    placeHolder: 'Elige la evolución (se usa una copia de este Pokémon)',
  });
  if (!pick) {
    return;
  }

  const result = await evolvePokemon(
    state,
    pokemonId,
    shiny,
    pick.target.pokemon,
    pick.target.stone
  );
  if (result.ok) {
    const paid = result.stone
      ? `Has usado una ${findObject(result.stone)?.name ?? result.stone}.`
      : `−${result.cost} 🪙`;
    vscode.window.showInformationMessage(
      `¡${result.from} ha evolucionado a ${result.to}! ${paid}`
    );
    announceUnlocks(result.newGenerations);
  } else {
    vscode.window.showWarningMessage(result.reason);
  }
}
