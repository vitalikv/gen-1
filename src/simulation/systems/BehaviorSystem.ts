import { FOOD_RADIUS } from '@/shared/config';
import type { MutablePoint } from '../Environment';
import type { Organism } from '../Organism';
import type { Food, World } from '../World';
import { compatible, isReady } from './EvolutionSystem';

export interface BehaviorIntent { distance: number; reflect: boolean; food: Food | null; }

const TWO_PI = Math.PI * 2;
/** Сколько секунд организм обходит препятствие, прежде чем снова идти к пище */
export const AVOID_DURATION = 1;
/** Доля желаемого перемещения, ниже которой организм считается застрявшим у препятствия */
const STUCK_PROGRESS_SHARE = 0.25;

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
    return this.execute(world, organism, this.plan(world, organism, dt), dt);
  }

  /** Все организмы планируют действия до перемещения и расходования общих ресурсов. */
  public plan(world: World, organism: Organism, dt: number): BehaviorIntent {
    const { life, genome } = organism;
    const idle: BehaviorIntent = { distance: 0, reflect: false, food: null };
    life.mateId = null;
    if (life.memory) {
      life.memory.remaining -= dt;
      if (life.memory.remaining <= 0) life.memory = null;
    }
    const ageFactor = Math.max(0.45, 1 - Math.max(0, organism.age / Math.max(1, world.config.lifecycle.maxAge) - 1) * 0.4);
    const speed = genome.get('speed') * Math.sqrt(life.growth) * (0.35 + 0.65 * life.stamina)
      * (0.5 + 0.5 * life.health) * ageFactor;
    const hungry = organism.energyRatio < 0.65 && life.stomach < organism.capacity * 0.2;
    const exhausted = life.stamina < 0.15 || (organism.action === 'resting' && life.stamina < 0.7);
    if (exhausted || (!hungry && !isReady(world, organism))) {
      organism.action = 'resting';
      life.reason = exhausted ? 'Восстанавливает выносливость' : life.stomach > 0
        ? 'Переваривает пищу и экономит энергию' : 'Сыт; восстанавливается';
      return idle;
    }
    if (organism.avoidTimer > 0) {
      organism.avoidTimer = Math.max(0, organism.avoidTimer - dt);
      organism.action = 'avoiding';
      life.reason = 'Обходит препятствие';
      return { distance: speed * dt, reflect: true, food: null };
    }
    const visible = (point: MutablePoint): boolean => {
      const dx = point.x - organism.x;
      const dz = point.z - organism.z;
      const distance = Math.hypot(dx, dz);
      return distance <= genome.get('perception') && (distance <= organism.bodySize + FOOD_RADIUS
        || Math.abs(normalizeAngle(Math.atan2(dz, dx) - organism.heading)) <= world.config.perception.fieldOfView / 2)
        && world.environment.hasLineOfSight(organism, point);
    };
    const toward = (point: MutablePoint, reach: number, food: Food | null): BehaviorIntent => {
      const distance = Math.hypot(point.x - organism.x, point.z - organism.z);
      if (distance > reach) organism.heading = Math.atan2(point.z - organism.z, point.x - organism.x);
      return { distance: Math.min(speed * dt, Math.max(0, distance - reach)), reflect: false, food };
    };
    if (isReady(world, organism) && !hungry) {
      const mate = world.organismIndex.findNearest(organism.x, organism.z, genome.get('perception'),
        (other) => compatible(organism, other) && isReady(world, other) && visible(other));
      if (mate) {
        life.mateId = mate.id;
        organism.action = 'seekingMate';
        life.reason = 'Идёт к готовому партнёру противоположного пола';
        return toward(mate, organism.bodySize + mate.bodySize, null);
      }
    }
    if (hungry) {
      let retained: Food | null = null;
      world.foodIndex.forEachInRadius(organism.x, organism.z, genome.get('perception'), (food) => {
        if (food.id === life.targetFoodId && !food.eaten && visible(food)) retained = food;
      });
      const target = retained ?? world.foodIndex.findNearest(organism.x, organism.z, genome.get('perception'),
        (food) => !food.eaten && visible(food));
      if (target) {
        life.targetFoodId = target.id;
        life.memory = { x: target.x, z: target.z, remaining: world.config.perception.memoryDuration };
        organism.action = 'seeking';
        life.reason = 'Голоден; идёт к видимой пище';
        return toward(target, organism.bodySize + FOOD_RADIUS, target);
      }
      life.targetFoodId = null;
      if (life.memory) {
        if (Math.hypot(life.memory.x - organism.x, life.memory.z - organism.z) > organism.bodySize + FOOD_RADIUS) {
          organism.action = 'remembering';
          life.reason = 'Проверяет запомненный кормовой участок';
          return toward(life.memory, organism.bodySize, null);
        }
        life.memory = null;
      }
    }
    organism.action = 'wandering';
    life.reason = hungry ? 'Ищет новый источник пищи' : 'Исследует мир в поисках партнёра';
    const exploration = genome.get('exploration');
    const { turnRate, minWanderSpeedShare } = world.config.behavior;
    organism.heading = normalizeAngle(organism.heading + world.random.normal(0, turnRate * Math.sqrt(dt) * (1 - 0.8 * exploration)));
    return { distance: speed * Math.max(exploration, minWanderSpeedShare) * dt, reflect: true, food: null };
  }

  public execute(world: World, organism: Organism, intent: BehaviorIntent, dt: number): Food | null {
    if (intent.distance > 0) {
      const moved = this._move(world, organism, intent.distance, dt, intent.reflect);
      if (this._collided && moved < intent.distance * STUCK_PROGRESS_SHARE) this._startAvoiding(organism);
    } else organism.currentSpeed = 0;
    const food = intent.food;
    return food && Math.hypot(food.x - organism.x, food.z - organism.z) <= organism.bodySize + FOOD_RADIUS + 1e-9
      && world.environment.hasLineOfSight(organism, food) ? food : null;
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
    organism.life.reason = 'Путь заблокирован; обходит препятствие';
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

    const shoreCollision = world.environment.terrain.stopAtShore(organism, point, organism.bodySize, this._normal);
    const collided = world.environment.resolve(point, organism.bodySize, this._normal) || shoreCollision;
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
