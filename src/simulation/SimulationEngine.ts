import { ContextSingleton } from '@/core/ContextSingleton';
import { Settlement } from '@/settlement/Settlement';
import { MAX_SIMULATION_SPEED, MIN_SIMULATION_SPEED } from '@/core/config';
import type { SeededRandom } from '@/core/SeededRandom';
import type { SimulationConfig } from '@/shared/config';
import { GENE_NAMES } from '@/shared/genes';
import { MODEL_VERSION, SAVED_STATE_FORMAT, type SavedSimulationState } from '@/shared/savedState';
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
import { rememberFood } from './FoodMemory';
import { StatisticsCollector } from './StatisticsCollector';
import { BehaviorSystem } from './systems/BehaviorSystem';
import { EnergySystem } from './systems/EnergySystem';
import { agingOnset, EvolutionSystem, isMature } from './systems/EvolutionSystem';
import { FoodSystem } from './systems/FoodSystem';
import { PredationSystem } from './systems/PredationSystem';
import { validateConfig } from './validateConfig';
import { World } from './World';
import type { Food } from './World';
import type { Organism } from './Organism';

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
  /** Конфигурация, которая применится при следующем сбросе */
  private _nextConfig: SimulationConfig | null = null;
  private _world: World | null = null;
  private _settlement: Settlement | null = null;
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
  private readonly _predationSystem = new PredationSystem();

  public get isInitialized(): boolean {
    return this._world !== null;
  }

  public get step(): number {
    return this._step;
  }

  public get time(): number {
    return this._step * this._requireWorld().config.dt;
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
    validateConfig(config);
    this._nextConfig = structuredClone(config);
    this._speed = 1;
    this.reset();
  }

  /** Создает мир заново по конфигурации следующего запуска; симуляция ставится на паузу */
  public reset(): void {
    const config = this._requireNextConfig();
    const settlement = config.mode === 'settlement' ? new Settlement(structuredClone(config)) : null;
    this._world = settlement ? new World(structuredClone(config)) : World.create(structuredClone(config));
    this._settlement = settlement;
    this._statistics = this._createStatistics(config);
    this._statistics.reset(this._world);
    this._step = 0;
    this._running = false;
    this._accumulator = 0;
  }

  /**
   * Сохраняет конфигурацию для следующего сброса и сразу применяет параметры,
   * которые можно менять во время запуска (applyLiveSettings)
   */
  public updateConfig(config: SimulationConfig, reset: boolean): void {
    this._requireWorld();
    validateConfig(config);
    this._nextConfig = structuredClone(config);

    if (reset) {
      this.reset();
    } else {
      if (!this._settlement) this._world!.applyLiveConfig(config);
    }
  }

  public getConfigState(): { current: SimulationConfig; next: SimulationConfig } {
    return {
      current: structuredClone(this._requireWorld().config),
      next: structuredClone(this._requireNextConfig()),
    };
  }

  public start(): void {
    this._requireWorld();
    if (!this._running) {
      this._running = true;
      this._accumulator = 0;
    }
  }

  public pause(): void {
    this._requireWorld();
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

    const { dt } = this._requireWorld().config;
    const backlogLimit = Math.max(MAX_BACKLOG_REAL_SECONDS * this._speed, dt);
    this._accumulator = Math.min(this._accumulator + Math.max(realSeconds, 0) * this._speed, backlogLimit);

    const steps = Math.min(Math.floor(this._accumulator / dt), maxSteps);
    this._accumulator -= steps * dt;
    this.advance(steps);
    return steps;
  }

  /** Рассчитывает заданное число шагов; результат зависит только от числа шагов */
  public advance(steps: number): void {
    this._requireWorld();
    if (!Number.isInteger(steps) || steps < 0) {
      throw new Error(`SimulationEngine: некорректное число шагов ${steps}`);
    }

    for (let i = 0; i < steps; i++) {
      this._tick();
    }
  }

  /** Полное состояние для точного продолжения */
  public saveState(): SavedSimulationState {
    const world = this._requireWorld();
    return {
      format: SAVED_STATE_FORMAT,
      modelVersion: MODEL_VERSION,
      savedAt: new Date().toISOString(),
      config: structuredClone(world.config),
      nextConfig: structuredClone(this._requireNextConfig()),
      step: this._step,
      world: world.toSaved(),
      statistics: this._statistics!.toSaved(),
      ...(this._settlement ? { settlement: structuredClone(this._settlement.state) } : {}),
    };
  }

  /** Восстанавливает состояние; симуляция ставится на паузу, скорость сохраняется */
  public loadState(state: SavedSimulationState): void {
    if (state?.format !== SAVED_STATE_FORMAT) {
      throw new Error('Файл не является сохранением Gen-1');
    }
    if (state.modelVersion !== MODEL_VERSION) {
      throw new Error(`Сохранение сделано версией модели ${state.modelVersion}, текущая версия ${MODEL_VERSION}`);
    }
    if (!Number.isInteger(state.step) || state.step < 0) {
      throw new Error(`Некорректный номер шага в сохранении: ${state.step}`);
    }
    validateConfig(state.config);
    validateConfig(state.nextConfig);

    const config = structuredClone(state.config);
    const settlement = config.mode === 'settlement' ? new Settlement(config) : null;
    if (settlement) {
      if (!state.settlement) throw new Error('В сохранении отсутствует состояние поселения');
      settlement.restore(state.settlement);
    } else if (state.settlement) throw new Error('Режим сохранения не соответствует состоянию поселения');
    const world = World.fromSaved(config, state.world);
    const statistics = this._createStatistics(config);
    statistics.restore(state.statistics);

    this._nextConfig = structuredClone(state.nextConfig);
    this._world = world;
    this._settlement = settlement;
    this._statistics = statistics;
    this._step = state.step;
    this._running = false;
    this._accumulator = 0;
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
      organismData[offset + ORGANISM_FIELD.sex] = organism.sex === 'male' ? 0 : 1;
      organismData[offset + ORGANISM_FIELD.bodySize] = organism.bodySize;
      organismData[offset + ORGANISM_FIELD.pregnant] = organism.life.pregnancy ? 1 : 0;
      organismData[offset + ORGANISM_FIELD.predator] = organism.isPredator ? 1 : 0;
      for (let g = 0; g < GENE_NAMES.length; g++) {
        organismData[offset + GENE_FIELDS[g]!] = organism.genome.get(GENE_NAMES[g]!);
      }
    }

    const foodData = new Float32Array(food.length * FOOD_STRIDE);
    for (let i = 0; i < food.length; i++) {
      foodData[i * FOOD_STRIDE] = food[i]!.x;
      foodData[i * FOOD_STRIDE + 1] = food[i]!.z;
      foodData[i * FOOD_STRIDE + 2] = food[i]!.maxEnergy > 0 ? food[i]!.energy / food[i]!.maxEnergy : 0;
    }

    return {
      step: this._step,
      time: this.time,
      running: this._running,
      speed: this._speed,
      season: world.environment.seasonMultiplier(this.time),
      organismIds,
      organisms: organismData,
      food: foodData,
      ...(this._settlement ? { settlement: structuredClone(this._settlement.state) } : {}),
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
      agingOnset: agingOnset(this._requireWorld(), organism),
      energy: organism.energy,
      capacity: organism.capacity,
      action: organism.action,
      genes: organism.genome.toValues(),
      life: structuredClone(organism.life),
      mature: isMature(this._requireWorld(), organism),
    };
  }

  /** Один шаг модели; порядок систем и обхода организмов фиксирован */
  private _tick(): void {
    const world = this._requireWorld();
    const { dt } = world.config;

    if (this._settlement) {
      this._settlement.tick(dt);
      this._step++;
      return;
    }

    world.updateImmigration(dt);
    this._foodSystem.spawn(world, dt, this._step * dt);
    this._foodSystem.rebuildIndex(world);
    world.rebuildOrganismIndex();
    const intents = world.organisms.map((organism) => this._behaviorSystem.plan(world, organism, dt));
    const claims = new Map<Food, Organism[]>();
    for (let i = 0; i < world.organisms.length; i++) {
      const organism = world.organisms[i]!;
      const food = this._behaviorSystem.execute(world, organism, intents[i]!, dt);
      if (food) {
        const contenders = claims.get(food) ?? [];
        contenders.push(organism);
        claims.set(food, contenders);
      }
    }
    // При одновременном доступе очередь разыгрывается заново воспроизводимым PRNG.
    for (const [food, contenders] of claims) {
      this._shuffle(world, contenders);
      for (const organism of contenders) {
        this._energySystem.eat(organism, food, world.config.physiology.stomachCapacityShare);
        rememberFood(world, organism, food);
      }
    }
    // Несколько хищников у одной жертвы пробуют поймать её в воспроизводимом случайном порядке.
    const hunts: { predator: Organism; prey: Organism }[] = [];
    intents.forEach((intent, i) => {
      if (intent.prey) hunts.push({ predator: world.organisms[i]!, prey: intent.prey });
    });
    this._shuffle(world, hunts);
    for (const { predator, prey } of hunts) this._predationSystem.tryCatch(world, predator, prey);
    for (const organism of world.organisms) {
      if (!organism.alive) continue;
      this._energySystem.update(world, organism, dt);
      this._evolutionSystem.tryReproduce(world, organism);
    }
    const matingOrder = world.organisms.filter((organism) => organism.life.mateId !== null);
    this._shuffle(world, matingOrder);
    for (const organism of matingOrder) {
      const mate = world.getOrganism(organism.life.mateId!);
      if (mate && mate.action === 'seekingMate') this._evolutionSystem.tryMate(world, organism, mate);
    }

    world.commitStep();
    this._step++;
    this._statistics!.record(world, this._step, this.time);
  }

  /** Перемешивание Фишера — Йетса генератором мира */
  private _shuffle<T>(world: World, items: T[]): void {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(world.random.next() * (i + 1));
      [items[i], items[j]] = [items[j]!, items[i]!];
    }
  }

  private _createStatistics(config: SimulationConfig): StatisticsCollector {
    return new StatisticsCollector(STATS_SAMPLE_INTERVAL / config.dt, STATS_MAX_SAMPLES);
  }

  private _requireNextConfig(): SimulationConfig {
    if (!this._nextConfig) {
      throw new Error('SimulationEngine: симуляция не инициализирована');
    }
    return this._nextConfig;
  }

  private _requireWorld(): World {
    if (!this._world) {
      throw new Error('SimulationEngine: симуляция не инициализирована');
    }
    return this._world;
  }
}
