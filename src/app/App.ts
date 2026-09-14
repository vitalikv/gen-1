import { ContextSingleton } from '@/core/ContextSingleton';
import { DEFAULT_SIMULATION_CONFIG } from '@/core/config';
import { SceneManager } from '@/rendering/SceneManager';
import type { SimulationResponse } from '@/shared/protocol';
import { SimulationBridge } from '@/worker/SimulationBridge';

/**
 * Инициализация и завершение работы приложения
 */
export class App extends ContextSingleton<App> {
  private _unsubscribe: (() => void) | null = null;

  public start(container: HTMLElement): void {
    if (this._unsubscribe) {
      return;
    }

    const config = { ...DEFAULT_SIMULATION_CONFIG };

    SceneManager.inst('main').init(container, { width: config.worldWidth, depth: config.worldDepth });

    const bridge = SimulationBridge.inst('main');
    bridge.connect();
    this._unsubscribe = bridge.subscribe((response) => this._onSimulationResponse(response));
    bridge.send({ type: 'init', config });
  }

  public dispose(): void {
    this._unsubscribe?.();
    this._unsubscribe = null;
    SimulationBridge.inst('main').disconnect();
    SceneManager.inst('main').dispose();
  }

  private _onSimulationResponse(response: SimulationResponse): void {
    switch (response.type) {
      case 'ready':
        console.info(`[Gen-1] Симуляция готова, шаг ${response.step}`);
        break;
      case 'error':
        console.error(`[Gen-1] Ошибка симуляции: ${response.message}`);
        break;
    }
  }
}
