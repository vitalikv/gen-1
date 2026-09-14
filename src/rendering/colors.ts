import { Color } from 'three';

/** Последовательная синяя шкала для белого фона: малые значения светлее, большие темнее */
const SEQUENTIAL_STOPS = ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#0d366b'].map((hex) => new Color(hex));

export const FOOD_COLOR = new Color('#199e70');
export const PERCEPTION_COLOR = new Color('#2a78d6');
export const SELECTION_COLOR = new Color('#eb6834');
export const OBSTACLE_COLOR = new Color('#b9bec6');
export const ZONE_COLOR = new Color('#1baf7a');

/** Окраска по полу: травоядные — синий и розовый, хищники — тёмно-красный и оранжевый */
export const SEX_COLORS = {
  herbivore: { male: '#2879d0', female: '#c94e91' },
  predator: { male: '#9e2f14', female: '#e0782f' },
} as const;
export const DIET_COLORS = { herbivore: '#2879d0', predator: '#d0452a' } as const;

/** Цвет шкалы для значения t в [0, 1] */
export function sequentialColor(t: number, target: Color): Color {
  const clamped = Math.min(Math.max(Number.isFinite(t) ? t : 0, 0), 1);
  const position = clamped * (SEQUENTIAL_STOPS.length - 1);
  const index = Math.min(Math.floor(position), SEQUENTIAL_STOPS.length - 2);
  return target.lerpColors(SEQUENTIAL_STOPS[index]!, SEQUENTIAL_STOPS[index + 1]!, position - index);
}

export const SEQUENTIAL_GRADIENT_CSS = `linear-gradient(90deg, ${SEQUENTIAL_STOPS.map((color) => `#${color.getHexString()}`).join(', ')})`;
