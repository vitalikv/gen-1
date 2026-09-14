import { SeededRandom } from '@/core/SeededRandom';
import { applyLiveSettings, FOOD_RADIUS, type SimulationConfig } from '@/shared/config';
import type { SavedSimulationState } from '@/shared/savedState';
import { Environment, type MutablePoint } from './Environment';
import { Genome } from './Genome';
import { Organism } from './Organism';
import { SpatialIndex } from './SpatialIndex';

export interface Food {
  readonly id: number;
  x: number;
  z: number;
  energy: number;
  eaten: boolean;
}

export interface OffspringParams {
  parent: Organism;
  genome: Genome;
  x: number;
  z: number;
  heading: number;
  energy: number;
}

/** Размер ячейки индекса пищи */
const FOOD_CELL_SIZE = 10;
/** Попыток на единицу стартовой пищи при выборке с учетом плодородия */
const INITIAL_FOOD_ATTEMPTS = 50;
/** Попыток найти свободную от препятствий точку */
const FREE_POINT_ATTEMPTS = 100;

/**
 * Состояние одного эксперимента: границы, среда, организмы, пища и генератор случайных чисел
 * Порядок организмов и пищи — порядок создания; он определяет порядок обновления
 */
export class World {
  public readonly config: SimulationConfig;
  public readonly random: SeededRandom;
  public readonly organisms: Organism[] = [];
  public readonly food: Food[] = [];
  public readonly foodIndex: SpatialIndex<Food>;
  public environment: Environment;

  public birthsTotal = 0;
  public deathsTotal = 0;
  /** Накопленная дробная часть попыток появления пищи */
  public foodSpawnAccumulator = 0;

  private readonly _organismsById = new Map<number, Organism>();
  private readonly _pendingBirths: Organism[] = [];
  private readonly _point: MutablePoint = { x: 0, z: 0 };
  private readonly _normal: MutablePoint = { x: 0, z: 0 };
  private _nextOrganismId = 1;
  private _nextFoodId = 1;

  public constructor(config: SimulationConfig) {
    this.config = config;
    this.random = new SeededRandom(config.seed);
    this.foodIndex = new SpatialIndex(config.world.width, config.world.depth, FOOD_CELL_SIZE);
    this.environment = new Environment(config);
  }

  /** Мир со стартовой пищей и популяцией по seed */
  public static create(config: SimulationConfig): World {
    const world = new World(config);

    const maxAttempts = config.food.initial * INITIAL_FOOD_ATTEMPTS;
    for (let attempt = 0; attempt < maxAttempts && world.food.length < config.food.initial; attempt++) {
      world.trySpawnFood();
    }

    for (let i = 0; i < config.population.initial; i++) {
      const genome = Genome.createInitial(world.random);
      const point = world.randomFreePoint(genome.get('size'));
      const organism = new Organism({
        id: world._nextOrganismId++,
        parentId: null,
        generation: 0,
        genome,
        x: point.x,
        z: point.z,
        heading: world.random.range(0, Math.PI * 2),
        energy: config.energy.capacityPerSize * genome.get('size') * config.energy.initialShare,
        capacityPerSize: config.energy.capacityPerSize,
      });
      world._addOrganism(organism);
    }

    return world;
  }

  /** Восстанавливает мир из сохранения без использования генератора случайных чисел */
  public static fromSaved(config: SimulationConfig, saved: SavedSimulationState['world']): World {
    const world = new World(config);
    world.random.state = saved.randomState;
    world._nextOrganismId = saved.nextOrganismId;
    world._nextFoodId = saved.nextFoodId;
    world.foodSpawnAccumulator = saved.foodSpawnAccumulator;
    world.birthsTotal = saved.birthsTotal;
    world.deathsTotal = saved.deathsTotal;

    for (const item of saved.organisms) {
      const organism = new Organism({
        id: item.id,
        parentId: item.parentId,
        generation: item.generation,
        genome: new Genome(item.genes),
        x: item.x,
        z: item.z,
        heading: item.heading,
        energy: item.energy,
        capacityPerSize: config.energy.capacityPerSize,
      });
      organism.age = item.age;
      organism.currentSpeed = item.currentSpeed;
      organism.action = item.action;
      organism.avoidTimer = item.avoidTimer;
      world._addOrganism(organism);
    }

    for (const item of saved.food) {
      world.food.push({ ...item, eaten: false });
    }

    return world;
  }

  public get halfWidth(): number {
    return this.config.world.width / 2;
  }

  public get halfDepth(): number {
    return this.config.world.depth / 2;
  }

  /** Живые организмы с учетом рождений текущего шага */
  public get populationCount(): number {
    return this.organisms.length + this._pendingBirths.length;
  }

