export interface BallType {
  id: string;
  name: string;
  multiplier: number;
  price: number;
}

export const BALLS: BallType[] = [
  { id: 'pokeball', name: 'Poké Ball', multiplier: 1, price: 10 },
  { id: 'greatball', name: 'Super Ball', multiplier: 1.5, price: 30 },
  { id: 'ultraball', name: 'Ultra Ball', multiplier: 2, price: 70 },
  { id: 'masterball', name: 'Master Ball', multiplier: Infinity, price: 1000 },
];
