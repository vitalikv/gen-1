import { FOOD_RADIUS } from '@/shared/config';
import type { Organism } from '../Organism';
import type { Food, World } from '../World';

const TWO_PI = Math.PI * 2;

function isAvailable(food: Food): boolean {
  return !food.eaten;
}

function normalizeAngle(angle: number): number {
  return angle - TWO_PI * Math.floor((angle + Math.PI) / TWO_PI);
}

/**
 * Выбор действия и движение: поиск пищи в радиусе восприятия или исследование
 */
export class BehaviorSystem {
  /**
   * Перемещает организм за шаг
   * @returns пища в пределах досягаемости после движения или null
   */
  public update(world: World, organism: Organism, dt: number): Food | null {
    const { genome } = organism;
    const reach = genome.get('size') + FOOD_RADIUS;
    const target = world.foodIndex.findNearest(organism.x, organism.z, genome.get('perception'), isAvailable);

    if (target) {
      organism.action = 'seeking';
      const dx = target.x - organism.x;
      const dz = target.z - organism.z;
      const distance = Math.hypot(dx, dz);

      if (distance > reach) {
        organism.heading = Math.atan2(dz, dx);
        this._move(world, organism, Math.min(genome.get('speed') * dt, distance - reach), dt);
      } else {
        organism.currentSpeed = 0;
      }

      return Math.hypot(target.x - organism.x, target.z - organism.z) <= reach + 1e-9 ? target : null;
    }

    organism.action = 'wandering';
    const exploration = genome.get('exploration');
    const { turnRate, minWanderSpeedShare } = world.config.behavior;
    const turnSigma = turnRate * Math.sqrt(dt) * (1 - 0.8 * exploration);
    organism.heading = normalizeAngle(organism.heading + world.random.normal(0, turnSigma));

    const wanderSpeed = genome.get('speed') * Math.max(exploration, minWanderSpeedShare);
    this._move(world, organism, wanderSpeed * dt, dt);
    return null;
  }

  /** Движение по направлению с отражением от границ мира */
  private _move(world: World, organism: Organism, distance: number, dt: number): void {
    const nextX = organism.x + Math.cos(organism.heading) * distance;
    const nextZ = organism.z + Math.sin(organism.heading) * distance;

    organism.x = world.clampX(nextX);
    organism.z = world.clampZ(nextZ);

    if (nextX !== organism.x) {
      organism.heading = normalizeAngle(Math.PI - organism.heading);
    }
    if (nextZ !== organism.z) {
      organism.heading = normalizeAngle(-organism.heading);
    }

    organism.currentSpeed = distance / dt;
  }
}
