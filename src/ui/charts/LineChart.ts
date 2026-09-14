import { CHART_HEIGHT, CHART_THEME, formatTime, niceCeil, prepareCanvas } from './chartTheme';

export interface LineSeries {
  label: string;
  color: string;
  values: readonly number[];
}

export interface LineChartOptions {
  title: string;
  format: (value: number) => string;
  yMin?: number;
  yMax?: number;
}

const PADDING = { left: 34, right: 6, top: 6, bottom: 16 };

/**
 * Линейный график по времени на canvas с перекрестием и подписью значений при наведении
 */
export class LineChart {
  public readonly element: HTMLElement;

  private readonly _options: LineChartOptions;
  private readonly _titleElement: HTMLElement;
  private readonly _readout: HTMLElement;
  private readonly _legend: HTMLElement;
  private readonly _canvas: HTMLCanvasElement;
  private readonly _resizeObserver: ResizeObserver;
  private _times: readonly number[] = [];
  private _series: LineSeries[] = [];
  private _hoverIndex: number | null = null;

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

  public setData(times: readonly number[], series: LineSeries[]): void {
    const legendKey = series.map((item) => `${item.label}:${item.color}`).join('|');
    if (legendKey !== this._legend.dataset['key']) {
      this._renderLegend(series, legendKey);
    }
    this._times = times;
    this._series = series;
    if (this._hoverIndex !== null && this._hoverIndex >= times.length) {
      this._hoverIndex = null;
    }
    this._draw();
  }

  public dispose(): void {
    this._resizeObserver.disconnect();
    this.element.remove();
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
    const times = this._times;
    const count = times.length;

    let dataMax = 0;
    for (const series of this._series) {
      for (const value of series.values) {
        dataMax = Math.max(dataMax, value);
      }
    }
    const yMin = this._options.yMin ?? 0;
    const yMax = this._options.yMax ?? niceCeil(dataMax);
    const yRange = yMax - yMin || 1;
    const tMin = times[0] ?? 0;
    const tRange = (times[count - 1] ?? 0) - tMin || 1;
    const toX = (time: number) => PADDING.left + ((time - tMin) / tRange) * plotWidth;
    const toY = (value: number) => PADDING.top + (1 - (value - yMin) / yRange) * plotHeight;

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

    if (count > 0) {
      context.textBaseline = 'bottom';
      context.textAlign = 'left';
      context.fillText(formatTime(tMin), PADDING.left, height);
      context.textAlign = 'right';
      context.fillText(formatTime(times[count - 1]!), width - PADDING.right, height);
    }

    // Линии рядов
    context.lineWidth = 2;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    for (const series of this._series) {
      context.strokeStyle = series.color;
      context.beginPath();
      for (let i = 0; i < count; i++) {
        const x = toX(times[i]!);
        const y = toY(series.values[i] ?? 0);
        if (i === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      }
      if (count === 1) {
        context.lineTo(toX(times[0]!) + 0.1, toY(series.values[0] ?? 0));
      }
      context.stroke();
    }

    // Перекрестие наведения
    if (this._hoverIndex !== null && count > 0) {
      const x = Math.round(toX(times[this._hoverIndex]!)) + 0.5;
      context.strokeStyle = CHART_THEME.crosshair;
      context.globalAlpha = 0.5;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(x, PADDING.top);
      context.lineTo(x, PADDING.top + plotHeight);
      context.stroke();
      context.globalAlpha = 1;

      for (const series of this._series) {
        const y = toY(series.values[this._hoverIndex] ?? 0);
        context.beginPath();
        context.arc(x, y, 4, 0, Math.PI * 2);
        context.fillStyle = series.color;
        context.fill();
        context.lineWidth = 2;
        context.strokeStyle = CHART_THEME.surface;
        context.stroke();
      }
    }
  }

  /** Легенда нужна при двух и более рядах; один ряд называет заголовок */
  private _renderLegend(series: LineSeries[], key: string): void {
    this._legend.dataset['key'] = key;
    this._legend.hidden = series.length < 2;
    this._legend.replaceChildren(
      ...series.map((item) => {
        const entry = document.createElement('span');
        entry.className = 'chart__legend-item';
        const swatch = document.createElement('span');
        swatch.className = 'chart__swatch';
        swatch.style.background = item.color;
        entry.append(swatch, item.label);
        return entry;
      }),
    );
  }

  /** Подпись значений под курсором; без наведения — последние значения */
  private _updateReadout(): void {
    const count = this._times.length;
    if (count === 0) {
      this._readout.textContent = '';
      return;
    }

    const index = this._hoverIndex ?? count - 1;
    const values = this._series.map((series) => {
      const value = this._options.format(series.values[index] ?? 0);
      return this._series.length > 1 ? `${series.label} ${value}` : value;
    });
    const prefix = this._hoverIndex === null ? '' : `${formatTime(this._times[index]!)}: `;
    this._readout.textContent = prefix + values.join(' · ');
  }

  private readonly _onPointerMove = (event: PointerEvent): void => {
    const count = this._times.length;
    if (count === 0) {
      return;
    }
    const rect = this._canvas.getBoundingClientRect();
    const plotWidth = rect.width - PADDING.left - PADDING.right;
    const share = Math.min(Math.max((event.clientX - rect.left - PADDING.left) / plotWidth, 0), 1);
    const tMin = this._times[0]!;
    const target = tMin + share * (this._times[count - 1]! - tMin);

    let low = 0;
    let high = count - 1;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (this._times[middle]! < target) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    const index = low > 0 && target - this._times[low - 1]! < this._times[low]! - target ? low - 1 : low;

    if (index !== this._hoverIndex) {
      this._hoverIndex = index;
      this._draw();
    }
  };

  private readonly _onPointerLeave = (): void => {
    this._hoverIndex = null;
    this._draw();
  };
}
