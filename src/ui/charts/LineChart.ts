import { CHART_HEIGHT, CHART_THEME, formatTime, niceCeil, prepareCanvas } from './chartTheme';

export interface LineSeries {
  label: string;
  color: string;
  times: readonly number[];
  values: readonly number[];
}

export interface LineChartOptions {
  title: string;
  format: (value: number) => string;
  yMin?: number;
  yMax?: number;
}

const PADDING = { left: 34, right: 6, top: 6, bottom: 16 };

/** Индекс точки ряда, ближайшей по времени */
function nearestIndex(times: readonly number[], target: number): number {
  let low = 0;
  let high = times.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (times[middle]! < target) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low > 0 && target - times[low - 1]! < times[low]! - target ? low - 1 : low;
}

/**
 * Линейный график по времени на canvas; у каждого ряда своя шкала времени
 * При наведении — перекрестие и значения рядов в ближайший момент
 */
export class LineChart {
  public readonly element: HTMLElement;

  private readonly _options: LineChartOptions;
  private readonly _titleElement: HTMLElement;
  private readonly _readout: HTMLElement;
  private readonly _legend: HTMLElement;
  private readonly _legendValues: HTMLElement[] = [];
  private readonly _canvas: HTMLCanvasElement;
  private readonly _resizeObserver: ResizeObserver;
  private _series: LineSeries[] = [];
  private _hoverTime: number | null = null;

  public constructor(options: LineChartOptions) {
    this._options = options;

    this.element = document.createElement('figure');
    this.element.className = 'chart';

    const header = document.createElement('figcaption');
    header.className = 'chart__header';
    this._titleElement = document.createElement('span');
    this._titleElement.className = 'chart__title';
    this._titleElement.textContent = options.title;
    this._readout = document.createElement('span');
    this._readout.className = 'chart__readout';
    header.append(this._titleElement, this._readout);

    this._legend = document.createElement('div');
    this._legend.className = 'chart__legend';
    this._legend.hidden = true;

    this._canvas = document.createElement('canvas');
    this._canvas.className = 'chart__canvas';
    this._canvas.style.height = `${CHART_HEIGHT}px`;
    this._canvas.addEventListener('pointermove', this._onPointerMove);
    this._canvas.addEventListener('pointerleave', this._onPointerLeave);

    this.element.append(header, this._legend, this._canvas);
    this._resizeObserver = new ResizeObserver(() => this._draw());
    this._resizeObserver.observe(this._canvas);
  }

  public setTitle(title: string): void {
    this._titleElement.textContent = title;
  }

  public setOptions(options: Partial<LineChartOptions>): void {
    Object.assign(this._options, options);
    this._draw();
  }

  public setData(series: LineSeries[]): void {
    const legendKey = series.map((item) => `${item.label}:${item.color}`).join('|');
    if (legendKey !== this._legend.dataset['key']) {
      this._renderLegend(series, legendKey);
    }
    this._series = series;
    this._draw();
  }

  public dispose(): void {
    this._resizeObserver.disconnect();
    this.element.remove();
  }

  private _timeRange(): [number, number] | null {
    let min = Infinity;
    let max = -Infinity;
    for (const series of this._series) {
      if (series.times.length > 0) {
        min = Math.min(min, series.times[0]!);
        max = Math.max(max, series.times[series.times.length - 1]!);
      }
    }
    return min <= max ? [min, max] : null;
  }

