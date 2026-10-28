// Situación de un lanzamiento: lo que miran las balls para calcular su efecto
export interface CatchContext {
  throwNumber: number; // 1 = primer lanzamiento del encuentro
  hour: number;        // hora local, de 0 a 23
  captureBonus?: number; // multiplicador extra (efecto del Pokémon favorito); 1 si no hay
}

export interface BallType {
  id: string;
  name: string;
  price: number | null; // null = no se vende en la tienda
  rule: string;       // explicación corta para la tienda y la mochila
  spriteSlug: string; // nombre del sprite en el repositorio de la PokéAPI
  multiplier: (ctx: CatchContext) => number;
}

// Ajusta estos valores a tu gusto
export const PREMIER_EVERY = 10; // 1 Premier Ball de regalo por cada 10 Poké Balls de una compra

// Balls retiradas: si una partida aún las tiene, se devuelven a este precio en monedas
export const RETIRED_BALLS: Record<string, number> = {
  repeatball: 50,
  timerball: 40,
};

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
    id: 'premierball',
    name: 'Premier Ball',
    price: null,
    rule: `Captura ×1.25 · Regalo por cada ${PREMIER_EVERY} Poké Balls de una compra`,
    spriteSlug: 'premier-ball',
    multiplier: () => 1.25,
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
  return `×${Number(multiplier.toFixed(2))}`; // ×1, ×1.5, ×1.25
}

const SPRITES_BASE_URL =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items';

export function ballSpriteUrl(ball: BallType): string {
  return `${SPRITES_BASE_URL}/${ball.spriteSlug}.png`;
}