  public getOrganism(id: number): Organism | null {
    return this._organismsById.get(id) ?? null;
  }

  /** Применяет параметры, которые можно менять во время запуска */
  public applyLiveConfig(config: SimulationConfig): void {
    applyLiveSettings(this.config, config);
    this.environment = new Environment(this.config);
  }

  /**
   * Одна попытка появления пищи: точка выбирается равномерно
   * и принимается с вероятностью fertility / maxFertility, если не попала в препятствие
   */
  public trySpawnFood(): Food | null {
    if (this.food.length >= this.config.food.max) {
      return null;
    }

    const x = this.random.range(-this.halfWidth, this.halfWidth);
    const z = this.random.range(-this.halfDepth, this.halfDepth);
    const acceptance = this.random.next() * this.environment.maxFertility;

    if (acceptance >= this.environment.fertilityAt(x, z) || this.environment.isBlocked(x, z, FOOD_RADIUS)) {
      return null;
    }

    const food: Food = { id: this._nextFoodId++, x, z, energy: this.config.food.energy, eaten: false };
    this.food.push(food);
    return food;
  }

  /** Случайная точка, где круг радиуса radius не пересекает препятствия */
  public randomFreePoint(radius: number): MutablePoint {
    const point = { x: 0, z: 0 };
    for (let attempt = 0; attempt < FREE_POINT_ATTEMPTS; attempt++) {
      point.x = this.random.range(-this.halfWidth, this.halfWidth);
      point.z = this.random.range(-this.halfDepth, this.halfDepth);
      if (!this.environment.isBlocked(point.x, point.z, radius)) {
        return point;
      }
    }
    this.environment.resolve(point, radius, this._normal);
    point.x = this.clampX(point.x);
    point.z = this.clampZ(point.z);
    return point;
  }

  /** Добавляет потомка; он начнет действовать со следующего шага */
  public addOffspring(params: OffspringParams): Organism {
    const point = this._point;
    point.x = this.clampX(params.x);
    point.z = this.clampZ(params.z);
    if (this.environment.resolve(point, params.genome.get('size'), this._normal)) {
      point.x = this.clampX(point.x);
      point.z = this.clampZ(point.z);
    }

    const organism = new Organism({
      id: this._nextOrganismId++,
      parentId: params.parent.id,
      generation: params.parent.generation + 1,
      genome: params.genome,
      x: point.x,
      z: point.z,
      heading: params.heading,
      energy: params.energy,
      capacityPerSize: this.config.energy.capacityPerSize,
    });
    this._pendingBirths.push(organism);
    this._organismsById.set(organism.id, organism);
    this.birthsTotal++;
    return organism;
  }

  public clampX(x: number): number {
    return Math.min(Math.max(x, -this.halfWidth), this.halfWidth);
  }

  public clampZ(z: number): number {
    return Math.min(Math.max(z, -this.halfDepth), this.halfDepth);
  }

  /** Завершение шага: удаляет погибших и съеденное, добавляет родившихся с сохранением порядка */
  public commitStep(): void {
    let aliveCount = 0;
    for (const organism of this.organisms) {
      if (organism.alive) {
        this.organisms[aliveCount++] = organism;
      } else {
        this._organismsById.delete(organism.id);
        this.deathsTotal++;
      }
    }
    this.organisms.length = aliveCount;

    for (const organism of this._pendingBirths) {
      this.organisms.push(organism);
    }
    this._pendingBirths.length = 0;

    let foodCount = 0;
    for (const food of this.food) {
      if (!food.eaten) {
        this.food[foodCount++] = food;
      }
    }
    this.food.length = foodCount;
  }

  /** Состояние мира для сохранения; вызывается между шагами */
  public toSaved(): SavedSimulationState['world'] {
    return {
      randomState: this.random.state,
      nextOrganismId: this._nextOrganismId,
      nextFoodId: this._nextFoodId,
      foodSpawnAccumulator: this.foodSpawnAccumulator,
      birthsTotal: this.birthsTotal,
      deathsTotal: this.deathsTotal,
      organisms: this.organisms.map((organism) => ({
        id: organism.id,
        parentId: organism.parentId,
        generation: organism.generation,
        genes: organism.genome.toValues(),
        x: organism.x,
        z: organism.z,
        heading: organism.heading,
        energy: organism.energy,
        age: organism.age,
        currentSpeed: organism.currentSpeed,
        action: organism.action,
        avoidTimer: organism.avoidTimer,
      })),
      food: this.food.map(({ id, x, z, energy }) => ({ id, x, z, energy })),
    };
  }

  private _addOrganism(organism: Organism): void {
    this.organisms.push(organism);
    this._organismsById.set(organism.id, organism);
  }
}
