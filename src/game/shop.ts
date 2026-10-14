import { StateManager } from '../data/state';
import { BallType } from './items';
import { sellPrice } from './economy';

export type PurchaseResult =
  | { ok: true; spent: number }
  | { ok: false; reason: string };

export async function buyBall(
  state: StateManager,
  ball: BallType,
  quantity: number
): Promise<PurchaseResult> {
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { ok: false, reason: 'Cantidad no válida.' };
  }

  const total = ball.price * quantity;
  const coins = state.get().coins;
  if (coins < total) {
    return { ok: false, reason: `Te faltan ${total - coins} monedas.` };
  }

  await state.update((s) => {
    s.coins -= total;
    s.balls[ball.id] = (s.balls[ball.id] ?? 0) + quantity;
  });
  return { ok: true, spent: total };
}

export type SaleResult =
  | { ok: true; name: string; earned: number }
  | { ok: false; reason: string };

export async function sellDuplicate(
  state: StateManager,
  pokemonId: number
): Promise<SaleResult> {
  let result: SaleResult = { ok: false, reason: 'No tienes ese Pokémon.' };

  await state.update((s) => {
    const copies = s.captured.filter((c) => c.id === pokemonId && !c.shiny);

    if (copies.length === 1) {
      result = {
        ok: false,
        reason: 'Solo puedes vender repetidos: te quedarías sin este Pokémon.',
      };
      return;
    }
    if (copies.length === 0) {
      return;
    }

    const pokemon = copies[copies.length - 1];
    const earned = sellPrice(pokemon.captureRate);
    s.captured.splice(s.captured.lastIndexOf(pokemon), 1);
    s.coins += earned;
    result = { ok: true, name: pokemon.name, earned };
  });

  return result;
}
