/**
 * Протокол сообщений между главным потоком и Worker симуляции
 * Передаются только сериализуемые данные, а не экземпляры классов
 */
import type { SimulationConfig } from './config';
import type { SavedSimulationState } from './savedState';
import type { OrganismDetails, SimulationSnapshot, StatsSample } from './snapshot';

/** Команды главного потока для Worker; применяются между шагами расчета */
export type SimulationCommand =
  | { type: 'init'; config: SimulationConfig }
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'step' }
  | { type: 'setSpeed'; speed: number }
  | { type: 'reset' }
  /**
   * Новая конфигурация: параметры запуска применяются сразу, остальные — при сбросе
   * reset = true сразу перезапускает мир с новой конфигурацией
   */
  | { type: 'updateConfig'; config: SimulationConfig; reset: boolean }
  /** Выбор организма для инспектора; null снимает выбор */
  | { type: 'inspectOrganism'; id: number | null }
  | { type: 'saveState' }
  | { type: 'loadState'; state: SavedSimulationState };

/** Ответы Worker главному потоку */
export type SimulationResponse =
  | { type: 'ready'; snapshot: SimulationSnapshot }
  | { type: 'snapshot'; snapshot: SimulationSnapshot }
  | { type: 'stats'; history: StatsSample[] }
  /** current — конфигурация текущего запуска, next — применится при сбросе */
  | { type: 'config'; current: SimulationConfig; next: SimulationConfig }
  /** details = null, если выбранный организм погиб */
  | { type: 'organismDetails'; id: number; details: OrganismDetails | null }
  | { type: 'state'; state: SavedSimulationState }
  | { type: 'error'; message: string };
