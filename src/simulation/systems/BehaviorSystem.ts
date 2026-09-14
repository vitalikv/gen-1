import { FOOD_RADIUS } from '@/shared/config';
import { REST_RECOVERY_MARGIN } from '@/shared/genes';
import type { MutablePoint } from '../Environment';
import {
  chooseRemembered, estimateFood, forgetStale, isRemembered, memoryCapacity, rememberFood, REMEMBERED_FOOD_MIN_SHARE,
} from '../FoodMemory';
import type { Organism } from '../Organism';
import type { Food, World } from '../World';
import { agingOnset, compatible, isReady } from './EvolutionSystem';
import { PredationSystem } from './PredationSystem';

export interface BehaviorIntent {
  distance: number;
  reflect: boolean;
  food: Food | null;
  /** Жертва, которую хищник попытается схватить после движения */
  prey: Organism | null;
}

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
    const idle: BehaviorIntent = { distance: 0, reflect: false, food: null, prey: null };
    life.mateId = null;
    forgetStale(world, organism);
    const ageFactor = Math.max(0.45, 1 - Math.max(0, organism.age / Math.max(1, agingOnset(world, organism)) - 1) * 0.4);
    const speed = genome.get('speed') * Math.sqrt(life.growth) * (0.35 + 0.65 * life.stamina)
      * (0.5 + 0.5 * life.health) * ageFactor;
    const hungerThreshold = genome.get('hungerThreshold');
    const restThreshold = genome.get('restThreshold');
    const ownHunger = organism.energyRatio < hungerThreshold && life.stomach < organism.capacity * 0.2;
    // Взрослый хищник охотится и сытым, пока рядом голодны его детёныши.
    const provisioning = !ownHunger && organism.isPredator && life.growth >= 1 && world.organismIndex.findNearest(
      organism.x, organism.z, world.config.predation.shareRadius, (young) => PredationSystem.isDependentYoung(organism, young)
        && young.energyRatio < young.genome.get('hungerThreshold') && young.life.stomach < young.capacity * 0.2) !== null;
    const hungry = ownHunger || provisioning;
    const exhausted = life.stamina < restThreshold
      || (organism.action === 'resting' && life.stamina < restThreshold + REST_RECOVERY_MARGIN);
    const ready = isReady(world, organism);
    // При нулевом приоритете голодный организм всегда выбирает пищу.
    const mateFirst = ready && (!hungry || organism.energyRatio >= hungerThreshold * (1 - genome.get('matePriority')));
    const visible = (point: MutablePoint): boolean => {
      const dx = point.x - organism.x;
      const dz = point.z - organism.z;
      const distance = Math.hypot(dx, dz);
      return distance <= genome.get('perception') && (distance <= organism.bodySize + FOOD_RADIUS
        || Math.abs(normalizeAngle(Math.atan2(dz, dx) - organism.heading)) <= world.config.perception.fieldOfView / 2)
        && world.environment.hasLineOfSight(organism, point);
    };
    const toward = (point: MutablePoint, reach: number, food: Food | null, prey: Organism | null = null): BehaviorIntent => {
      const distance = Math.hypot(point.x - organism.x, point.z - organism.z);
      if (distance > reach) organism.heading = Math.atan2(point.z - organism.z, point.x - organism.x);
      return { distance: Math.min(speed * dt, Math.max(0, distance - reach)), reflect: false, food, prey };
    };

    if (!organism.isPredator && this._updateThreat(world, organism, dt, visible) && organism.avoidTimer <= 0) {
      const awayX = organism.x - life.threat!.x;
      const awayZ = organism.z - life.threat!.z;
      if (awayX !== 0 || awayZ !== 0) organism.heading = Math.atan2(awayZ, awayX);
      organism.action = 'fleeing';
      life.targetFoodId = null;
      life.reason = 'Убегает от замеченного хищника';
      return { distance: speed * dt, reflect: true, food: null, prey: null };
    }
    if (!life.threat && (exhausted || (!hungry && !ready))) {
      organism.action = 'resting';
      life.reason = exhausted ? 'Восстанавливает выносливость' : life.stomach > 0
        ? 'Переваривает пищу и экономит энергию' : 'Сыт; восстанавливается';
      return idle;
    }
    if (organism.avoidTimer > 0) {
      organism.avoidTimer = Math.max(0, organism.avoidTimer - dt);
      organism.action = 'avoiding';
      life.reason = life.threat ? 'Убегает от хищника в обход препятствия' : 'Обходит препятствие';
      return { distance: speed * dt, reflect: true, food: null, prey: null };
    }
    if (!hungry && !organism.isPredator && memoryCapacity(organism) > 0) {
      // Сытый организм замечает богатое растение, чтобы вернуться к нему, когда проголодается.
      const noticed = world.foodIndex.findNearest(organism.x, organism.z, genome.get('perception'),
        (food) => food.energy >= food.maxEnergy * REMEMBERED_FOOD_MIN_SHARE && !isRemembered(organism, food) && visible(food));
      if (noticed) rememberFood(world, organism, noticed);
    }
    if (mateFirst) {
      const visibleMate = world.organismIndex.findNearest(organism.x, organism.z, genome.get('perception'),
        (other) => compatible(organism, other) && isReady(world, other) && visible(other));
      // Без видимого партнёра особь идёт на зов: иначе редкий вид не находит пар.
      const mate = visibleMate ?? world.organismIndex.findNearest(organism.x, organism.z,
        world.config.perception.mateCallRadius, (other) => compatible(organism, other) && isReady(world, other)
          && world.environment.hasClearPath(organism, other));
      if (mate) {
        life.mateId = mate.id;
        organism.action = 'seekingMate';
        life.reason = hungry ? 'Голоден, но партнёр важнее пищи'
          : visibleMate ? 'Идёт к готовому партнёру противоположного пола' : 'Идёт на брачный зов партнёра';
        return toward(mate, organism.bodySize + mate.bodySize, null);
      }
    }
    const parent = organism.isPredator && life.growth < 1 ? this._livingParent(world, organism) : null;
    if (hungry && parent) {
      // Детёныш не догонит жертву сам: держится рядом с родителем и ждёт долю добычи.
      const { shareRadius } = world.config.predation;
      organism.action = 'following';
      if (Math.hypot(parent.x - organism.x, parent.z - organism.z) > shareRadius / 2) {
        life.reason = 'Голоден; догоняет родителя';
        return toward(parent, shareRadius / 2, null);
      }
      life.reason = 'Голоден; ждёт добычу родителя';
      return idle;
    }
    if (hungry && organism.isPredator) {
      const motive = provisioning ? 'Детёныши голодны' : 'Голоден';
      // Жертва за водой видна, но недосягаема: погоня к ней упёрлась бы в берег.
      const reachable = (other: Organism) => !other.isPredator && other.alive && !world.environment.terrain.crossesWater(organism, other);
      const retained = life.targetPreyId === null ? null : world.getOrganism(life.targetPreyId);
      const prey = retained && reachable(retained) && visible(retained) ? retained
        : world.organismIndex.findNearest(organism.x, organism.z, genome.get('perception'),
          (other) => reachable(other) && visible(other));
      if (prey) {
        life.targetPreyId = prey.id;
        organism.action = 'hunting';
        life.reason = life.attackCooldown > 0 ? 'Преследует жертву после неудачной попытки' : `${motive}; преследует травоядное`;
        return toward(prey, organism.bodySize + prey.bodySize, null, prey);
      }
      life.targetPreyId = null;
      // Добыча редко оказывается в поле зрения случайно: хищник идёт по следу, не видя жертву.
      const scented = world.organismIndex.findNearest(organism.x, organism.z, world.config.predation.scentRadius,
        (other) => reachable(other) && world.environment.hasLineOfSight(organism, other));
      if (scented) {
        organism.action = 'hunting';
        life.reason = `${motive}; идёт по следу травоядного`;
        return toward(scented, organism.bodySize + scented.bodySize, null);
      }
    } else if (hungry) {
      let retained: Food | null = null;
      world.foodIndex.forEachInRadius(organism.x, organism.z, genome.get('perception'), (food) => {
        if (food.id === life.targetFoodId && !food.eaten && visible(food)) retained = food;
      });
      const target = retained ?? world.foodIndex.findNearest(organism.x, organism.z, genome.get('perception'),
        (food) => !food.eaten && visible(food));
      if (target) {
        life.targetFoodId = target.id;
        rememberFood(world, organism, target);
        organism.action = 'seeking';
        life.reason = 'Голоден; идёт к видимой пище';
        return toward(target, organism.bodySize + FOOD_RADIUS, target);
      }
      life.targetFoodId = null;
      let remembered = chooseRemembered(world, organism);
      while (remembered && Math.hypot(remembered.x - organism.x, remembered.z - organism.z) <= organism.bodySize + FOOD_RADIUS) {
        // На месте нет доступной пищи: растение съедено или ещё не отросло.
        remembered.energy = 0;
        remembered.seenAt = organism.age;
        remembered = chooseRemembered(world, organism);
      }
      if (remembered) {
        organism.action = 'remembering';
        life.reason = `Возвращается к запомненному растению: ожидает ~${Math.round(estimateFood(world, organism, remembered))} энергии`;
        return toward(remembered, organism.bodySize, null);
      }
    }
    organism.action = 'wandering';
    life.reason = !hungry ? 'Исследует мир в поисках партнёра'
      : organism.isPredator ? 'Ищет добычу' : 'Ищет новый источник пищи';
    const exploration = genome.get('exploration');
    const { turnRate, minWanderSpeedShare } = world.config.behavior;
    organism.heading = normalizeAngle(organism.heading + world.random.normal(0, turnRate * Math.sqrt(dt) * (1 - 0.8 * exploration)));
    return { distance: speed * Math.max(exploration, minWanderSpeedShare) * dt, reflect: true, food: null, prey: null };
  }

  /** Живая мать или, если её нет, живой отец */
  private _livingParent(world: World, organism: Organism): Organism | null {
    for (const id of [organism.parentId, organism.life.fatherId]) {
      const parent = id === null ? null : world.getOrganism(id);
      if (parent?.alive) return parent;
    }
    return null;
  }

  /**
   * Замечает ближайшего видимого хищника в радиусе perception * caution и обновляет место угрозы
   * @returns есть ли угроза, от которой травоядное ещё убегает
   */
  private _updateThreat(world: World, organism: Organism, dt: number, visible: (point: MutablePoint) => boolean): boolean {
    const { life, genome } = organism;
    if (life.threat) {
      life.threat.remaining -= dt;
      if (life.threat.remaining <= 0) life.threat = null;
    }
    const radius = genome.get('perception') * genome.get('caution');
    const predator = radius > 0 ? world.organismIndex.findNearest(organism.x, organism.z, radius,
      (other) => other.isPredator && other.alive && visible(other)) : null;
    if (predator) life.threat = { x: predator.x, z: predator.z, remaining: world.config.predation.fleeDuration };
    return life.threat !== null;
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
