import { SeededRandom } from '@/core/SeededRandom';
import { applyLiveSettings, FOOD_RADIUS, type SimulationConfig } from '@/shared/config';
import { GENE_DEFINITIONS, PREDATOR_INITIAL_GENES } from '@/shared/genes';
import type { SavedSimulationState } from '@/shared/savedState';
import { Environment, type MutablePoint } from './Environment';
import { Genome } from './Genome';
import { Organism } from './Organism';
import { SpatialIndex } from './SpatialIndex';
import type { Diet, Sex } from '@/shared/life';

export interface Food {
  readonly id: number;
  x: number;
  z: number;
  energy: number;
  maxEnergy: number;
  eaten: boolean;
}

export interface OffspringParams {
  parent: Organism;
  fatherId?: number;
  generation?: number;
  sex?: Sex;
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
  public readonly organismIndex: SpatialIndex<Organism>;
  public environment: Environment;

  public birthsTotal = 0;
  public deathsTotal = 0;
  /** Травоядные, пойманные хищниками; входят в deathsTotal */
  public killsTotal = 0;
  /** Хищники, пришедшие извне */
  public immigrantsTotal = 0;
  /** Время, прошедшее с момента, когда хищников стало меньше двух */
  public immigrationTimer = 0;
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
    this.organismIndex = new SpatialIndex(config.world.width, config.world.depth, FOOD_CELL_SIZE);
    this.environment = new Environment(config);
  }

  /** Мир со стартовой пищей и популяцией по seed */
  public static create(config: SimulationConfig): World {
    const world = new World(config);

    const maxAttempts = config.food.initial * INITIAL_FOOD_ATTEMPTS;
    for (let attempt = 0; attempt < maxAttempts && world.food.length < config.food.initial; attempt++) {
      world.trySpawnFood();
    }

    const founders = [
      ...Array.from({ length: config.population.initial }, (_, i) => ({ diet: 'herbivore' as const, i })),
      ...Array.from({ length: config.population.initialPredators }, (_, i) => ({ diet: 'predator' as const, i })),
    ];
    for (const { diet, i } of founders) {
      const organism = world._addFounder(diet, i % 2 === 0 ? 'female' : 'male', null);
      organism.age = config.lifecycle.minReproductionAge + world.random.range(0, config.lifecycle.maxAge * 0.3);
    }

    return world;
  }

  /**
   * Приток хищников извне: если вид был в эксперименте и хищников меньше двух,
   * раз в immigrationInterval секунд с края карты приходит взрослая пара со стартовыми генами
   * Вызывается между шагами, до построения индексов
   */
  public updateImmigration(dt: number): void {
    const { immigrationInterval } = this.config.predation;
    let predators = 0;
    for (const organism of this.organisms) if (organism.isPredator) predators++;
    if (immigrationInterval <= 0 || this.config.population.initialPredators <= 0 || predators >= 2) {
      this.immigrationTimer = 0;
      return;
    }
    this.immigrationTimer += dt;
    if (this.immigrationTimer + 1e-9 < immigrationInterval) return;
    this.immigrationTimer = 0;
    const female = this._addFounder('predator', 'female', this._randomEdgePoint(PREDATOR_INITIAL_GENES.size ?? GENE_DEFINITIONS.size.initial));
    // Пара приходит вместе: разминувшиеся по краям карты особи не нашли бы друг друга.
    const male = this._addFounder('predator', 'male', { x: female.x, z: female.z });
    for (const organism of [female, male]) {
      organism.age = this.config.lifecycle.minReproductionAge;
      // Пришедшие извне сыты: иначе пара гибнет от голода, не успев найти добычу.
      organism.energy = organism.capacity;
    }
    this.immigrantsTotal += 2;
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
    world.killsTotal = saved.killsTotal;
    world.immigrantsTotal = saved.immigrantsTotal;
    world.immigrationTimer = saved.immigrationTimer;

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
      organism.life = structuredClone(item.life);
      world._addOrganism(organism);
    }

    for (const item of saved.food) {
      world.food.push({ ...item });
    }

    return world;
  }

  public get halfWidth(): number {
    return this.config.world.width / 2;
  }

  public get halfDepth(): number {
    return this.config.world.depth / 2;
  }

  /** Занятые места с учётом ожидающих рождений; погибшие освобождают место при commitStep. */
  public get populationCount(): number {
    return this.organisms.length + this._pendingBirths.length;
  }

  public rebuildOrganismIndex(): void {
    this.organismIndex.clear();
    for (const organism of this.organisms) {
      if (organism.alive) this.organismIndex.insert(organism);
    }
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

    const food: Food = { id: this._nextFoodId++, x, z, energy: this.config.food.energy,
      maxEnergy: this.config.food.energy, eaten: this.config.food.energy <= 0 };
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
      fatherId: params.fatherId ?? null,
      sex: params.sex ?? (this.random.next() < 0.5 ? 'female' : 'male'),
      diet: params.parent.life.diet,
      generation: params.generation ?? params.parent.generation + 1,
      genome: params.genome,
      x: point.x,
      z: point.z,
      heading: params.heading,
      energy: params.energy,
      capacityPerSize: this.config.energy.capacityPerSize,
    });
    this._pendingBirths.push(organism);
    organism.life.growth = 0.4;
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

  /** Удаляет погибших и пустые источники, сохраняет истощённые растения для отрастания. */
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
      if (food.maxEnergy > 0) {
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
      killsTotal: this.killsTotal,
      immigrantsTotal: this.immigrantsTotal,
      immigrationTimer: this.immigrationTimer,
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
        life: structuredClone(organism.life),
      })),
      food: this.food.map((food) => ({ ...food })),
    };
  }

  /** Особь поколения 0 со стартовыми генами вида; без заданной точки — в случайном свободном месте */
  private _addFounder(diet: Diet, sex: Sex, at: MutablePoint | null): Organism {
    const genome = Genome.createInitial(this.random, diet === 'predator' ? PREDATOR_INITIAL_GENES : {});
    const point = at ? { ...at } : this.randomFreePoint(genome.get('size'));
    if (at && this.environment.resolve(point, genome.get('size'), this._normal)) {
      point.x = this.clampX(point.x);
      point.z = this.clampZ(point.z);
    }
    const organism = new Organism({
      id: this._nextOrganismId++,
      parentId: null,
      sex,
      diet,
      generation: 0,
      genome,
      x: point.x,
      z: point.z,
      heading: Math.atan2(-point.z, -point.x),
      energy: this.config.energy.capacityPerSize * genome.get('size') * this.config.energy.initialShare,
      capacityPerSize: this.config.energy.capacityPerSize,
    });
    if (!at) organism.heading = this.random.range(0, Math.PI * 2);
    this._addOrganism(organism);
    return organism;
  }

  /** Свободная точка у случайного края карты; при неудаче — любая свободная точка */
  private _randomEdgePoint(radius: number): MutablePoint {
    const inset = radius + 1;
    for (let attempt = 0; attempt < FREE_POINT_ATTEMPTS; attempt++) {
      const along = this.random.range(-1, 1);
      const side = Math.floor(this.random.next() * 4);
      const x = side < 2 ? (side === 0 ? -1 : 1) * (this.halfWidth - inset) : along * (this.halfWidth - inset);
      const z = side < 2 ? along * (this.halfDepth - inset) : (side === 2 ? -1 : 1) * (this.halfDepth - inset);
      if (!this.environment.isBlocked(x, z, radius)) return { x, z };
    }
    return this.randomFreePoint(radius);
  }

  private _addOrganism(organism: Organism): void {
    this.organisms.push(organism);
    this._organismsById.set(organism.id, organism);
  }
}
