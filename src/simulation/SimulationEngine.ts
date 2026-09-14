import { ContextSingleton } from '@/core/ContextSingleton';
import type { SimulationConfig } from '@/shared/protocol';

/**
 * Управляет запуском симуляции в Worker
 * Не зависит от Three.js и DOM: может работать без визуализации
 */
export class SimulationEngine extends ContextSingleton<SimulationEngine> {
  private _config: SimulationConfig | null = null;
  private _step = 0;

  public get step(): number {
    return this._step;
  }

  public get isInitialized(): boolean {
    return this._config !== null;
  }

  public init(config: SimulationConfig): void {
    this._config = { ...config };
    this._step = 0;
  }
}
