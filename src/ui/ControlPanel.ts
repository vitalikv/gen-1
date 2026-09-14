import { SIMULATION_SPEED_OPTIONS } from '@/core/config';
import { SEQUENTIAL_GRADIENT_CSS } from '@/rendering/colors';
import { COLOR_MODE_OPTIONS, type ColorMode, type ViewSettings } from '@/rendering/ViewSettings';
import { FOOD_STRIDE, type SimulationSnapshot } from '@/shared/snapshot';
import { GENE_DEFINITIONS } from '@/shared/genes';
import type { SimulationBridge } from '@/worker/SimulationBridge';
import { formatGene } from './format';

/** Действия запуска, которые выполняет приложение */
export interface SimulationControls {
  start(): void;
  pause(): void;
  step(): void;
  reset(): void;
  setSpeed(speed: number): void;
}

/**
 * Панель управления запуском и отображением: пуск, пауза, шаг, сброс, скорость, окраска и слои
 */
export class ControlPanel {
  private readonly _root: HTMLElement;
  private readonly _settings: ViewSettings;
  private readonly _startButton: HTMLButtonElement;
  private readonly _pauseButton: HTMLButtonElement;
  private readonly _stepButton: HTMLButtonElement;
  private readonly _resetButton: HTMLButtonElement;
  private readonly _speedSelect: HTMLSelectElement;
  private readonly _colorSelect: HTMLSelectElement;
  private readonly _legendMin: HTMLElement;
  private readonly _legendMax: HTMLElement;
  private readonly _stepValue: HTMLElement;
  private readonly _timeValue: HTMLElement;
  private readonly _populationValue: HTMLElement;
  private readonly _foodValue: HTMLElement;
  private readonly _seasonValue: HTMLElement;
  private readonly _unsubscribers: (() => void)[] = [];

  public constructor(container: HTMLElement, bridge: SimulationBridge, controls: SimulationControls, settings: ViewSettings) {
    this._settings = settings;

    this._root = document.createElement('section');
    this._root.className = 'panel control-panel';

    const buttons = document.createElement('div');
    buttons.className = 'control-panel__row';
    this._startButton = this._createButton(buttons, 'Пуск', () => controls.start());
    this._pauseButton = this._createButton(buttons, 'Пауза', () => controls.pause());
    this._stepButton = this._createButton(buttons, 'Шаг', () => controls.step());
    this._resetButton = this._createButton(buttons, 'Сброс', () => controls.reset());

    this._speedSelect = document.createElement('select');
    for (const speed of SIMULATION_SPEED_OPTIONS) {
      this._speedSelect.add(new Option(`×${speed}`, String(speed)));
    }
    this._speedSelect.addEventListener('change', () => controls.setSpeed(Number(this._speedSelect.value)));

    const stats = document.createElement('div');
    stats.className = 'control-panel__stats';
    this._stepValue = this._createStat(stats, 'Шаг');
    this._timeValue = this._createStat(stats, 'Время');
    this._populationValue = this._createStat(stats, 'Организмы');
    this._foodValue = this._createStat(stats, 'Пища');
    this._seasonValue = this._createStat(stats, 'Сезон');

    this._colorSelect = document.createElement('select');
    for (const option of COLOR_MODE_OPTIONS) {
      this._colorSelect.add(new Option(option.label, option.value));
    }
    this._colorSelect.value = settings.state.colorMode;
    this._colorSelect.addEventListener('change', () => {
      settings.update({ colorMode: this._colorSelect.value as ColorMode });
    });

    const legend = document.createElement('div');
    legend.className = 'color-legend';
    const gradient = document.createElement('span');
    gradient.className = 'color-legend__gradient';
    gradient.style.background = SEQUENTIAL_GRADIENT_CSS;
    this._legendMin = document.createElement('span');
    this._legendMax = document.createElement('span');
    legend.append(this._legendMin, gradient, this._legendMax);

    const perceptionLabel = document.createElement('label');
    perceptionLabel.className = 'control-panel__row';
    const perceptionCheckbox = document.createElement('input');
    perceptionCheckbox.type = 'checkbox';
    perceptionCheckbox.checked = settings.state.showPerception;
    perceptionCheckbox.addEventListener('change', () => settings.update({ showPerception: perceptionCheckbox.checked }));
    perceptionLabel.append(perceptionCheckbox, 'Радиус восприятия');

    this._root.append(
      buttons,
      this._labeled('Скорость', this._speedSelect),
      stats,
      this._separator(),
      this._labeled('Цвет', this._colorSelect),
      legend,
      perceptionLabel,
    );
    container.appendChild(this._root);

    this._renderLegend();
    this._render(bridge.latestSnapshot);
    this._unsubscribers.push(
      bridge.subscribe((response) => {
        if (response.type === 'ready' || response.type === 'snapshot') {
          this._render(response.snapshot);
        }
      }),
      settings.subscribe(() => this._renderLegend()),
    );
  }

  public dispose(): void {
    this._unsubscribers.forEach((unsubscribe) => unsubscribe());
    this._root.remove();
  }

  private _render(snapshot: SimulationSnapshot | null): void {
    const ready = snapshot !== null;
    const running = snapshot?.running ?? false;

    this._startButton.disabled = !ready || running;
    this._pauseButton.disabled = !ready || !running;
    this._stepButton.disabled = !ready;
    this._resetButton.disabled = !ready;
    this._speedSelect.disabled = !ready;

    if (snapshot) {
      this._speedSelect.value = String(snapshot.speed);
      this._stepValue.textContent = String(snapshot.step);
      this._timeValue.textContent = `${snapshot.time.toFixed(1)} с`;
      this._populationValue.textContent = String(snapshot.organismIds.length);
      this._foodValue.textContent = String(snapshot.food.length / FOOD_STRIDE);
      this._seasonValue.textContent = `${Math.round(snapshot.season * 100)}%`;
    }
  }

  private _renderLegend(): void {
    const mode = this._settings.state.colorMode;
    if (mode === 'energy') {
      this._legendMin.textContent = '0%';
      this._legendMax.textContent = '100%';
    } else {
      const { min, max } = GENE_DEFINITIONS[mode];
      this._legendMin.textContent = formatGene(mode, min);
      this._legendMax.textContent = formatGene(mode, max);
    }
  }

  private _createButton(parent: HTMLElement, label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', onClick);
    parent.appendChild(button);
    return button;
  }

  private _createStat(parent: HTMLElement, label: string): HTMLElement {
    const row = document.createElement('div');
    const value = document.createElement('span');
    value.className = 'control-panel__value';
    value.textContent = '—';
    row.append(`${label}: `, value);
    parent.appendChild(row);
    return value;
  }

  private _labeled(text: string, control: HTMLElement): HTMLElement {
    const label = document.createElement('label');
    label.className = 'control-panel__row';
    label.append(text, control);
    return label;
  }

  private _separator(): HTMLElement {
    const separator = document.createElement('hr');
    separator.className = 'panel__separator';
    return separator;
  }
}
