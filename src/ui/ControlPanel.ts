import { SIMULATION_SPEED_OPTIONS } from '@/core/config';
import type { SimulationSnapshot } from '@/shared/protocol';
import type { SimulationBridge } from '@/worker/SimulationBridge';

/**
 * Панель управления запуском: пуск, пауза, шаг, сброс, скорость и счетчики
 */
export class ControlPanel {
  private readonly _bridge: SimulationBridge;
  private readonly _root: HTMLElement;
  private readonly _startButton: HTMLButtonElement;
  private readonly _pauseButton: HTMLButtonElement;
  private readonly _stepButton: HTMLButtonElement;
  private readonly _resetButton: HTMLButtonElement;
  private readonly _speedSelect: HTMLSelectElement;
  private readonly _stepValue: HTMLElement;
  private readonly _timeValue: HTMLElement;
  private readonly _unsubscribe: () => void;

  public constructor(container: HTMLElement, bridge: SimulationBridge) {
    this._bridge = bridge;

    this._root = document.createElement('div');
    this._root.className = 'control-panel';

    const buttons = document.createElement('div');
    buttons.className = 'control-panel__row';
    this._startButton = this._createButton(buttons, 'Пуск', () => this._bridge.send({ type: 'start' }));
    this._pauseButton = this._createButton(buttons, 'Пауза', () => this._bridge.send({ type: 'pause' }));
    this._stepButton = this._createButton(buttons, 'Шаг', () => this._bridge.send({ type: 'step' }));
    this._resetButton = this._createButton(buttons, 'Сброс', () => this._bridge.send({ type: 'reset' }));

    const speedLabel = document.createElement('label');
    speedLabel.className = 'control-panel__row';
    speedLabel.textContent = 'Скорость';
    this._speedSelect = document.createElement('select');
    for (const speed of SIMULATION_SPEED_OPTIONS) {
      this._speedSelect.add(new Option(`×${speed}`, String(speed)));
    }
    this._speedSelect.addEventListener('change', () => {
      this._bridge.send({ type: 'setSpeed', speed: Number(this._speedSelect.value) });
    });
    speedLabel.appendChild(this._speedSelect);

    const stats = document.createElement('div');
    stats.className = 'control-panel__stats';
    this._stepValue = this._createStat(stats, 'Шаг');
    this._timeValue = this._createStat(stats, 'Время');

    this._root.append(buttons, speedLabel, stats);
    container.appendChild(this._root);

    this._render(bridge.latestSnapshot);
    this._unsubscribe = bridge.subscribe((response) => {
      if (response.type === 'ready' || response.type === 'snapshot') {
        this._render(response.snapshot);
      }
    });
  }

  public dispose(): void {
    this._unsubscribe();
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
}
