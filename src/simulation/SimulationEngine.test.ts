import { afterEach, describe, expect, it } from 'vitest';
import { GENE_DEFINITIONS, GENE_NAMES } from '@/shared/genes';
import { ORGANISM_STRIDE, organismGeneField } from '@/shared/snapshot';
import { SimulationEngine } from './SimulationEngine';
import { createTestConfig } from './testConfig';

const CONFIG = createTestConfig({ seed: 123 });

function createEngine(context: string, config = CONFIG): SimulationEngine {
  const engine = SimulationEngine.inst(context);
  engine.init(config);
  return engine;
}

/** Полное состояние мира для сравнения запусков */
function fingerprint(engine: SimulationEngine) {
  const snapshot = engine.getSnapshot();
  return {
    step: snapshot.step,
    randomState: engine.random.state,
    organismIds: Array.from(snapshot.organismIds),
    organisms: Array.from(snapshot.organisms),
    food: Array.from(snapshot.food),
    stats: engine.statsHistory.map((sample) => ({ ...sample })),
  };
}

describe('SimulationEngine', () => {
  afterEach(() => {
    SimulationEngine.destroyAllInstances();
  });

  it('после init стоит на паузе на нулевом шаге со стартовой популяцией и пищей', () => {
    const engine = createEngine('test');
    const snapshot = engine.getSnapshot();

    expect(snapshot).toMatchObject({ step: 0, time: 0, running: false, speed: 1 });
    expect(snapshot.organismIds.length).toBe(CONFIG.population.initial);
    expect(snapshot.organisms.length).toBe(CONFIG.population.initial * ORGANISM_STRIDE);
    expect(engine.world.food.length).toBe(CONFIG.food.initial);
    expect(engine.statsHistory).toHaveLength(1);
  });

  it('отклоняет команды до init', () => {
    const engine = SimulationEngine.inst('test');

    expect(() => engine.start()).toThrow();
    expect(() => engine.advance(1)).toThrow();
  });

  it('считает модельное время через номер шага и dt', () => {
    const engine = createEngine('test');
    engine.advance(10);

    expect(engine.step).toBe(10);
    expect(engine.time).toBe(2.5);
  });

  it('не считает шаги на паузе', () => {
    const engine = createEngine('test');

    expect(engine.update(10, 100)).toBe(0);
    expect(engine.step).toBe(0);
  });

  it('переводит реальное время в шаги с учетом скорости', () => {
    const engine = createEngine('test');
    engine.setSpeed(2);
    engine.start();

    for (let i = 0; i < 8; i++) {
      engine.update(0.125, 100);
    }

    expect(engine.step).toBe(8);
  });

  it('рассчитывает шаги порциями и переносит остаток', () => {
    const engine = createEngine('test');
    engine.setSpeed(4);
    engine.start();

    expect(engine.update(0.25, 1)).toBe(1);
    expect(engine.update(0, 10)).toBe(3);
    expect(engine.step).toBe(4);
  });

  it('ограничивает отставание при долгом простое', () => {
    const engine = createEngine('test');
    engine.start();

    engine.update(1000, 2);
    for (let i = 0; i < 100; i++) {
      engine.update(0, 2);
    }

    expect(engine.step).toBeLessThan(10);
  });

  it('step ставит на паузу и рассчитывает один шаг', () => {
    const engine = createEngine('test');
    engine.start();
    engine.stepOnce();

    expect(engine.running).toBe(false);
    expect(engine.step).toBe(1);
  });

  it('ограничивает скорость допустимым диапазоном', () => {
    const engine = createEngine('test');

    engine.setSpeed(1000);
    expect(engine.speed).toBe(16);

    engine.setSpeed(0);
    expect(engine.speed).toBe(0.25);

    expect(() => engine.setSpeed(Number.NaN)).toThrow();
  });

  it('reset возвращает мир к начальному состоянию', () => {
    const engine = createEngine('test');
    const initial = fingerprint(engine);

    engine.start();
    engine.advance(50);
    engine.reset();

    expect(engine.running).toBe(false);
    expect(fingerprint(engine)).toEqual(initial);
  });

  it('воспроизводит мир при одинаковых seed и числе шагов', () => {
    const a = createEngine('a');
    const b = createEngine('b');
    a.advance(400);
    b.advance(400);

    expect(fingerprint(a)).toEqual(fingerprint(b));
  });

  it('дает другой мир при другом seed', () => {
    const a = createEngine('a');
    const b = createEngine('b', createTestConfig({ seed: 124 }));
    a.advance(50);
    b.advance(50);

    expect(fingerprint(a).organisms).not.toEqual(fingerprint(b).organisms);
  });

  it('исход не зависит от скорости и разбиения на порции', () => {
    const direct = createEngine('direct');
    direct.advance(120);

    const chunked = createEngine('chunked');
    chunked.setSpeed(16);
    chunked.start();
    while (chunked.step < 120) {
      chunked.update(0.05, Math.min(7, 120 - chunked.step));
    }
    chunked.pause();

    expect(fingerprint(chunked).organisms).toEqual(fingerprint(direct).organisms);
    expect(chunked.random.state).toBe(direct.random.state);
  });

  it('популяция живет, размножается и эволюционирует в допустимых диапазонах', () => {
    const engine = createEngine('life', createTestConfig({ seed: 7, dt: 1 / 30 }));
    // За первые 60 с смерти случаются не при каждом seed: стартовые особи ещё не стареют.
    engine.advance(30 * 120);

    const { world } = engine;
    expect(world.birthsTotal).toBeGreaterThan(0);
    expect(world.deathsTotal).toBeGreaterThan(0);
    expect(Math.max(...world.organisms.map((organism) => organism.generation))).toBeGreaterThan(1);

    const snapshot = engine.getSnapshot();
    for (const name of GENE_NAMES) {
      const { min, max } = GENE_DEFINITIONS[name];
      for (let i = 0; i < snapshot.organismIds.length; i++) {
        const value = snapshot.organisms[i * ORGANISM_STRIDE + organismGeneField(name)]!;
        expect(value).toBeGreaterThanOrEqual(Math.fround(min));
        expect(value).toBeLessThanOrEqual(Math.fround(max));
      }
    }
  });

  it('отдает подробности живого организма и null для отсутствующего', () => {
    const engine = createEngine('test');
    const id = engine.getSnapshot().organismIds[0]!;

    expect(engine.getOrganismDetails(id)).toMatchObject({ id, parentId: null, generation: 0 });
    expect(engine.getOrganismDetails(999_999)).toBeNull();
  });
});
