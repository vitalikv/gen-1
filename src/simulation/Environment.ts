import type { SimulationConfig } from '@/shared/config';
import { Terrain } from '@/shared/Terrain';
import { containsPoint, type ResourceZone, type Shape } from '@/shared/environment';

export interface MutablePoint {
  x: number;
  z: number;
}

/** Повторные проходы выталкивания: точка может оказаться внутри соседнего препятствия */
const RESOLVE_PASSES = 3;

/**
 * Среда мира: препятствия, плодородие зон и сезонность
 */
export class Environment {
  public readonly terrain: Terrain;
  public readonly obstacles: readonly Shape[];
  public readonly zones: readonly ResourceZone[];
  public readonly baseFertility: number;
  public readonly maxFertility: number;
  private readonly _season: SimulationConfig['season'];

  public constructor(config: SimulationConfig) {
    this.terrain = new Terrain(config);
    this.obstacles = config.environment.obstacles;
    this.zones = config.environment.zones;
    this.baseFertility = config.environment.baseFertility;
    this.maxFertility = Math.max(this.baseFertility, ...this.zones.map((zone) => zone.fertility));
    this._season = config.season;
  }

  /** Пересекает ли круг радиуса radius какое-либо препятствие */
  public isBlocked(x: number, z: number, radius: number): boolean {
    if (this.terrain.isBlocked(x, z, radius)) return true;
    for (const obstacle of this.obstacles) {
      if (obstacle.kind === 'circle') {
        if ((x - obstacle.x) ** 2 + (z - obstacle.z) ** 2 < (obstacle.radius + radius) ** 2) {
          return true;
        }
      } else if (
        Math.abs(x - obstacle.x) < obstacle.width / 2 + radius &&
        Math.abs(z - obstacle.z) < obstacle.depth / 2 + radius
      ) {
        return true;
      }
    }
    return false;
  }

  /** Точное пересечение отрезка с кругом или прямоугольником, без дискретного семплирования. */
  /** Можно ли дойти по прямой: нет препятствий и воды между точками */
  public hasClearPath(a: MutablePoint, b: MutablePoint): boolean {
    return this.hasLineOfSight(a, b) && !this.terrain.crossesWater(a, b);
  }

  public hasLineOfSight(a: MutablePoint, b: MutablePoint): boolean {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    for (const obstacle of this.obstacles) {
      if (obstacle.kind === 'circle') {
        const lengthSq = dx * dx + dz * dz;
        const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1,
          ((obstacle.x - a.x) * dx + (obstacle.z - a.z) * dz) / lengthSq));
        if ((a.x + dx * t - obstacle.x) ** 2 + (a.z + dz * t - obstacle.z) ** 2 <= obstacle.radius ** 2) return false;
      } else {
        let low = 0;
        let high = 1;
        for (const [origin, direction, center, half] of [
          [a.x, dx, obstacle.x, obstacle.width / 2], [a.z, dz, obstacle.z, obstacle.depth / 2],
        ] as [number, number, number, number][]) {
          if (Math.abs(direction) < 1e-12) {
            if (Math.abs(origin - center) > half) { low = 2; break; }
          } else {
            const first = (center - half - origin) / direction;
            const second = (center + half - origin) / direction;
            low = Math.max(low, Math.min(first, second));
            high = Math.min(high, Math.max(first, second));
          }
        }
        if (low <= high) return false;
      }
    }
    return true;
  }

  /**
   * Выталкивает круг из препятствий на ближайшую границу
   * @param normal получает нормаль последнего столкновения
   * @returns было ли столкновение
   */
  public resolve(point: MutablePoint, radius: number, normal: MutablePoint): boolean {
    let collided = false;

    for (let pass = 0; pass < RESOLVE_PASSES; pass++) {
      let changed = false;
      for (const obstacle of this.obstacles) {
        if (this._pushOut(obstacle, point, radius, normal)) {
          changed = true;
          collided = true;
        }
      }
      if (!changed) {
        break;
      }
    }

    if (this.terrain.enabled && this.isBlocked(point.x, point.z, radius)) {
      const land = this.terrain.nearestLand(point.x, point.z, radius,
        (x, z) => !this.isBlocked(x, z, radius));
      const distance = Math.hypot(land.x - point.x, land.z - point.z);
      normal.x = (land.x - point.x) / distance;
      normal.z = (land.z - point.z) / distance;
      point.x = land.x;
      point.z = land.z;
      collided = true;
    }
    return collided;
  }

  /** Плодородие в точке: максимум по зонам, содержащим точку, иначе базовое */
  public fertilityAt(x: number, z: number): number {
    let fertility = -1;
    for (const zone of this.zones) {
      if (zone.fertility > fertility && containsPoint(zone.shape, x, z)) {
        fertility = zone.fertility;
      }
    }
    return (fertility < 0 ? this.baseFertility : fertility) * this.terrain.fertilityAt(x, z);
  }

  /** Сезонный множитель плодородия: 1 + amplitude * sin(2π t / period), не меньше 0 */
  public seasonMultiplier(time: number): number {
    if (!this._season.enabled) {
      return 1;
    }
    return Math.max(0, 1 + this._season.amplitude * Math.sin((2 * Math.PI * time) / this._season.period));
  }

  private _pushOut(obstacle: Shape, point: MutablePoint, radius: number, normal: MutablePoint): boolean {
    if (obstacle.kind === 'circle') {
      const dx = point.x - obstacle.x;
      const dz = point.z - obstacle.z;
      const minDistance = obstacle.radius + radius;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq >= minDistance * minDistance) {
        return false;
      }
      const distance = Math.sqrt(distanceSq);
      normal.x = distance > 0 ? dx / distance : 1;
      normal.z = distance > 0 ? dz / distance : 0;
      point.x = obstacle.x + normal.x * minDistance;
      point.z = obstacle.z + normal.z * minDistance;
      return true;
    }

    const halfWidth = obstacle.width / 2 + radius;
    const halfDepth = obstacle.depth / 2 + radius;
    const dx = point.x - obstacle.x;
    const dz = point.z - obstacle.z;
    const overlapX = halfWidth - Math.abs(dx);
    const overlapZ = halfDepth - Math.abs(dz);
    if (overlapX <= 0 || overlapZ <= 0) {
      return false;
    }

    // Выталкивание по оси наименьшего проникновения
    if (overlapX < overlapZ) {
      normal.x = dx >= 0 ? 1 : -1;
      normal.z = 0;
      point.x = obstacle.x + normal.x * halfWidth;
    } else {
      normal.x = 0;
      normal.z = dz >= 0 ? 1 : -1;
      point.z = obstacle.z + normal.z * halfDepth;
    }
    return true;
  }
}
