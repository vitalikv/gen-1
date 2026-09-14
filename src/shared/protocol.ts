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

/** Команды главного потока для Worker */
export type SimulationCommand = { type: 'init'; config: SimulationConfig };

/** Ответы Worker главному потоку */
export type SimulationResponse = { type: 'ready'; step: number } | { type: 'error'; message: string };
