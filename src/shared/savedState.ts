import type { SimulationConfig } from './config';
import type { GeneValues } from './genes';
import type { OrganismAction, StatsSample } from './snapshot';

/** Версия модели: сохранения другой версии не загружаются, потому что продолжение не будет точным */
export const MODEL_VERSION = 1;

export const SAVED_STATE_FORMAT = 'gen-1-state';

export interface SavedOrganism {
  id: number;
  parentId: number | null;
  generation: number;
  genes: GeneValues;
  x: number;
  z: number;
  heading: number;
  energy: number;
  age: number;
  currentSpeed: number;
  action: OrganismAction;
  avoidTimer: number;
}

export interface SavedFood {
  id: number;
  x: number;
  z: number;
  energy: number;
}

/**
 * Полное состояние эксперимента для точного продолжения:
 * конфигурация, шаг, сущности, среда и состояние генератора случайных чисел
 */
export interface SavedSimulationState {
  format: typeof SAVED_STATE_FORMAT;
  modelVersion: number;
  savedAt: string;
  /** Конфигурация, по которой идет текущий запуск */
  config: SimulationConfig;
  /** Конфигурация, которая применится при сбросе */
  nextConfig: SimulationConfig;
  step: number;
  world: {
    randomState: number;
    nextOrganismId: number;
    nextFoodId: number;
    foodSpawnAccumulator: number;
    birthsTotal: number;
    deathsTotal: number;
    organisms: SavedOrganism[];
    food: SavedFood[];
  };
  statistics: {
    samples: StatsSample[];
    lastBirths: number;
    lastDeaths: number;
  };
}
