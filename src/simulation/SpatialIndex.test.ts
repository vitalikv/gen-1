import { describe, expect, it } from 'vitest';
import { SeededRandom } from '@/core/SeededRandom';
import { SpatialIndex, type SpatialItem } from './SpatialIndex';

interface Point extends SpatialItem {
  enabled: boolean;
}

function bruteForceNearest(points: Point[], x: number, z: number, radius: number): Point | null {
  let best: Point | null = null;
  let bestDistanceSq = Infinity;
  for (const point of points) {
    const distanceSq = (point.x - x) ** 2 + (point.z - z) ** 2;
    if (!point.enabled || distanceSq > radius * radius) {
      continue;
    }
    if (distanceSq < bestDistanceSq || (distanceSq === bestDistanceSq && best && point.id < best.id)) {
      best = point;
      bestDistanceSq = distanceSq;
    }
  }
  return best;
}

describe('SpatialIndex', () => {
  it('находит тот же ближайший объект, что и полный перебор', () => {
    const random = new SeededRandom(5);
    const index = new SpatialIndex<Point>(100, 60, 7);
    const points: Point[] = Array.from({ length: 500 }, (_, i) => ({
      id: i + 1,
      x: random.range(-50, 50),
      z: random.range(-30, 30),
      enabled: random.next() > 0.3,
    }));
    points.forEach((point) => index.insert(point));

    for (let i = 0; i < 300; i++) {
      const x = random.range(-60, 60);
      const z = random.range(-40, 40);
      const radius = random.range(0, 25);

      expect(index.findNearest(x, z, radius, (point) => point.enabled)).toBe(bruteForceNearest(points, x, z, radius));
    }
  });

  it('при равном расстоянии выбирает меньший ID', () => {
    const index = new SpatialIndex<Point>(100, 100, 10);
    index.insert({ id: 2, x: 5, z: 0, enabled: true });
    index.insert({ id: 1, x: -5, z: 0, enabled: true });

    expect(index.findNearest(0, 0, 10, () => true)?.id).toBe(1);
  });

  it('учитывает объект на границе радиуса', () => {
    const index = new SpatialIndex<Point>(100, 100, 10);
    index.insert({ id: 1, x: 10, z: 0, enabled: true });

    expect(index.findNearest(0, 0, 10, () => true)?.id).toBe(1);
  });

  it('очищается', () => {
    const index = new SpatialIndex<Point>(100, 100, 10);
    index.insert({ id: 1, x: 0, z: 0, enabled: true });
    index.clear();

    expect(index.findNearest(0, 0, 50, () => true)).toBeNull();
  });
});