  private _draw(): void {
    const prepared = prepareCanvas(this._canvas);
    this._updateReadout();
    if (!prepared) {
      return;
    }

    const { context, width, height } = prepared;
    const plotWidth = width - PADDING.left - PADDING.right;
    const plotHeight = height - PADDING.top - PADDING.bottom;
    const range = this._timeRange();

    let dataMax = 0;
    for (const series of this._series) {
      for (const value of series.values) {
        dataMax = Math.max(dataMax, value);
      }
    }
    const yMin = this._options.yMin ?? 0;
    const yMax = this._options.yMax ?? niceCeil(dataMax);
    const yRange = yMax - yMin || 1;
    const [tMin, tMax] = range ?? [0, 1];
    const tRange = tMax - tMin || 1;
    const toX = (time: number) => PADDING.left + ((time - tMin) / tRange) * plotWidth;
    const toY = (value: number) => PADDING.top + (1 - (Math.min(Math.max(value, yMin), yMax) - yMin) / yRange) * plotHeight;

    // Сетка и подписи оси Y
    context.lineWidth = 1;
    context.textAlign = 'right';
    context.textBaseline = 'middle';
    for (const value of [yMin, (yMin + yMax) / 2, yMax]) {
      const y = Math.round(toY(value)) + 0.5;
      context.strokeStyle = value === yMin ? CHART_THEME.axis : CHART_THEME.grid;
      context.beginPath();
      context.moveTo(PADDING.left, y);
      context.lineTo(width - PADDING.right, y);
      context.stroke();
      context.fillStyle = CHART_THEME.mutedText;
      context.fillText(this._options.format(value), PADDING.left - 4, y);
    }

    if (range) {
      context.textBaseline = 'bottom';
      context.textAlign = 'left';
      context.fillText(formatTime(tMin), PADDING.left, height);
      context.textAlign = 'right';
      context.fillText(formatTime(tMax), width - PADDING.right, height);
    }

    // Линии рядов; первый ряд рисуется последним, чтобы оставаться сверху
    context.lineWidth = 2;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    for (const series of [...this._series].reverse()) {
      const count = series.times.length;
      if (count === 0) {
        continue;
      }
      context.strokeStyle = series.color;
      context.beginPath();
      for (let i = 0; i < count; i++) {
        const x = toX(series.times[i]!);
        const y = toY(series.values[i] ?? 0);
        if (i === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      }
      if (count === 1) {
        context.lineTo(toX(series.times[0]!) + 0.1, toY(series.values[0] ?? 0));
      }
      context.stroke();
    }

    // Перекрестие наведения
    if (this._hoverTime !== null && range) {
      const x = Math.round(toX(this._hoverTime)) + 0.5;
      context.strokeStyle = CHART_THEME.crosshair;
      context.globalAlpha = 0.5;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(x, PADDING.top);
      context.lineTo(x, PADDING.top + plotHeight);
      context.stroke();
      context.globalAlpha = 1;

      for (const series of this._series) {
        const index = this._indexAtHover(series);
        if (index === null) {
          continue;
        }
        context.beginPath();
        context.arc(toX(series.times[index]!), toY(series.values[index] ?? 0), 4, 0, Math.PI * 2);
        context.fillStyle = series.color;
        context.fill();
        context.lineWidth = 2;
        context.strokeStyle = CHART_THEME.surface;
        context.stroke();
      }
    }
  }

  /** Точка ряда в момент наведения; null, если ряд не покрывает этот момент */
  private _indexAtHover(series: LineSeries): number | null {
    const count = series.times.length;
    if (count === 0) {
      return null;
    }
    if (this._hoverTime === null) {
      return count - 1;
    }
    if (this._hoverTime > series.times[count - 1]! + 1e-9 || this._hoverTime < series.times[0]! - 1e-9) {
      return null;
    }
    return nearestIndex(series.times, this._hoverTime);
  }

  /** Легенда нужна при двух и более рядах; один ряд называет заголовок */
  private _renderLegend(series: LineSeries[], key: string): void {
    this._legend.dataset['key'] = key;
    this._legend.hidden = series.length < 2;
    this._legendValues.length = 0;
    this._legend.replaceChildren(
      ...series.map((item) => {
        const entry = document.createElement('span');
        entry.className = 'chart__legend-item';
        const swatch = document.createElement('span');
        swatch.className = 'chart__swatch';
        swatch.style.background = item.color;
        const value = document.createElement('span');
        value.className = 'chart__legend-value';
        this._legendValues.push(value);
        entry.append(swatch, item.label, value);
        return entry;
      }),
    );
  }

  /** Значения в момент наведения; без наведения — последние значения */
  private _updateReadout(): void {
    const valueText = (series: LineSeries) => {
      const index = this._indexAtHover(series);
      return index === null ? '—' : this._options.format(series.values[index] ?? 0);
    };
    const timePrefix = this._hoverTime === null ? '' : formatTime(this._hoverTime);

    if (this._series.length === 1) {
      const text = valueText(this._series[0]!);
      this._readout.textContent = timePrefix ? `${timePrefix}: ${text}` : text;
      return;
    }

    this._readout.textContent = timePrefix;
    this._series.forEach((series, i) => {
      const element = this._legendValues[i];
      if (element) {
        element.textContent = valueText(series);
      }
    });
  }

  private readonly _onPointerMove = (event: PointerEvent): void => {
    const range = this._timeRange();
    if (!range) {
      return;
    }
    const rect = this._canvas.getBoundingClientRect();
    const plotWidth = rect.width - PADDING.left - PADDING.right;
    const share = Math.min(Math.max((event.clientX - rect.left - PADDING.left) / plotWidth, 0), 1);
    const target = range[0] + share * (range[1] - range[0]);

    // Привязка к ближайшей точке первого ряда, покрывающего момент
    const anchor = this._series.find((series) => series.times.length > 0 && target <= series.times[series.times.length - 1]! + 1e-9);
    const snapped = anchor ? anchor.times[nearestIndex(anchor.times, target)]! : target;

    if (snapped !== this._hoverTime) {
      this._hoverTime = snapped;
      this._draw();
    }
  };

  private readonly _onPointerLeave = (): void => {
    this._hoverTime = null;
    this._draw();
  };
}
