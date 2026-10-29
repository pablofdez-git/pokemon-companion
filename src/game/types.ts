// Nombres en español de los tipos (en la PokéAPI vienen en inglés: fire, water…)
const TYPE_NAMES: Record<string, string> = {
  normal: 'normal',
  fire: 'fuego',
  water: 'agua',
  electric: 'eléctrico',
  grass: 'planta',
  ice: 'hielo',
  fighting: 'lucha',
  poison: 'veneno',
  ground: 'tierra',
  flying: 'volador',
  psychic: 'psíquico',
  bug: 'bicho',
  rock: 'roca',
  ghost: 'fantasma',
  dragon: 'dragón',
  dark: 'siniestro',
  steel: 'acero',
  fairy: 'hada',
};

export function typeName(type: string): string {
  return TYPE_NAMES[type] ?? type;
}
