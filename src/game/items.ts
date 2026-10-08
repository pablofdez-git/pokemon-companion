export interface BallType {
  id: string;
  name: string;
  multiplier: number;
}

export const BALLS: BallType[] = [
  { id: 'pokeball', name: 'Poké Ball', multiplier: 1 },
  { id: 'greatball', name: 'Super Ball', multiplier: 1.5 },
  { id: 'ultraball', name: 'Ultra Ball', multiplier: 2 },
  { id: 'masterball', name: 'Master Ball', multiplier: Infinity },
];
