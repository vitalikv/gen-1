/**
 * Протокол сообщений между главным потоком и Worker симуляции
 * Передаются только сериализуемые данные, а не экземпляры классов
 */

export interface SimulationConfig {
  /** Seed генератора случайных чисел эксперимента */
  seed: number;
  /** Размер мира по оси X */
  worldWidth: number;
  /** Размер мира по оси Z */
  worldDepth: number;
  /** Фиксированный шаг модельного времени, секунды */
  dt: number;
}

/** Снимок состояния симуляции для отображения */
export interface SimulationSnapshot {
  /** Номер последнего рассчитанного шага */
  step: number;
  /** Модельное время, секунды */
  time: number;
  running: boolean;
  /** Множитель скорости модельного времени относительно реального */
  speed: number;
}

/** Команды главного потока для Worker; применяются между шагами расчета */
export type SimulationCommand =
  | { type: 'init'; config: SimulationConfig }
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'step' }
  | { type: 'setSpeed'; speed: number }
  | { type: 'reset' };

/** Ответы Worker главному потоку */
export type SimulationResponse =
  | { type: 'ready'; snapshot: SimulationSnapshot }
  | { type: 'snapshot'; snapshot: SimulationSnapshot }
  | { type: 'error'; message: string };
