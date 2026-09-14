import { afterEach, describe, expect, it } from 'vitest';
import { applyObstaclePreset, applyZonePreset, type SimulationConfig } from '@/shared/config';
import { containsPoint } from '@/shared/environment';
import { MODEL_VERSION } from '@/shared/savedState';
import { SimulationEngine } from './SimulationEngine';
import { createTestConfig } from './testConfig';

function experimentConfig(seed = 5): SimulationConfig {
  const config = createTestConfig({ seed, dt: 1 / 30 });
  applyObstaclePreset(config, 'blocks');
  applyZonePreset(config, 'oases');
  config.season = { enabled: true, period: 20, amplitude: 0.8 };
  return config;
}

function createEngine(context: string, config: SimulationConfig): SimulationEngine {
  const engine = SimulationEngine.inst(context);
  engine.init(config);
  return engine;
}

function fingerprint(engine: SimulationEngine) {
  const snapshot = engine.getSnapshot();
  return {
    step: snapshot.step,
    randomState: engine.random.state,
    organismIds: Array.from(snapshot.organismIds),
    organisms: Array.from(snapshot.organisms),
    food: Array.from(snapshot.food),
    stats: engine.statsHistory.map((sample) => ({ ...sample })),
    world: engine.world.toSaved(),
  };
}

describe('Эксперименты', () => {
  afterEach(() => {
    SimulationEngine.destroyAllInstances();
  });

  it('организмы и пища не оказываются внутри препятствий', () => {
    const engine = createEngine('obstacles', experimentConfig());
    const { world } = engine;

    for (let step = 0; step < 900; step++) {
      engine.advance(1);
      for (const organism of world.organisms) {
        expect(world.environment.isBlocked(organism.x, organism.z, organism.bodySize - 1e-6)).toBe(false);
      }
    }
    for (const food of world.food) {
      expect(world.environment.isBlocked(food.x, food.z, 0)).toBe(false);
    }
    expect(world.organisms.length).toBeGreaterThan(0);
  });

  it('пища появляется в плодородных зонах гуще', () => {
    const config = createTestConfig({ seed: 3, food: { initial: 2000, max: 5000, spawnPerSecond: 0, energy: 1 } });
    config.population.initial = 0;
    applyZonePreset(config, 'oases');
    const engine = createEngine('zones', config);

    const zoneArea = config.environment.zones.reduce(
      (sum, zone) => sum + (zone.shape.kind === 'circle' ? Math.PI * zone.shape.radius ** 2 : 0),
      0,
    );
    const zoneShare = zoneArea / (config.world.width * config.world.depth);
    const inZones = engine.world.food.filter((food) =>
      config.environment.zones.some((zone) => containsPoint(zone.shape, food.x, food.z)),
    ).length;
    const expectedShare = (zoneShare * 4) / (zoneShare * 4 + (1 - zoneShare) * 0.25);

    expect(inZones / engine.world.food.length).toBeCloseTo(expectedShare, 1);
  });

  it('сезон меняет интенсивность появления пищи', () => {
    const config = createTestConfig({ seed: 4, food: { initial: 0, max: 100_000, spawnPerSecond: 100, energy: 1 } });
    config.population.initial = 0;
    config.season = { enabled: true, period: 8, amplitude: 0.9 };
    const engine = createEngine('season', config);

    engine.advance(8); // 0–2 с: пик сезона
    const summer = engine.world.food.length;
    engine.advance(8); // 2–4 с
    engine.advance(8); // 4–6 с: спад
    const winterStart = engine.world.food.length;
    engine.advance(8);
    const winter = engine.world.food.length - winterStart;

    expect(summer).toBeGreaterThan(winter * 3);
    expect(engine.statsHistory.map((sample) => sample.season).some((value) => value < 0.5)).toBe(true);
  });

  it('updateConfig применяет параметры запуска сразу, а стартовые — после сброса', () => {
    const base = createTestConfig({ seed: 1 });
    const engine = createEngine('update', base);

    const next = structuredClone(base);
    next.seed = 2;
    next.population.initial = 10;
    next.food.energy = 99;
    next.mutation.rate = 0.9;
    applyObstaclePreset(next, 'walls');
    applyZonePreset(next, 'poles');
    engine.updateConfig(next, false);

    const { current, next: pending } = engine.getConfigState();
    expect(current.food.energy).toBe(99);
    expect(current.mutation.rate).toBe(0.9);
    expect(current.environment.zonePreset).toBe('poles');
    expect(engine.world.environment.maxFertility).toBe(3);
    expect(current.seed).toBe(1);
    expect(current.environment.obstacles).toHaveLength(0);
    expect(pending.seed).toBe(2);

    engine.reset();
    expect(engine.world.config.seed).toBe(2);
    expect(engine.world.organisms).toHaveLength(10);
    expect(engine.world.environment.obstacles.length).toBeGreaterThan(0);
  });

  it('отклоняет некорректную конфигурацию', () => {
    const engine = createEngine('invalid', createTestConfig());
    const broken = createTestConfig();
    broken.mutation.rate = 2;

    expect(() => engine.updateConfig(broken, false)).toThrow(/mutation\.rate/);
    expect(engine.getConfigState().next.mutation.rate).not.toBe(2);
  });

  it('продолжение из сохранения совпадает с непрерывным запуском', () => {
    const config = experimentConfig(8);
    const continuous = createEngine('continuous', config);
    continuous.advance(600);

    const original = createEngine('original', config);
    original.advance(300);
    const saved = JSON.parse(JSON.stringify(original.saveState()));

    const restored = SimulationEngine.inst('restored');
    restored.init(createTestConfig({ seed: 999 }));
    restored.loadState(saved);
    expect(fingerprint(restored)).toEqual(fingerprint(original));

    restored.advance(300);
    expect(fingerprint(restored)).toEqual(fingerprint(continuous));
  });

  it('сохранение включает конфигурацию следующего запуска', () => {
    const engine = createEngine('next', createTestConfig({ seed: 1 }));
    const next = createTestConfig({ seed: 77 });
    engine.updateConfig(next, false);

    const restored = SimulationEngine.inst('next-restored');
    restored.init(createTestConfig());
    restored.loadState(engine.saveState());
    restored.reset();

    expect(restored.world.config.seed).toBe(77);
  });

  it('не загружает чужой формат и другую версию модели', () => {
    const engine = createEngine('versions', createTestConfig());
    const state = engine.saveState();

    expect(() => engine.loadState({ ...state, modelVersion: MODEL_VERSION + 1 })).toThrow(/версией модели/);
    expect(() => engine.loadState({ ...state, format: 'other' } as never)).toThrow(/не является сохранением/);
  });

  it('воспроизводит эксперимент со средой при одинаковом seed', () => {
    const a = createEngine('a', experimentConfig(11));
    const b = createEngine('b', experimentConfig(11));
    a.advance(450);
    b.advance(450);

    expect(fingerprint(a)).toEqual(fingerprint(b));
  });
});
