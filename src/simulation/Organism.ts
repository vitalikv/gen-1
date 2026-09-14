import type { OrganismAction } from '@/shared/snapshot';
import type { Genome } from './Genome';

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
  public alive = true;

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
  }

  public get energyRatio(): number {
    return this.energy / this.capacity;
  }
}
