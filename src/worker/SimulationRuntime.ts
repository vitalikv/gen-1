import type { SimulationCommand, SimulationResponse } from '@/shared/protocol';
import type { SimulationEngine } from '@/simulation/SimulationEngine';

/** Интервал цикла расчета в Worker */
const TICK_INTERVAL_MS = 1000 / 60;
/** Интервал отправки снимков в главный поток */
const SNAPSHOT_INTERVAL_MS = 1000 / 15;
/** Шагов за один проход цикла: между порциями Worker успевает принять команды */
const MAX_STEPS_PER_TICK = 256;

/**
 * Связывает движок с реальным временем внутри Worker:
 * выполняет команды, запускает расчет порциями и отправляет снимки
 */
export class SimulationRuntime {
  private readonly _engine: SimulationEngine;
  private readonly _send: (response: SimulationResponse) => void;
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _lastTickTime = 0;
  private _lastSnapshotTime = 0;
  private _lastSentStep = -1;

  public constructor(engine: SimulationEngine, send: (response: SimulationResponse) => void) {
    this._engine = engine;
    this._send = send;
  }

  public handleCommand(command: SimulationCommand): void {
    switch (command.type) {
      case 'init':
        this._engine.init(command.config);
        this._send({ type: 'ready', snapshot: this._engine.getSnapshot() });
        break;
      case 'start':
        this._engine.start();
        break;
      case 'pause':
        this._engine.pause();
        break;
      case 'step':
        this._engine.stepOnce();
        break;
      case 'setSpeed':
        this._engine.setSpeed(command.speed);
        break;
      case 'reset':
        this._engine.reset();
        break;
    }

    this._syncTimer();
    this._sendSnapshot();
  }

  private _syncTimer(): void {
    if (this._engine.running && !this._timer) {
      this._lastTickTime = performance.now();
      this._timer = setTimeout(this._tick, TICK_INTERVAL_MS);
    } else if (!this._engine.running && this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  private readonly _tick = (): void => {
    this._timer = null;

    const now = performance.now();
    this._engine.update((now - this._lastTickTime) / 1000, MAX_STEPS_PER_TICK);
    this._lastTickTime = now;

    if (now - this._lastSnapshotTime >= SNAPSHOT_INTERVAL_MS && this._engine.step !== this._lastSentStep) {
      this._sendSnapshot();
    }

    this._syncTimer();
  };

  private _sendSnapshot(): void {
    const snapshot = this._engine.getSnapshot();
    this._lastSnapshotTime = performance.now();
    this._lastSentStep = snapshot.step;
    this._send({ type: 'snapshot', snapshot });
  }
}
