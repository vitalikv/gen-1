import { ContextSingleton } from '@/core/ContextSingleton';
import type { SimulationCommand, SimulationResponse } from '@/shared/protocol';
import type { SimulationSnapshot } from '@/shared/snapshot';

export type SimulationListener = (response: SimulationResponse) => void;

/**
 * Типизированный канал команд и ответов между главным потоком и Worker
 */
export class SimulationBridge extends ContextSingleton<SimulationBridge> {
  private _worker: Worker | null = null;
  private _latestSnapshot: SimulationSnapshot | null = null;
  private readonly _listeners = new Set<SimulationListener>();

  /** Последний полученный снимок; более старые не хранятся */
  public get latestSnapshot(): SimulationSnapshot | null {
    return this._latestSnapshot;
  }

  public connect(): void {
    if (this._worker) {
      return;
    }

    this._worker = new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' });
    this._worker.addEventListener('message', (event: MessageEvent<SimulationResponse>) => {
      this._emit(event.data);
    });
    this._worker.addEventListener('error', (event: ErrorEvent) => {
      this._emit({ type: 'error', message: event.message });
    });
  }

  public send(command: SimulationCommand): void {
    if (!this._worker) {
      throw new Error('SimulationBridge: Worker не подключен');
    }
    this._worker.postMessage(command);
  }

  public subscribe(listener: SimulationListener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  public disconnect(): void {
    this._worker?.terminate();
    this._worker = null;
    this._latestSnapshot = null;
    this._listeners.clear();
  }

  private _emit(response: SimulationResponse): void {
    if (response.type === 'ready' || response.type === 'snapshot') {
      this._latestSnapshot = response.snapshot;
    }

    for (const listener of this._listeners) {
      listener(response);
    }
  }
}
