import { ContextSingleton } from '@/core/ContextSingleton';
import { DEFAULT_SIMULATION_CONFIG } from '@/core/config';
import { CameraController } from '@/rendering/CameraController';
import { EnvironmentRenderer } from '@/rendering/EnvironmentRenderer';
import { SceneManager } from '@/rendering/SceneManager';
import { ViewSettings } from '@/rendering/ViewSettings';
import { WorldRenderer } from '@/rendering/WorldRenderer';
import type { SimulationConfig } from '@/shared/config';
import type { SimulationResponse } from '@/shared/protocol';
import type { SavedSimulationState } from '@/shared/savedState';
import type { StatsSample } from '@/shared/snapshot';
import { ControlPanel, type SimulationControls } from '@/ui/ControlPanel';
import { ExperimentPanel } from '@/ui/ExperimentPanel';
import { InspectorPanel } from '@/ui/InspectorPanel';
import { Notifier } from '@/ui/Notifier';
import { RunComparisonStore } from '@/ui/RunComparisonStore';
import { SettingsPanel } from '@/ui/SettingsPanel';
import { StatsPanel } from '@/ui/StatsPanel';
import { SimulationBridge } from '@/worker/SimulationBridge';

/** Допуск выбора организма щелчком, CSS-пиксели */
const PICK_TOLERANCE_PX = 6;

/** Сохраняет состояние в JSON-файл через ссылку для скачивания */
function downloadState(state: SavedSimulationState): void {
  const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `gen-1-seed${state.config.seed}-step${state.step}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Инициализация и завершение работы приложения
 */
export class App extends ContextSingleton<App> {
  private _disposers: (() => void)[] = [];
  private _worldRenderer: WorldRenderer | null = null;
  private _environmentRenderer: EnvironmentRenderer | null = null;
  private _inspector: InspectorPanel | null = null;
  private _statsPanel: StatsPanel | null = null;
  private _settingsPanel: SettingsPanel | null = null;
  private _experimentPanel: ExperimentPanel | null = null;
  private _notifier: Notifier | null = null;
  private _selectedId: number | null = null;
  private _currentConfig: SimulationConfig | null = null;
  private _history: StatsSample[] = [];
  /** Уведомление, которое покажется после подтверждения конфигурации от Worker */
  private _pendingNotice: string | null = null;

  public start(container: HTMLElement): void {
    if (this._worldRenderer) {
      return;
    }

    const config = structuredClone(DEFAULT_SIMULATION_CONFIG);
    const sceneManager = SceneManager.inst('main');
    sceneManager.init(container, config.world);

    const settings = new ViewSettings();
    const runs = new RunComparisonStore();
    const worldRenderer = new WorldRenderer(sceneManager.scene, settings);
    this._worldRenderer = worldRenderer;
    this._environmentRenderer = new EnvironmentRenderer(sceneManager.scene);

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

    const leftColumn = document.createElement('div');
    leftColumn.className = 'panel-column panel-column--left';
    const rightColumn = document.createElement('div');
    rightColumn.className = 'panel-column panel-column--right';
    container.append(leftColumn, rightColumn);

    const controlPanel = new ControlPanel(leftColumn, bridge, controls, settings);
    this._settingsPanel = new SettingsPanel(leftColumn, {
      apply: (nextConfig, reset) => {
        if (reset) {
          this._select(null);
        }
        this._pendingNotice = reset ? 'Настройки применены, мир создан заново' : 'Настройки применены';
        bridge.send({ type: 'updateConfig', config: nextConfig, reset });
      },
    });
    this._experimentPanel = new ExperimentPanel(leftColumn, runs, settings, {
      saveState: () => bridge.send({ type: 'saveState' }),
      loadState: (file) => this._loadStateFile(file),
      addCurrentRun: () => {
        if (this._currentConfig && this._history.length > 1) {
          const record = runs.add(this._currentConfig, this._history);
          this._notifier?.show(`${record.name} добавлен в сравнение`);
        }
      },
    });

    this._inspector = new InspectorPanel(rightColumn, () => this._select(null));
    this._statsPanel = new StatsPanel(rightColumn, settings, runs);
    this._notifier = new Notifier(container);

    this._disposers.push(
      sceneManager.onFrame((now) => worldRenderer.update(now)),
      bridge.subscribe((response) => this._onSimulationResponse(response)),
      () => cameraController.dispose(),
      () => controlPanel.dispose(),
      () => this._settingsPanel?.dispose(),
      () => this._experimentPanel?.dispose(),
      () => this._statsPanel?.dispose(),
      () => this._notifier?.dispose(),
      () => leftColumn.remove(),
      () => rightColumn.remove(),
    );

    bridge.send({ type: 'init', config });
  }

  public dispose(): void {
    this._disposers.forEach((dispose) => dispose());
    this._disposers = [];
    this._worldRenderer?.dispose();
    this._worldRenderer = null;
    this._environmentRenderer?.dispose();
    this._environmentRenderer = null;
    this._inspector = null;
    this._statsPanel = null;
    this._settingsPanel = null;
    this._experimentPanel = null;
    this._notifier = null;
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

  private async _loadStateFile(file: File): Promise<void> {
    let state: SavedSimulationState;
    try {
      state = JSON.parse(await file.text()) as SavedSimulationState;
    } catch {
      this._notifier?.show(`Не удалось прочитать ${file.name}: это не JSON`, 'error');
      return;
    }
    this._select(null);
    this._pendingNotice = 'Состояние загружено';
    SimulationBridge.inst('main').send({ type: 'loadState', state });
  }

  private _onSimulationResponse(response: SimulationResponse): void {
    switch (response.type) {
      case 'ready':
      case 'snapshot':
        this._worldRenderer?.setSnapshot(response.snapshot);
        this._statsPanel?.setSnapshot(response.snapshot);
        break;
      case 'stats':
        this._history = response.history;
        this._statsPanel?.setHistory(response.history);
        this._experimentPanel?.setHistory(response.history);
        break;
      case 'config':
        this._currentConfig = response.current;
        this._environmentRenderer?.setEnvironment(response.current.environment);
        this._settingsPanel?.setConfig(response.current, response.next);
        this._statsPanel?.setSeasonEnabled(response.current.season.enabled);
        if (this._pendingNotice) {
          this._notifier?.show(this._pendingNotice);
          this._pendingNotice = null;
        }
        break;
      case 'organismDetails':
        if (response.id === this._selectedId) {
          this._inspector?.setDetails(response.id, response.details);
        }
        break;
      case 'state':
        downloadState(response.state);
        this._notifier?.show(`Состояние на шаге ${response.state.step} сохранено в файл`);
        break;
      case 'error':
        this._pendingNotice = null;
        this._notifier?.show(response.message, 'error');
        console.error(`[Gen-1] Ошибка симуляции: ${response.message}`);
        break;
    }
  }
}
