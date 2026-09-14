import { ContextSingleton } from '@/core/ContextSingleton';
import { DEFAULT_SIMULATION_CONFIG } from '@/core/config';
import { CameraController } from '@/rendering/CameraController';
import { SceneManager } from '@/rendering/SceneManager';
import { ViewSettings } from '@/rendering/ViewSettings';
import { WorldRenderer } from '@/rendering/WorldRenderer';
import type { SimulationResponse } from '@/shared/protocol';
import { ControlPanel, type SimulationControls } from '@/ui/ControlPanel';
import { InspectorPanel } from '@/ui/InspectorPanel';
import { StatsPanel } from '@/ui/StatsPanel';
import { SimulationBridge } from '@/worker/SimulationBridge';

/** Допуск выбора организма щелчком, CSS-пиксели */
const PICK_TOLERANCE_PX = 6;

/**
 * Инициализация и завершение работы приложения
 */
export class App extends ContextSingleton<App> {
  private _disposers: (() => void)[] = [];
  private _worldRenderer: WorldRenderer | null = null;
  private _inspector: InspectorPanel | null = null;
  private _statsPanel: StatsPanel | null = null;
  private _selectedId: number | null = null;

  public start(container: HTMLElement): void {
    if (this._worldRenderer) {
      return;
    }

    const config = structuredClone(DEFAULT_SIMULATION_CONFIG);
    const sceneManager = SceneManager.inst('main');
    sceneManager.init(container, config.world);

    const settings = new ViewSettings();
    const worldRenderer = new WorldRenderer(sceneManager.scene, settings);
    this._worldRenderer = worldRenderer;

    const cameraController = new CameraController(sceneManager.camera, sceneManager.canvas, (point) => {
      this._select(worldRenderer.pickOrganism(point, PICK_TOLERANCE_PX * cameraController.worldUnitsPerPixel()));
    });

    const bridge = SimulationBridge.inst('main');
    bridge.connect();

    const controls: SimulationControls = {
      start: () => bridge.send({ type: 'start' }),
      pause: () => bridge.send({ type: 'pause' }),
      step: () => bridge.send({ type: 'step' }),
      reset: () => {
        this._select(null);
        bridge.send({ type: 'reset' });
      },
      setSpeed: (speed) => bridge.send({ type: 'setSpeed', speed }),
    };

    const controlPanel = new ControlPanel(container, bridge, controls, settings);
    const sideColumn = document.createElement('div');
    sideColumn.className = 'side-column';
    container.appendChild(sideColumn);
    this._inspector = new InspectorPanel(sideColumn, () => this._select(null));
    this._statsPanel = new StatsPanel(sideColumn, settings);

    this._disposers.push(
      sceneManager.onFrame((now) => worldRenderer.update(now)),
      bridge.subscribe((response) => this._onSimulationResponse(response)),
      () => cameraController.dispose(),
      () => controlPanel.dispose(),
      () => this._statsPanel?.dispose(),
      () => sideColumn.remove(),
    );

    bridge.send({ type: 'init', config });
  }

  public dispose(): void {
    this._disposers.forEach((dispose) => dispose());
    this._disposers = [];
    this._worldRenderer?.dispose();
    this._worldRenderer = null;
    this._inspector = null;
    this._statsPanel = null;
    this._selectedId = null;
    SimulationBridge.inst('main').disconnect();
    SceneManager.inst('main').dispose();
  }

  private _select(id: number | null): void {
    if (id === this._selectedId) {
      return;
    }
    this._selectedId = id;
    this._worldRenderer!.selectedId = id;
    SimulationBridge.inst('main').send({ type: 'inspectOrganism', id });

    if (id === null) {
      this._inspector?.hide();
    } else {
      this._inspector?.show(id);
    }
  }

  private _onSimulationResponse(response: SimulationResponse): void {
    switch (response.type) {
      case 'ready':
      case 'snapshot':
        this._worldRenderer?.setSnapshot(response.snapshot);
        this._statsPanel?.setSnapshot(response.snapshot);
        break;
      case 'stats':
        this._statsPanel?.setHistory(response.history);
        break;
      case 'organismDetails':
        if (response.id === this._selectedId) {
          this._inspector?.setDetails(response.id, response.details);
        }
        break;
      case 'error':
        console.error(`[Gen-1] Ошибка симуляции: ${response.message}`);
        break;
    }
  }
}
