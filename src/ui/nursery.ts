import * as vscode from 'vscode';
import { fetchPokemon } from '../data/pokeapi';
import { GameState, StateManager } from '../data/state';
import { TIER_LABELS } from '../game/achievements';
import {
  DITTO_ID,
  HatchResult,
  NURSERY_SAVES,
  Pair,
  depositPair,
  eligiblePairs,
  isReady,
  parentNames,
  savesNeeded,
  takeBack,
  tierForCaptureRate,
} from '../game/nursery';
import { announceUnlocks } from './encounterView';

interface PairPick extends vscode.QuickPickItem {
  pair: Pair;
}

type Action = 'status' | 'hatch' | 'back';

interface ActionPick extends vscode.QuickPickItem {
  action: Action;
}

function nameOf(state: GameState, id: number): string {
  return state.captured.find((c) => c.id === id)?.name ?? `#${id}`;
}

export function announceHatch(result: Extract<HatchResult, { ok: true }>): void {
  const name = `${result.shiny ? '★ ' : ''}${result.pokemon.name}`;
  const extra = result.isNew
    ? 'Es nuevo en tu Pokédex.'
    : 'Ya lo tenías: no se encontró ninguna especie nueva de su categoría.';
  void vscode.window.showInformationMessage(`¡El huevo ha eclosionado! Ha nacido ${name}. ${extra}`);
  announceUnlocks(result.newGenerations);
}

// Con la guardería vacía deja elegir la pareja; con una pareja dentro, enseña su estado
export async function openNursery(
  state: StateManager,
  tryHatch: () => Promise<HatchResult | undefined>
): Promise<void> {
  if (state.get().nursery) {
    await manage(state, tryHatch);
  } else {
    await choosePair(state);
  }
}

async function choosePair(state: StateManager): Promise<void> {
  const game = state.get();
  const pairs = eligiblePairs(game);
  if (pairs.length === 0) {
    vscode.window.showInformationMessage(
      'Para usar la guardería necesitas dos copias del mismo Pokémon, o un Ditto y cualquier otro Pokémon.'
    );
    return;
  }

  const items: PairPick[] = pairs.map((pair) => {
    const owned = game.captured.find((c) => c.id === pair.a && !c.shiny);
    const tier = owned?.captureRate !== undefined ? tierForCaptureRate(owned.captureRate) : undefined;
    return {
      label: `${nameOf(game, pair.a)} + ${nameOf(game, pair.b)}`,
      description: pair.b === DITTO_ID ? 'con Ditto' : 'dos repetidos',
      detail: tier
        ? `Nace un Pokémon ${TIER_LABELS[tier]} que no tengas · ${NURSERY_SAVES[tier]} guardados con monedas`
        : undefined,
      iconPath: owned?.spriteUrl ? vscode.Uri.parse(owned.spriteUrl) : undefined,
      pair,
    };
  });

  const pick = await vscode.window.showQuickPick(items, {
    title: 'Guardería: elige la pareja',
    placeHolder: 'Dos repetidos, o cualquier Pokémon con un Ditto',
    matchOnDetail: true,
  });
  if (!pick) {
    return;
  }

  // La categoría la marca la especie (no el Ditto): se saca de la captura o de la PokéAPI
  const owned = game.captured.find((c) => c.id === pick.pair.a && !c.shiny);
  let rate = owned?.captureRate;
  if (rate === undefined) {
    try {
      rate = (await fetchPokemon(pick.pair.a)).captureRate;
    } catch (error) {
      console.error('No se pudo consultar la dificultad:', error);
      vscode.window.showWarningMessage(
        'No se pudo consultar la categoría de este Pokémon: hace falta conexión con la PokéAPI.'
      );
      return;
    }
  }
  const tier = tierForCaptureRate(rate);

  const result = await depositPair(state, pick.pair, tier);
  if (!result.ok) {
    vscode.window.showWarningMessage(result.reason);
    return;
  }
  vscode.window.showInformationMessage(
    `${pick.label} esperan en la guardería: en ${NURSERY_SAVES[tier]} guardados con monedas nacerá un Pokémon ${TIER_LABELS[tier]} que no tengas. Siguen en tu mochila, pero no se pueden vender ni evolucionar mientras tanto.`
  );
}

async function manage(
  state: StateManager,
  tryHatch: () => Promise<HatchResult | undefined>
): Promise<void> {
  const game = state.get();
  const nursery = game.nursery;
  if (!nursery) {
    return;
  }
  const ready = isReady(nursery);

  const items: ActionPick[] = [{ label: 'Ver estado', action: 'status' }];
  if (ready) {
    items.push({ label: 'Intentar eclosionar ahora', action: 'hatch' });
  }
  items.push({
    label: 'Sacar a los Pokémon',
    description: 'se pierde el huevo',
    action: 'back',
  });

  const pick = await vscode.window.showQuickPick(items, {
    title: `Guardería: ${parentNames(game, nursery)}`,
    placeHolder: ready ? 'El huevo está listo' : `${nursery.saves}/${savesNeeded(nursery)} guardados con monedas`,
  });
  if (!pick) {
    return;
  }

  if (pick.action === 'status') {
    const progress = ready
      ? 'el huevo está listo'
      : `${nursery.saves}/${savesNeeded(nursery)} guardados con monedas`;
    vscode.window.showInformationMessage(
      `${parentNames(game, nursery)}: ${progress}. Nacerá un Pokémon ${TIER_LABELS[nursery.tier]} que no tengas.`
    );
  } else if (pick.action === 'hatch') {
    const result = await tryHatch();
    if (result && !result.ok) {
      vscode.window.showWarningMessage(result.reason);
    }
  } else {
    const confirm = 'Sacarlos';
    const choice = await vscode.window.showWarningMessage(
      'Si sacas ahora a los Pokémon, el huevo se pierde.',
      { modal: true },
      confirm
    );
    if (choice === confirm) {
      await takeBack(state);
    }
  }
}
