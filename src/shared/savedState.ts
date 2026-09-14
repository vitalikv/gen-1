import type { SimulationConfig } from './config';
import type { GeneValues } from './genes';
import type { OrganismAction, StatsSample } from './snapshot';
import type { LifeState } from './life';

/** Версия модели: сохранения другой версии не загружаются, потому что продолжение не будет точным */
export const MODEL_VERSION = 5;

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
  life: LifeState;
}

export interface SavedFood {
  id: number;
  x: number;
  z: number;
  energy: number;
  maxEnergy: number;
  eaten: boolean;
}

/**
 * Полное состояние эксперимента для точного продолжения:
 * конфигурация, шаг, сущности, среда и состояние генератора случайных чисел
 */
export interface SavedSimulationState {
  settlement?: import('./settlement').SettlementState;
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
    killsTotal: number;
    immigrantsTotal: number;
    immigrationTimer: number;
    organisms: SavedOrganism[];
    food: SavedFood[];
  };
  statistics: {
    samples: StatsSample[];
    lastBirths: number;
    lastDeaths: number;
    lastKills: number;
  };
}
