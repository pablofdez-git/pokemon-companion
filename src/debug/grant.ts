import { StateManager } from '../data/state';

// SOLO PARA PRUEBAS: borrar este archivo cuando la economía esté verificada
export async function grantTestItems(state: StateManager): Promise<void> {
  await state.update((s) => {
    s.coins += 100;
    s.balls['pokeball'] = (s.balls['pokeball'] ?? 0) + 10;

    // Dos Rattata iguales, para tener un repetido al instante
    for (let i = 0; i < 2; i++) {
      s.captured.push({
        id: 19,
        name: 'Rattata',
        spriteUrl:
          'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/19.png',
        captureRate: 255,
      });
    }
  });
}
