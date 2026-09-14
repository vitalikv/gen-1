import { CHART_HEIGHT, CHART_THEME, niceCeil, prepareCanvas } from './chartTheme';

const PADDING = { left: 34, right: 6, top: 6, bottom: 16 };
const BAR_GAP = 2;
const BAR_RADIUS = 2;

/**
 * Гистограмма распределения значений на canvas с подписью столбца при наведении
 */
export class Histogram {
  public readonly element: HTMLElement;

  private readonly _titleElement: HTMLElement;
  private readonly _readout: HTMLElement;
  private readonly _canvas: HTMLCanvasElement;
  private readonly _resizeObserver: ResizeObserver;
  private _counts: number[] = [];
  private _min = 0;
  private _max = 1;
  private _total = 0;
  private _format: (value: number) => string = (value) => value.toFixed(1);
  private _hoverIndex: number | null = null;

  public constructor(title: string) {
    this.element = document.createElement('figure');
    this.element.className = 'chart';

    const header = document.createElement('figcaption');
    header.className = 'chart__header';
    this._titleElement = document.createElement('span');
    this._titleElement.className = 'chart__title';
    this._titleElement.textContent = title;
    this._readout = document.createElement('span');
    this._readout.className = 'chart__readout';
    header.append(this._titleElement, this._readout);

    this._canvas = document.createElement('canvas');
    this._canvas.className = 'chart__canvas';
    this._canvas.style.height = `${CHART_HEIGHT}px`;
    this._canvas.addEventListener('pointermove', this._onPointerMove);
    this._canvas.addEventListener('pointerleave', this._onPointerLeave);

    this.element.append(header, this._canvas);
    this._resizeObserver = new ResizeObserver(() => this._draw());
    this._resizeObserver.observe(this._canvas);
  }

  public setTitle(title: string): void {
    this._titleElement.textContent = title;
  }

  public setData(values: ArrayLike<number>, min: number, max: number, bins: number, format: (value: number) => string): void {
    this._counts = new Array<number>(bins).fill(0);
    this._min = min;
    this._max = max;
    this._total = values.length;
    this._format = format;

    for (let i = 0; i < values.length; i++) {
      const bin = Math.floor(((values[i]! - min) / (max - min)) * bins);
      this._counts[Math.min(Math.max(bin, 0), bins - 1)]!++;
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
    const bins = this._counts.length;
    const yMax = niceCeil(Math.max(0, ...this._counts));
    const baseline = PADDING.top + plotHeight;

    context.lineWidth = 1;
    context.textAlign = 'right';
    context.textBaseline = 'middle';
    for (const value of [0, yMax / 2, yMax]) {
      const y = Math.round(baseline - (value / yMax) * plotHeight) + 0.5;
      context.strokeStyle = value === 0 ? CHART_THEME.axis : CHART_THEME.grid;
      context.beginPath();
      context.moveTo(PADDING.left, y);
      context.lineTo(width - PADDING.right, y);
      context.stroke();
      context.fillStyle = CHART_THEME.mutedText;
      context.fillText(String(Math.round(value)), PADDING.left - 4, y);
    }

    context.textBaseline = 'bottom';
    context.textAlign = 'left';
    context.fillText(this._format(this._min), PADDING.left, height);
    context.textAlign = 'right';
    context.fillText(this._format(this._max), width - PADDING.right, height);

    const slot = plotWidth / Math.max(bins, 1);
    for (let i = 0; i < bins; i++) {
      const count = this._counts[i]!;
      if (count === 0) {
        continue;
      }
      const barHeight = Math.max((count / yMax) * plotHeight, 1);
      context.fillStyle = CHART_THEME.series[0];
      context.globalAlpha = this._hoverIndex === null || this._hoverIndex === i ? 1 : 0.55;
      context.beginPath();
      context.roundRect(
        PADDING.left + i * slot + BAR_GAP / 2,
        baseline - barHeight,
        Math.max(slot - BAR_GAP, 1),
        barHeight,
        [Math.min(BAR_RADIUS, barHeight), Math.min(BAR_RADIUS, barHeight), 0, 0],
      );
      context.fill();
    }
    context.globalAlpha = 1;
  }

  private _updateReadout(): void {
    if (this._hoverIndex === null) {
      this._readout.textContent = `${this._total} орг.`;
      return;
    }
    const step = (this._max - this._min) / this._counts.length;
    const from = this._min + this._hoverIndex * step;
    this._readout.textContent = `${this._format(from)}–${this._format(from + step)}: ${this._counts[this._hoverIndex]}`;
  }

  private readonly _onPointerMove = (event: PointerEvent): void => {
    const bins = this._counts.length;
    if (bins === 0) {
      return;
    }
    const rect = this._canvas.getBoundingClientRect();
    const share = (event.clientX - rect.left - PADDING.left) / (rect.width - PADDING.left - PADDING.right);
    const index = share < 0 || share > 1 ? null : Math.min(Math.floor(share * bins), bins - 1);
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
