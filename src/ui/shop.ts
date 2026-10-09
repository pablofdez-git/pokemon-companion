import * as vscode from 'vscode';
import { StateManager } from '../data/state';
import { BALLS, BallType, ballSpriteUrl } from '../game/items';
import { buyBall } from '../game/shop';

interface ShopPick extends vscode.QuickPickItem {
  ball: BallType;
}

export async function openShop(state: StateManager): Promise<void> {
  const { coins, balls } = state.get();

  const items: ShopPick[] = BALLS.map((ball) => ({
    label: ball.name,
    description: `${ball.price} 🪙`,
    detail: `Tienes: ${balls[ball.id] ?? 0} · ${ball.rule}`,
    iconPath: vscode.Uri.parse(ballSpriteUrl(ball)),
    ball,
  }));

  const pick = await vscode.window.showQuickPick(items, {
    title: `Tienda · Tienes ${coins} 🪙`,
    placeHolder: 'Elige qué quieres comprar',
  });
  if (!pick) {
    return;
  }

  const input = await vscode.window.showInputBox({
    title: `Comprar ${pick.ball.name}`,
    prompt: `¿Cuántas quieres? (${pick.ball.price} 🪙 cada una)`,
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

  const quantity = Number(input);
  const result = await buyBall(state, pick.ball, quantity);
  if (result.ok) {
    vscode.window.showInformationMessage(
      `Has comprado ${quantity} ${pick.ball.name} por ${result.spent} 🪙`
    );
  } else {
    vscode.window.showWarningMessage(result.reason);
  }
}
