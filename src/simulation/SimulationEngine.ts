import { ContextSingleton } from '@/core/ContextSingleton';
import { MAX_SIMULATION_SPEED, MIN_SIMULATION_SPEED } from '@/core/config';
import { SeededRandom } from '@/core/SeededRandom';
import type { SimulationConfig, SimulationSnapshot } from '@/shared/protocol';

/** Максимальное отставание по реальному времени, которое догоняет симуляция */
const MAX_BACKLOG_REAL_SECONDS = 0.25;

/**
 * Фиксированный шаг, состояние запуска и порядок расчетов
 * Не зависит от Three.js, DOM и таймеров: может работать без визуализации и Worker
 */
export class SimulationEngine extends ContextSingleton<SimulationEngine> {
  private _config: SimulationConfig | null = null;
  private _random = new SeededRandom(0);
  private _step = 0;
  private _running = false;
  private _speed = 1;
  /** Накопленное модельное время, которое еще не рассчитано шагами */
  private _accumulator = 0;

  public get isInitialized(): boolean {
    return this._config !== null;
  }

  public get step(): number {
    return this._step;
  }

  public get time(): number {
    return this._step * this._requireConfig().dt;
  }

  public get running(): boolean {
    return this._running;
  }

  public get speed(): number {
    return this._speed;
  }

  public get random(): SeededRandom {
    return this._random;
  }

  public init(config: SimulationConfig): void {
    if (!(config.dt > 0) || !Number.isFinite(config.dt)) {
      throw new Error(`SimulationEngine: некорректный шаг dt = ${config.dt}`);
    }
    this._config = { ...config };
    this._speed = 1;
    this.reset();
  }

  /** Возвращает мир в начальное состояние с тем же seed; симуляция ставится на паузу */
  public reset(): void {
    const config = this._requireConfig();
    this._random = new SeededRandom(config.seed);
    this._step = 0;
    this._running = false;
    this._accumulator = 0;
  }

  public start(): void {
    this._requireConfig();
    if (!this._running) {
      this._running = true;
      this._accumulator = 0;
    }
  }

  public pause(): void {
    this._requireConfig();
    this._running = false;
    this._accumulator = 0;
  }

  /** Ставит на паузу и рассчитывает один шаг */
  public stepOnce(): void {
    this.pause();
    this.advance(1);
  }

  public setSpeed(speed: number): void {
    if (!Number.isFinite(speed)) {
      throw new Error(`SimulationEngine: некорректная скорость ${speed}`);
    }
    this._speed = Math.min(Math.max(speed, MIN_SIMULATION_SPEED), MAX_SIMULATION_SPEED);
  }

  /**
   * Переводит прошедшее реальное время в шаги расчета
   * Рассчитывает не больше maxSteps шагов; остаток переносится на следующий вызов
   * @returns число рассчитанных шагов
   */
  public update(realSeconds: number, maxSteps: number): number {
    if (!this._running) {
      return 0;
    }

    const { dt } = this._requireConfig();
    const backlogLimit = Math.max(MAX_BACKLOG_REAL_SECONDS * this._speed, dt);
    this._accumulator = Math.min(this._accumulator + Math.max(realSeconds, 0) * this._speed, backlogLimit);

    const steps = Math.min(Math.floor(this._accumulator / dt), maxSteps);
    this._accumulator -= steps * dt;
    this.advance(steps);
    return steps;
  }

  /** Рассчитывает заданное число шагов; результат зависит только от числа шагов */
  public advance(steps: number): void {
    this._requireConfig();
    if (!Number.isInteger(steps) || steps < 0) {
      throw new Error(`SimulationEngine: некорректное число шагов ${steps}`);
    }

    for (let i = 0; i < steps; i++) {
      this._tick();
    }
  }

  public getSnapshot(): SimulationSnapshot {
    return {
      step: this._step,
      time: this.time,
      running: this._running,
      speed: this._speed,
    };
  }

  /** Один шаг модели; системы мира будут вызываться здесь в фиксированном порядке */
  private _tick(): void {
    this._step++;
  }

  private _requireConfig(): SimulationConfig {
    if (!this._config) {
      throw new Error('SimulationEngine: симуляция не инициализирована');
    }
    return this._config;
  }
}
