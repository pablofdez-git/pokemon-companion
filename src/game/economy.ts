import { StateManager } from '../data/state';

export const COINS_PER_SAVE = 5;

export async function rewardForSave(state: StateManager): Promise<number> {
  await state.update((s) => {
    s.coins += COINS_PER_SAVE;
  });
  return COINS_PER_SAVE;
}
