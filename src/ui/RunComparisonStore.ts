import type { SimulationConfig } from '@/shared/config';
import { OBSTACLE_PRESETS, ZONE_PRESETS } from '@/shared/environment';
import { downsampleHistory } from '@/shared/history';
import type { StatsSample } from '@/shared/snapshot';
import { formatTime } from './charts/chartTheme';

/** Запись завершенного или текущего запуска для сравнения */
export interface RunRecord {
  id: string;
  name: string;
  /** Краткое описание условий */
  description: string;
  createdAt: string;
  config: SimulationConfig;
  history: StatsSample[];
  visible: boolean;
  /** Слот цвета 1..MAX_VISIBLE_RUNS; закреплен за записью, пока она видима */
  colorSlot: number | null;
}

const STORAGE_KEY = 'gen-1:runs';
export const MAX_RUNS = 8;
export const MAX_VISIBLE_RUNS = 3;
const MAX_RUN_SAMPLES = 600;

type Listener = (runs: readonly RunRecord[]) => void;

function describeConfig(config: SimulationConfig, history: readonly StatsSample[]): string {
  const parts = [
    `seed ${config.seed}`,
    OBSTACLE_PRESETS[config.environment.obstaclePreset].label,
    ZONE_PRESETS[config.environment.zonePreset].label,
  ];
  if (config.season.enabled) {
    parts.push(`сезон ${Math.round(config.season.period)} с`);
  }
  parts.push(formatTime(history.at(-1)?.time ?? 0));
  return parts.join(' · ');
}

function readStorage(): RunRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as RunRecord[]) : [];
  } catch {
    return [];
  }
}

/**
 * Список запусков для сравнения; хранится в браузере пользователя
 */
export class RunComparisonStore {
  private _runs: RunRecord[];
  private readonly _listeners = new Set<Listener>();

  public constructor() {
    this._runs = readStorage().slice(0, MAX_RUNS);
  }

  public get runs(): readonly RunRecord[] {
    return this._runs;
  }

  public get visibleRuns(): readonly RunRecord[] {
    return this._runs.filter((run) => run.visible && run.colorSlot !== null);
  }

  public get canShowMore(): boolean {
    return this.visibleRuns.length < MAX_VISIBLE_RUNS;
  }

  /** Добавляет запуск; самый старый удаляется при превышении предела */
  public add(config: SimulationConfig, history: readonly StatsSample[]): RunRecord {
    const number = Math.max(0, ...this._runs.map((run) => Number(run.name.match(/\d+$/)?.[0] ?? 0))) + 1;
    const colorSlot = this._freeSlot();
    const record: RunRecord = {
      id: `${Date.now().toString(36)}-${number}`,
      name: `Запуск ${number}`,
      description: describeConfig(config, history),
      createdAt: new Date().toISOString(),
      config: structuredClone(config),
      history: downsampleHistory(history, MAX_RUN_SAMPLES),
      visible: colorSlot !== null,
      colorSlot,
    };

    this._runs = [record, ...this._runs].slice(0, MAX_RUNS);
    this._commit();
    return record;
  }

  public remove(id: string): void {
    this._runs = this._runs.filter((run) => run.id !== id);
    this._commit();
  }

  public setVisible(id: string, visible: boolean): void {
    const run = this._runs.find((item) => item.id === id);
    if (!run || run.visible === visible) {
      return;
    }
    if (visible) {
      const slot = this._freeSlot();
      if (slot === null) {
        return;
      }
      run.colorSlot = slot;
    } else {
      run.colorSlot = null;
    }
    run.visible = visible;
    this._commit();
  }

  public subscribe(listener: Listener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private _freeSlot(): number | null {
    const used = new Set(this.visibleRuns.map((run) => run.colorSlot));
    for (let slot = 1; slot <= MAX_VISIBLE_RUNS; slot++) {
      if (!used.has(slot)) {
        return slot;
      }
    }
    return null;
  }

  private _commit(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._runs));
    } catch {
      // Хранилище недоступно или переполнено: список работает до перезагрузки страницы
    }
    for (const listener of this._listeners) {
      listener(this._runs);
    }
  }
}
