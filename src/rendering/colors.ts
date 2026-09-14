import { Color } from 'three';

/** Последовательная синяя шкала для темной поверхности: малые значения темнее, большие светлее */
const SEQUENTIAL_STOPS = ['#256abf', '#3987e5', '#6da7ec', '#9ec5f4', '#cde2fb'].map((hex) => new Color(hex));

export const FOOD_COLOR = new Color('#1baf7a');
export const PERCEPTION_COLOR = new Color('#9ec5f4');
export const SELECTION_COLOR = new Color('#fab219');

/** Цвет шкалы для значения t в [0, 1] */
export function sequentialColor(t: number, target: Color): Color {
  const clamped = Math.min(Math.max(Number.isFinite(t) ? t : 0, 0), 1);
  const position = clamped * (SEQUENTIAL_STOPS.length - 1);
  const index = Math.min(Math.floor(position), SEQUENTIAL_STOPS.length - 2);
  return target.lerpColors(SEQUENTIAL_STOPS[index]!, SEQUENTIAL_STOPS[index + 1]!, position - index);
}

export const SEQUENTIAL_GRADIENT_CSS = `linear-gradient(90deg, ${SEQUENTIAL_STOPS.map((color) => `#${color.getHexString()}`).join(', ')})`;
