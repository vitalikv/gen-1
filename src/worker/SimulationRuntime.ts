import type { SimulationCommand, SimulationResponse } from '@/shared/protocol';
import type { SimulationSnapshot } from '@/shared/snapshot';
import type { SimulationEngine } from '@/simulation/SimulationEngine';

/** Интервал цикла расчета в Worker */
const TICK_INTERVAL_MS = 1000 / 60;
/** Интервал отправки снимков в главный поток */
const SNAPSHOT_INTERVAL_MS = 1000 / 15;
/** Минимальный интервал отправки истории статистики */
const STATS_INTERVAL_MS = 500;
/** Шагов за один проход цикла: между порциями Worker успевает принять команды */
const MAX_STEPS_PER_TICK = 256;

export type ResponseSender = (response: SimulationResponse, transfer?: ArrayBuffer[]) => void;

function snapshotTransfer(snapshot: SimulationSnapshot): ArrayBuffer[] {
  return [snapshot.organismIds.buffer, snapshot.organisms.buffer, snapshot.food.buffer] as ArrayBuffer[];
}

/**
 * Связывает движок с реальным временем внутри Worker:
 * выполняет команды, запускает расчет порциями и отправляет снимки, статистику и данные инспектора
 */
export class SimulationRuntime {
  private readonly _engine: SimulationEngine;
  private readonly _send: ResponseSender;
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _lastTickTime = 0;
  private _lastSnapshotTime = 0;
  private _lastSentStep = -1;
  private _lastStatsTime = -Infinity;
  private _lastSentStatsVersion = -1;
  private _selectedId: number | null = null;

  public constructor(engine: SimulationEngine, send: ResponseSender) {
    this._engine = engine;
    this._send = send;
  }

  public handleCommand(command: SimulationCommand): void {
    switch (command.type) {
      case 'init': {
        this._engine.init(command.config);
        this._selectedId = null;
        const snapshot = this._engine.getSnapshot();
        this._send({ type: 'ready', snapshot }, snapshotTransfer(snapshot));
        break;
      }
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
        this._selectedId = null;
        break;
      case 'inspectOrganism':
        this._selectedId = command.id;
        break;
    }

    this._syncTimer();
    this._sendUpdates(true);
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
    try {
      this._engine.update((now - this._lastTickTime) / 1000, MAX_STEPS_PER_TICK);
    } catch (error) {
      this._engine.pause();
      this._send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
    this._lastTickTime = now;

    if (now - this._lastSnapshotTime >= SNAPSHOT_INTERVAL_MS && this._engine.step !== this._lastSentStep) {
      this._sendUpdates(false);
    }

    this._syncTimer();
  };

  private _sendUpdates(force: boolean): void {
    const now = performance.now();
    const snapshot = this._engine.getSnapshot();
    this._lastSnapshotTime = now;
    this._lastSentStep = snapshot.step;
    this._send({ type: 'snapshot', snapshot }, snapshotTransfer(snapshot));

    if (this._selectedId !== null) {
      this._send({
        type: 'organismDetails',
        id: this._selectedId,
        details: this._engine.getOrganismDetails(this._selectedId),
      });
    }

    const statsVersion = this._engine.statsVersion;
    if (statsVersion !== this._lastSentStatsVersion && (force || now - this._lastStatsTime >= STATS_INTERVAL_MS)) {
      this._lastStatsTime = now;
      this._lastSentStatsVersion = statsVersion;
      this._send({ type: 'stats', history: this._engine.statsHistory.slice() });
    }
  }
}
