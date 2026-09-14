import { SeededRandom } from '@/core/SeededRandom';
import type { SimulationConfig } from '@/shared/config';
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

/**
 * Состояние одного эксперимента: границы, организмы, пища и генератор случайных чисел
 * Порядок организмов и пищи — порядок создания; он определяет порядок обновления
 */
export class World {
  public readonly config: SimulationConfig;
  public readonly random: SeededRandom;
  public readonly organisms: Organism[] = [];
  public readonly food: Food[] = [];
  public readonly foodIndex: SpatialIndex<Food>;

  public birthsTotal = 0;
  public deathsTotal = 0;
  /** Накопленная дробная часть появления пищи */
  public foodSpawnAccumulator = 0;

  private readonly _organismsById = new Map<number, Organism>();
  private readonly _pendingBirths: Organism[] = [];
  private _nextOrganismId = 1;
  private _nextFoodId = 1;

  public constructor(config: SimulationConfig) {
    this.config = config;
    this.random = new SeededRandom(config.seed);
    this.foodIndex = new SpatialIndex(config.world.width, config.world.depth, FOOD_CELL_SIZE);
  }

  /** Мир со стартовой пищей и популяцией по seed */
  public static create(config: SimulationConfig): World {
    const world = new World(config);

    for (let i = 0; i < config.food.initial; i++) {
      world.spawnFood();
    }

    for (let i = 0; i < config.population.initial; i++) {
      const genome = Genome.createInitial(world.random);
      const organism = new Organism({
        id: world._nextOrganismId++,
        parentId: null,
        generation: 0,
        genome,
        x: world.random.range(-world.halfWidth, world.halfWidth),
        z: world.random.range(-world.halfDepth, world.halfDepth),
        heading: world.random.range(0, Math.PI * 2),
        energy: config.energy.capacityPerSize * genome.get('size') * config.energy.initialShare,
        capacityPerSize: config.energy.capacityPerSize,
      });
      world._addOrganism(organism);
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

  public spawnFood(): Food | null {
    if (this.food.length >= this.config.food.max) {
      return null;
    }

    const food: Food = {
      id: this._nextFoodId++,
      x: this.random.range(-this.halfWidth, this.halfWidth),
      z: this.random.range(-this.halfDepth, this.halfDepth),
      energy: this.config.food.energy,
      eaten: false,
    };
    this.food.push(food);
    return food;
  }

  /** Добавляет потомка; он начнет действовать со следующего шага */
  public addOffspring(params: OffspringParams): Organism {
    const organism = new Organism({
      id: this._nextOrganismId++,
      parentId: params.parent.id,
      generation: params.parent.generation + 1,
      genome: params.genome,
      x: this.clampX(params.x),
      z: this.clampZ(params.z),
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

  private _addOrganism(organism: Organism): void {
    this.organisms.push(organism);
    this._organismsById.set(organism.id, organism);
  }
}
