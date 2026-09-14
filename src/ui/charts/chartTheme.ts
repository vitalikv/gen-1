/** Цвета графиков для темной поверхности панели (#10141a) */
export const CHART_THEME = {
  series: ['#3987e5', '#d95926'],
  surface: '#10141a',
  grid: '#262e3a',
  axis: '#3a4656',
  mutedText: '#898781',
  crosshair: '#c3c2b7',
  font: '10px system-ui, -apple-system, "Segoe UI", sans-serif',
} as const;

export const CHART_HEIGHT = 72;

/** Ближайшее «круглое» значение не меньше value: 1, 2, 5 × 10^n */
export function niceCeil(value: number): number {
  if (!(value > 0)) {
    return 1;
  }
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const factor of [1, 2, 5, 10]) {
    if (value <= factor * magnitude) {
      return factor * magnitude;
    }
  }
  return 10 * magnitude;
}

export function formatTime(seconds: number): string {
  return seconds >= 120 ? `${(seconds / 60).toFixed(seconds >= 600 ? 0 : 1)} мин` : `${Math.round(seconds)} с`;
}

/** Подготавливает canvas под размер элемента и плотность пикселей; возвращает размеры в CSS-пикселях */
export function prepareCanvas(canvas: HTMLCanvasElement): { context: CanvasRenderingContext2D; width: number; height: number } | null {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const context = canvas.getContext('2d');
  if (!context || width === 0 || height === 0) {
    return null;
  }

  const ratio = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.font = CHART_THEME.font;
  return { context, width, height };
}
