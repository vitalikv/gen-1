import { ContextSingleton } from '@/core/ContextSingleton';
import { MAX_SIMULATION_SPEED, MIN_SIMULATION_SPEED } from '@/core/config';
import type { SeededRandom } from '@/core/SeededRandom';
import type { SimulationConfig } from '@/shared/config';
import { GENE_NAMES } from '@/shared/genes';
import {
  FOOD_STRIDE,
  ORGANISM_ACTIONS,
  ORGANISM_FIELD,
  ORGANISM_STRIDE,
  organismGeneField,
  type OrganismDetails,
  type SimulationSnapshot,
  type StatsSample,
} from '@/shared/snapshot';
import { StatisticsCollector } from './StatisticsCollector';
import { BehaviorSystem } from './systems/BehaviorSystem';
import { EnergySystem } from './systems/EnergySystem';
import { EvolutionSystem } from './systems/EvolutionSystem';
import { FoodSystem } from './systems/FoodSystem';
import { World } from './World';

/** Максимальное отставание по реальному времени, которое догоняет симуляция */
const MAX_BACKLOG_REAL_SECONDS = 0.25;
/** Интервал точек истории, секунды модели */
const STATS_SAMPLE_INTERVAL = 1;
const STATS_MAX_SAMPLES = 1800;

const GENE_FIELDS = GENE_NAMES.map((name) => organismGeneField(name));

/**
 * Фиксированный шаг, состояние запуска и порядок расчетов
 * Не зависит от Three.js, DOM и таймеров: может работать без визуализации и Worker
 */
export class SimulationEngine extends ContextSingleton<SimulationEngine> {
  private _config: SimulationConfig | null = null;
  private _world: World | null = null;
  private _statistics: StatisticsCollector | null = null;
  private _step = 0;
  private _running = false;
  private _speed = 1;
  /** Накопленное модельное время, которое еще не рассчитано шагами */
  private _accumulator = 0;

  private readonly _foodSystem = new FoodSystem();
  private readonly _behaviorSystem = new BehaviorSystem();
  private readonly _energySystem = new EnergySystem();
  private readonly _evolutionSystem = new EvolutionSystem();

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

  public get world(): World {
    return this._requireWorld();
  }

  public get random(): SeededRandom {
    return this._requireWorld().random;
  }

  public get statsVersion(): number {
    return this._statistics?.version ?? 0;
  }

  public get statsHistory(): readonly StatsSample[] {
    return this._statistics?.history ?? [];
  }

  public init(config: SimulationConfig): void {
    if (!(config.dt > 0) || !Number.isFinite(config.dt)) {
      throw new Error(`SimulationEngine: некорректный шаг dt = ${config.dt}`);
    }
    this._config = structuredClone(config);
    this._statistics = new StatisticsCollector(STATS_SAMPLE_INTERVAL / config.dt, STATS_MAX_SAMPLES);
    this._speed = 1;
    this.reset();
  }

  /** Возвращает мир в начальное состояние с тем же seed; симуляция ставится на паузу */
  public reset(): void {
    const config = this._requireConfig();
    this._world = World.create(config);
    this._statistics!.reset(this._world);
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
    const world = this._requireWorld();
    const { organisms, food } = world;

    const organismIds = new Uint32Array(organisms.length);
    const organismData = new Float32Array(organisms.length * ORGANISM_STRIDE);
    for (let i = 0; i < organisms.length; i++) {
      const organism = organisms[i]!;
      const offset = i * ORGANISM_STRIDE;
      organismIds[i] = organism.id;
      organismData[offset + ORGANISM_FIELD.x] = organism.x;
      organismData[offset + ORGANISM_FIELD.z] = organism.z;
      organismData[offset + ORGANISM_FIELD.heading] = organism.heading;
      organismData[offset + ORGANISM_FIELD.energyRatio] = organism.energyRatio;
      organismData[offset + ORGANISM_FIELD.action] = ORGANISM_ACTIONS.indexOf(organism.action);
      for (let g = 0; g < GENE_NAMES.length; g++) {
        organismData[offset + GENE_FIELDS[g]!] = organism.genome.get(GENE_NAMES[g]!);
      }
    }

    const foodData = new Float32Array(food.length * FOOD_STRIDE);
    for (let i = 0; i < food.length; i++) {
      foodData[i * FOOD_STRIDE] = food[i]!.x;
      foodData[i * FOOD_STRIDE + 1] = food[i]!.z;
    }

    return {
      step: this._step,
      time: this.time,
      running: this._running,
      speed: this._speed,
      organismIds,
      organisms: organismData,
      food: foodData,
    };
  }

  public getOrganismDetails(id: number): OrganismDetails | null {
    const organism = this._requireWorld().getOrganism(id);
    if (!organism || !organism.alive) {
      return null;
    }

    return {
      id: organism.id,
      parentId: organism.parentId,
      generation: organism.generation,
      age: organism.age,
      energy: organism.energy,
      capacity: organism.capacity,
      action: organism.action,
      genes: organism.genome.toValues(),
    };
  }

  /** Один шаг модели; порядок систем и обхода организмов фиксирован */
  private _tick(): void {
    const world = this._requireWorld();
    const { dt } = world.config;

    this._foodSystem.spawn(world, dt);
    this._foodSystem.rebuildIndex(world);

    for (const organism of world.organisms) {
      const reachableFood = this._behaviorSystem.update(world, organism, dt);
      if (reachableFood) {
        this._energySystem.eat(organism, reachableFood);
      }
      this._energySystem.update(world, organism, dt);
      this._evolutionSystem.tryReproduce(world, organism);
    }

    world.commitStep();
    this._step++;
    this._statistics!.record(world, this._step, this.time);
  }

  private _requireConfig(): SimulationConfig {
    if (!this._config) {
      throw new Error('SimulationEngine: симуляция не инициализирована');
    }
    return this._config;
  }

  private _requireWorld(): World {
    this._requireConfig();
    return this._world!;
  }
}
