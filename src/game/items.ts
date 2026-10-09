// Situación de un lanzamiento: lo que miran las balls para calcular su efecto
export interface CatchContext {
  throwNumber: number;   // 1 = primer lanzamiento del encuentro
  alreadyOwned: boolean; // ya tienes esa especie en la mochila
  hour: number;          // hora local, de 0 a 23
}

export interface BallType {
  id: string;
  name: string;
  price: number;
  rule: string;       // explicación corta para la tienda y la mochila
  spriteSlug: string; // nombre del sprite en el repositorio de la PokéAPI
  multiplier: (ctx: CatchContext) => number;
}

const NIGHT_START = 20; // la noche empieza a las 20:00...
const NIGHT_END = 6;    // ...y termina a las 06:00

function isNight(hour: number): boolean {
  return hour >= NIGHT_START || hour < NIGHT_END;
}

export const BALLS: BallType[] = [
  {
    id: 'pokeball',
    name: 'Poké Ball',
    price: 10,
    rule: 'Captura ×1',
    spriteSlug: 'poke-ball',
    multiplier: () => 1,
  },
  {
    id: 'greatball',
    name: 'Super Ball',
    price: 30,
    rule: 'Captura ×1.5',
    spriteSlug: 'great-ball',
    multiplier: () => 1.5,
  },
  {
    id: 'ultraball',
    name: 'Ultra Ball',
    price: 70,
    rule: 'Captura ×2',
    spriteSlug: 'ultra-ball',
    multiplier: () => 2,
  },
  {
    id: 'quickball',
    name: 'Quick Ball',
    price: 80,
    rule: '×5 en el primer lanzamiento, ×1 después',
    spriteSlug: 'quick-ball',
    multiplier: (ctx) => (ctx.throwNumber === 1 ? 5 : 1),
  },
  {
    id: 'duskball',
    name: 'Dusk Ball',
    price: 40,
    rule: '×3 de noche (20:00-06:00), ×1 de día',
    spriteSlug: 'dusk-ball',
    multiplier: (ctx) => (isNight(ctx.hour) ? 3 : 1),
  },
  {
    id: 'repeatball',
    name: 'Repeat Ball',
    price: 50,
    rule: '×3.5 si ya tienes esa especie, ×1 si no',
    spriteSlug: 'repeat-ball',
    multiplier: (ctx) => (ctx.alreadyOwned ? 3.5 : 1),
  },
  {
    id: 'timerball',
    name: 'Timer Ball',
    price: 40,
    rule: 'Sube ×0.5 por cada lanzamiento previo, hasta ×4',
    spriteSlug: 'timer-ball',
    multiplier: (ctx) => Math.min(4, 1 + 0.5 * (ctx.throwNumber - 1)),
  },
  {
    id: 'masterball',
    name: 'Master Ball',
    price: 1000,
    rule: 'Captura segura',
    spriteSlug: 'master-ball',
    multiplier: () => Infinity,
  },
];

// Texto del multiplicador para mostrarlo en las listas
export function describeMultiplier(multiplier: number): string {
  if (multiplier === Infinity) {
    return 'captura segura';
  }
  return `×${Number.isInteger(multiplier) ? multiplier : multiplier.toFixed(1)}`;
}

const SPRITES_BASE_URL =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items';

export function ballSpriteUrl(ball: BallType): string {
  return `${SPRITES_BASE_URL}/${ball.spriteSlug}.png`;
}
