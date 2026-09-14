/**
 * Протокол сообщений между главным потоком и Worker симуляции
 * Передаются только сериализуемые данные, а не экземпляры классов
 */
import type { SimulationConfig } from './config';
import type { OrganismDetails, SimulationSnapshot, StatsSample } from './snapshot';

/** Команды главного потока для Worker; применяются между шагами расчета */
export type SimulationCommand =
  | { type: 'init'; config: SimulationConfig }
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'step' }
  | { type: 'setSpeed'; speed: number }
  | { type: 'reset' }
  /** Выбор организма для инспектора; null снимает выбор */
  | { type: 'inspectOrganism'; id: number | null };

/** Ответы Worker главному потоку */
export type SimulationResponse =
  | { type: 'ready'; snapshot: SimulationSnapshot }
  | { type: 'snapshot'; snapshot: SimulationSnapshot }
  | { type: 'stats'; history: StatsSample[] }
  /** details = null, если выбранный организм погиб */
  | { type: 'organismDetails'; id: number; details: OrganismDetails | null }
  | { type: 'error'; message: string };
