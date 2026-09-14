import { FOOD_RADIUS } from '@/shared/config';
import type { MutablePoint } from '../Environment';
import type { Organism } from '../Organism';
import type { Food, World } from '../World';

const TWO_PI = Math.PI * 2;
/** Сколько секунд организм обходит препятствие, прежде чем снова идти к пище */
export const AVOID_DURATION = 1;
/** Доля желаемого перемещения, ниже которой организм считается застрявшим у препятствия */
const STUCK_PROGRESS_SHARE = 0.25;

function isAvailable(food: Food): boolean {
  return !food.eaten;
}

function normalizeAngle(angle: number): number {
  return angle - TWO_PI * Math.floor((angle + Math.PI) / TWO_PI);
}

/**
 * Выбор действия и движение: поиск пищи в радиусе восприятия, исследование или обход препятствия
 */
export class BehaviorSystem {
  private readonly _normal: MutablePoint = { x: 0, z: 0 };
  private readonly _point: MutablePoint = { x: 0, z: 0 };
  /** Было ли столкновение с препятствием при последнем движении; нормаль — в _normal */
  private _collided = false;

  /**
   * Перемещает организм за шаг
   * @returns пища в пределах досягаемости после движения или null
   */
  public update(world: World, organism: Organism, dt: number): Food | null {
    const { genome } = organism;
    const speed = genome.get('speed');

    if (organism.avoidTimer > 0) {
      organism.avoidTimer = Math.max(0, organism.avoidTimer - dt);
      organism.action = 'avoiding';
      this._move(world, organism, speed * dt, dt, true);
      return null;
    }

    const reach = genome.get('size') + FOOD_RADIUS;
    const target = world.foodIndex.findNearest(organism.x, organism.z, genome.get('perception'), isAvailable);

    if (target) {
      organism.action = 'seeking';
      const dx = target.x - organism.x;
      const dz = target.z - organism.z;
      const distance = Math.hypot(dx, dz);

      if (distance > reach) {
        organism.heading = Math.atan2(dz, dx);
        const wanted = Math.min(speed * dt, distance - reach);
        const moved = this._move(world, organism, wanted, dt, false);

        if (this._collided && moved < wanted * STUCK_PROGRESS_SHARE) {
          this._startAvoiding(organism);
        }
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

    this._move(world, organism, speed * Math.max(exploration, minWanderSpeedShare) * dt, dt, true);
    return null;
  }

  /** Направляет организм вдоль препятствия в сторону, ближайшую к прежнему курсу */
  private _startAvoiding(organism: Organism): void {
    const { x: nx, z: nz } = this._normal;
    const headingX = Math.cos(organism.heading);
    const headingZ = Math.sin(organism.heading);
    const dot = -nz * headingX + nx * headingZ;
    const side = dot > 0 || (dot === 0 && organism.id % 2 === 0) ? 1 : -1;

    organism.heading = Math.atan2(nx * side, -nz * side);
    organism.avoidTimer = AVOID_DURATION;
    organism.action = 'avoiding';
  }

  /**
   * Движение по направлению с отражением от границ и выталкиванием из препятствий
   * @returns пройденное расстояние
   */
  private _move(world: World, organism: Organism, distance: number, dt: number, reflect: boolean): number {
    const startX = organism.x;
    const startZ = organism.z;
    const nextX = startX + Math.cos(organism.heading) * distance;
    const nextZ = startZ + Math.sin(organism.heading) * distance;

    const point = this._point;
    point.x = world.clampX(nextX);
    point.z = world.clampZ(nextZ);

    if (nextX !== point.x) {
      organism.heading = normalizeAngle(Math.PI - organism.heading);
    }
    if (nextZ !== point.z) {
      organism.heading = normalizeAngle(-organism.heading);
    }

    const collided = world.environment.resolve(point, organism.genome.get('size'), this._normal);
    this._collided = collided;
    if (collided) {
      point.x = world.clampX(point.x);
      point.z = world.clampZ(point.z);

      if (reflect) {
        const directionX = Math.cos(organism.heading);
        const directionZ = Math.sin(organism.heading);
        const dot = directionX * this._normal.x + directionZ * this._normal.z;
        if (dot < 0) {
          organism.heading = Math.atan2(directionZ - 2 * dot * this._normal.z, directionX - 2 * dot * this._normal.x);
        }
      }
    }

    organism.x = point.x;
    organism.z = point.z;
    const moved = Math.hypot(point.x - startX, point.z - startZ);
    organism.currentSpeed = moved / dt;
    return moved;
  }
}
