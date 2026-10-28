import * as vscode from 'vscode';
import { fetchPokemon } from '../data/pokeapi';
import { StateManager } from '../data/state';
import {
  PERK_TEXTS,
  isFavorite,
  ownedSpecies,
  perkOfType,
  setFavorite,
  typeName,
} from '../game/favorite';

interface SpeciesPick extends vscode.QuickPickItem {
  id: number;
  shiny: boolean;
}

// Elige como favorito un Pokémon de los que tienes. El tipo sale de la captura o, en las
// capturas antiguas (que no lo guardaban), de la PokéAPI.
export async function setFavoriteFor(
  state: StateManager,
  id: number,
  shiny: boolean
): Promise<void> {
  const owned = state.get().captured.find((c) => c.id === id && Boolean(c.shiny) === shiny);
  if (!owned) {
    return;
  }

  let type = owned.types?.[0];
  if (!type) {
    try {
      type = (await fetchPokemon(id)).types[0];
    } catch (error) {
      console.error('No se pudo consultar el tipo:', error);
      vscode.window.showWarningMessage(
        'No se pudo consultar el tipo de este Pokémon: hace falta conexión con la PokéAPI.'
      );
      return;
    }
  }

  const result = await setFavorite(state, id, shiny, type);
  if (!result.ok) {
    vscode.window.showWarningMessage(result.reason);
    return;
  }
  const effect = result.perk ? PERK_TEXTS[result.perk] : 'su tipo no tiene ningún efecto';
  vscode.window.showInformationMessage(
    `${result.name} es ahora tu favorito (${typeName(type)}): ${effect}.`
  );
}

// Lista de tus Pokémon para elegir el favorito (también con clic derecho en la Mochila)
export async function chooseFavorite(state: StateManager): Promise<void> {
  const game = state.get();
  const species = ownedSpecies(game.captured);
  if (species.length === 0) {
    vscode.window.showInformationMessage('Aún no has capturado ningún Pokémon.');
    return;
  }

  const items: SpeciesPick[] = species.map((s) => {
    const perk = perkOfType(s.type);
    return {
      label: `#${String(s.id).padStart(3, '0')} ${s.shiny ? '★ ' : ''}${s.name}`,
      description: isFavorite(game, s.id, s.shiny) ? 'favorito actual' : undefined,
      detail: s.type && perk ? `${typeName(s.type)}: ${PERK_TEXTS[perk]}` : undefined,
      iconPath: s.spriteUrl ? vscode.Uri.parse(s.spriteUrl) : undefined,
      id: s.id,
      shiny: s.shiny,
    };
  });

  const pick = await vscode.window.showQuickPick(items, {
    title: 'Elige tu Pokémon favorito',
    placeHolder: 'Su tipo decide el efecto. Busca por nombre o número',
    matchOnDetail: true,
  });
  if (pick) {
    await setFavoriteFor(state, pick.id, pick.shiny);
  }
}
