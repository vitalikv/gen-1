import { describe, expect, it } from 'vitest';
import { applyObstaclePreset, applyZonePreset } from '@/shared/config';
import {
  containsPoint,
  OBSTACLE_PRESETS,
  ZONE_PRESETS,
  type ObstaclePresetId,
  type ZonePresetId,
} from '@/shared/environment';
import { Environment } from './Environment';
import { createTestConfig } from './testConfig';

function environmentWith(setup: Parameters<typeof createTestConfig>[0] = {}) {
  const config = createTestConfig(setup);
  return { config, environment: () => new Environment(config) };
}

describe('Environment', () => {
  it('выталкивает круг из круглого препятствия на границу', () => {
    const { config, environment } = environmentWith();
    config.environment.obstacles = [{ kind: 'circle', x: 0, z: 0, radius: 10 }];
    const point = { x: 3, z: 4 };
    const normal = { x: 0, z: 0 };

    expect(environment().resolve(point, 1, normal)).toBe(true);
    expect(Math.hypot(point.x, point.z)).toBeCloseTo(11, 10);
    expect(normal.x).toBeCloseTo(0.6, 10);
    expect(normal.z).toBeCloseTo(0.8, 10);
  });

  it('выталкивает из прямоугольника по оси наименьшего проникновения', () => {
    const { config, environment } = environmentWith();
    config.environment.obstacles = [{ kind: 'rect', x: 0, z: 0, width: 4, depth: 40 }];
    const point = { x: 1.5, z: 5 };
    const normal = { x: 0, z: 0 };

    expect(environment().resolve(point, 0.5, normal)).toBe(true);
    expect(point).toEqual({ x: 2.5, z: 5 });
    expect(normal).toEqual({ x: 1, z: 0 });
    expect(environment().isBlocked(point.x, point.z, 0.5)).toBe(false);
  });

  it('не трогает точку вне препятствий', () => {
    const { config, environment } = environmentWith();
    config.environment.obstacles = [{ kind: 'circle', x: 0, z: 0, radius: 10 }];
    const point = { x: 20, z: 0 };

    expect(environment().resolve(point, 1, { x: 0, z: 0 })).toBe(false);
    expect(point).toEqual({ x: 20, z: 0 });
  });

  it('берет максимальное плодородие зон в точке и базовое вне зон', () => {
    const { config, environment } = environmentWith();
    config.environment.baseFertility = 0.5;
    config.environment.zones = [
      { shape: { kind: 'circle', x: 0, z: 0, radius: 10 }, fertility: 2 },
      { shape: { kind: 'rect', x: 5, z: 0, width: 10, depth: 10 }, fertility: 3 },
    ];

    expect(environment().fertilityAt(-5, 0)).toBe(2);
    expect(environment().fertilityAt(5, 0)).toBe(3);
    expect(environment().fertilityAt(50, 50)).toBe(0.5);
    expect(environment().maxFertility).toBe(3);
  });

  it('вычисляет сезонный множитель и не опускает его ниже нуля', () => {
    const { config, environment } = environmentWith();
    expect(environment().seasonMultiplier(30)).toBe(1);

    config.season = { enabled: true, period: 120, amplitude: 1.5 };
    expect(environment().seasonMultiplier(30)).toBeCloseTo(2.5, 10);
    expect(environment().seasonMultiplier(90)).toBe(0);
  });

  it('шаблоны строят фигуры внутри мира', () => {
    const config = createTestConfig();
    const half = config.world.width / 2;

    for (const id of Object.keys(OBSTACLE_PRESETS) as ObstaclePresetId[]) {
      applyObstaclePreset(config, id);
      for (const shape of config.environment.obstacles) {
        expect(Math.abs(shape.x)).toBeLessThanOrEqual(half);
        expect(Math.abs(shape.z)).toBeLessThanOrEqual(half);
      }
    }

    for (const id of Object.keys(ZONE_PRESETS) as ZonePresetId[]) {
      applyZonePreset(config, id);
      expect(config.environment.baseFertility).toBe(ZONE_PRESETS[id].baseFertility);
    }
  });

  it('проверяет принадлежность точки фигуре', () => {
    expect(containsPoint({ kind: 'circle', x: 0, z: 0, radius: 1 }, 1, 0)).toBe(true);
    expect(containsPoint({ kind: 'rect', x: 0, z: 0, width: 2, depth: 2 }, 1.01, 0)).toBe(false);
  });
});
