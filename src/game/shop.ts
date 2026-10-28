import { StateManager } from '../data/state';
import { BallType, PREMIER_EVERY } from './items';
import { GameObject } from './objects';
import { sellPrice } from './economy';

export type PurchaseResult =
  | { ok: true; spent: number; premierGift: number }
  | { ok: false; reason: string };

export async function buyBall(
  state: StateManager,
  ball: BallType,
  quantity: number
): Promise<PurchaseResult> {
  if (ball.price === null) {
    return { ok: false, reason: `La ${ball.name} no se vende.` };
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { ok: false, reason: 'Cantidad no válida.' };
  }

  const total = ball.price * quantity;
  // Regalo de Premier Balls por comprar Poké Balls de golpe (no se acumula entre compras)
  const premierGift = ball.id === 'pokeball' ? Math.floor(quantity / PREMIER_EVERY) : 0;
  const coins = state.get().coins;
  if (coins < total) {
    return { ok: false, reason: `Te faltan ${total - coins} monedas.` };
  }

  await state.update((s) => {
    s.coins -= total;
    s.stats.coinsSpent += total;
    s.balls[ball.id] = (s.balls[ball.id] ?? 0) + quantity;
    if (premierGift > 0) {
      s.balls.premierball = (s.balls.premierball ?? 0) + premierGift;
    }
  });
  return { ok: true, spent: total, premierGift };
}

export type ObjectPurchaseResult = { ok: true; spent: number } | { ok: false; reason: string };

export async function buyObject(
  state: StateManager,
  object: GameObject,
  quantity: number
): Promise<ObjectPurchaseResult> {
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { ok: false, reason: 'Cantidad no válida.' };
  }
  const owned = state.get().items[object.id] ?? 0;
  if (object.unique && owned + quantity > 1) {
    return { ok: false, reason: `Ya tienes la ${object.name}: solo se puede tener una.` };
  }

  const total = object.price * quantity;
  const coins = state.get().coins;
  if (coins < total) {
    return { ok: false, reason: `Te faltan ${total - coins} monedas.` };
  }

  await state.update((s) => {
    s.coins -= total;
    s.stats.coinsSpent += total;
    s.items[object.id] = (s.items[object.id] ?? 0) + quantity;
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
    s.stats.coinsEarned += earned;
    result = { ok: true, name: pokemon.name, earned };
  });

  return result;
}
