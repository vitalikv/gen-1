import type { OrganismAction } from '@/shared/snapshot';
import type { Genome } from './Genome';
import type { Diet, LifeState, Sex } from '@/shared/life';

export interface OrganismParams {
  id: number;
  parentId: number | null;
  generation: number;
  genome: Genome;
  x: number;
  z: number;
  heading: number;
  energy: number;
  capacityPerSize: number;
  sex?: Sex;
  diet?: Diet;
  fatherId?: number | null;
}

/**
 * Состояние отдельного организма
 */
export class Organism {
  public readonly id: number;
  public readonly parentId: number | null;
  public readonly generation: number;
  public readonly genome: Genome;
  /** Вместимость энергии, определяется размером тела при рождении */
  public readonly capacity: number;

  public x: number;
  public z: number;
  /** Направление движения в плоскости XZ, радианы */
  public heading: number;
  public energy: number;
  public age = 0;
  /** Фактическая скорость за последний шаг */
  public currentSpeed = 0;
  public action: OrganismAction = 'wandering';
  /** Оставшееся время обхода препятствия, в течение которого пища не преследуется */
  public avoidTimer = 0;
  public alive = true;
  public life: LifeState;

  public constructor(params: OrganismParams) {
    this.id = params.id;
    this.parentId = params.parentId;
    this.generation = params.generation;
    this.genome = params.genome;
    this.capacity = params.capacityPerSize * params.genome.get('size');
    this.x = params.x;
    this.z = params.z;
    this.heading = params.heading;
    this.energy = Math.min(params.energy, this.capacity);
    this.life = {
      sex: params.sex ?? 'female', diet: params.diet ?? 'herbivore', fatherId: params.fatherId ?? null,
      growth: 1, health: 1, stamina: 1, stomach: 0, recovery: 0, pregnancy: null,
      targetFoodId: null, targetPreyId: null, attackCooldown: 0, threat: null, mateId: null, memory: [], reason: 'Исследует окружение', deathCause: null,
    };
  }

  public get energyRatio(): number {
    return this.energy / this.capacity;
  }

  public get bodySize(): number { return this.genome.get('size') * Math.sqrt(this.life.growth); }
  public get sex(): Sex { return this.life.sex; }
  public get isPredator(): boolean { return this.life.diet === 'predator'; }
}
