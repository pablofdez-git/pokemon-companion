import * as vscode from 'vscode';
import { StateManager } from '../data/state';
import { BALLS, BallType, PREMIER_EVERY, ballSpriteUrl } from '../game/items';
import { GameObject, OBJECTS, objectSpriteUrl } from '../game/objects';
import { buyBall, buyObject } from '../game/shop';

type Product = { kind: 'ball'; ball: BallType } | { kind: 'object'; object: GameObject };

interface ShopPick extends vscode.QuickPickItem {
  product?: Product; // los separadores no llevan producto
}

function separator(label: string): ShopPick {
  return { label, kind: vscode.QuickPickItemKind.Separator };
}

export async function openShop(state: StateManager): Promise<void> {
  const { coins, balls, items: owned } = state.get();

  const items: ShopPick[] = [
    separator('Pokéballs'),
    ...BALLS.filter((ball) => ball.price !== null).map((ball) => ({
      label: ball.name,
      description: `${ball.price} 🪙`,
      detail: `Tienes: ${balls[ball.id] ?? 0} · ${ball.rule}`,
      iconPath: vscode.Uri.parse(ballSpriteUrl(ball)),
      product: { kind: 'ball', ball } as Product,
    })),
    separator('Objetos'),
    ...OBJECTS.map((object) => {
      const count = owned[object.id] ?? 0;
      const sold = object.unique && count > 0;
      return {
        label: object.name,
        description: sold ? 'Ya la tienes' : `${object.price} 🪙`,
        detail: `${object.unique ? '' : `Tienes: ${count} · `}${object.rule}`,
        iconPath: vscode.Uri.parse(objectSpriteUrl(object)),
        product: { kind: 'object', object } as Product,
      };
    }),
  ];

  const pick = await vscode.window.showQuickPick(items, {
    title: `Tienda · Tienes ${coins} 🪙`,
    placeHolder: 'Elige qué quieres comprar',
    matchOnDetail: true,
  });
  if (!pick?.product) {
    return;
  }

  const product = pick.product;
  const name = product.kind === 'ball' ? product.ball.name : product.object.name;
  const price = product.kind === 'ball' ? product.ball.price ?? 0 : product.object.price;

  // Los objetos únicos no preguntan cuántos
  let quantity = 1;
  if (product.kind === 'ball' || !product.object.unique) {
    const hint =
      product.kind === 'ball' && product.ball.id === 'pokeball'
        ? ` Por cada ${PREMIER_EVERY} te regalan una Premier Ball.`
        : '';
    const input = await vscode.window.showInputBox({
      title: `Comprar ${name}`,
      prompt: `¿Cuántas ${product.kind === 'ball' ? '' : 'unidades '}quieres? (${price} 🪙 cada una).${hint}`,
      value: '1',
      validateInput: (value) => {
        const n = Number(value);
        return Number.isInteger(n) && n >= 1
          ? undefined
          : 'Escribe un número entero mayor que 0';
      },
    });
    if (input === undefined) {
      return;
    }
    quantity = Number(input);
  }

  if (product.kind === 'ball') {
    const result = await buyBall(state, product.ball, quantity);
    if (!result.ok) {
      vscode.window.showWarningMessage(result.reason);
      return;
    }
    const gift =
      result.premierGift > 0
        ? ` y te regalan ${result.premierGift} Premier Ball${result.premierGift > 1 ? 's' : ''}`
        : '';
    vscode.window.showInformationMessage(
      `Has comprado ${quantity} ${name} por ${result.spent} 🪙${gift}`
    );
    return;
  }

  const result = await buyObject(state, product.object, quantity);
  if (!result.ok) {
    vscode.window.showWarningMessage(result.reason);
    return;
  }
  const usage =
    product.object.kind === 'incense' || product.object.kind === 'flute'
      ? ' Úsalo con el botón de su línea en la Mochila.'
      : '';
  vscode.window.showInformationMessage(
    `Has comprado ${quantity} ${name} por ${result.spent} 🪙.${usage}`
  );
}
