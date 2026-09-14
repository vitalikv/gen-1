import { afterEach, describe, expect, it } from 'vitest';
import type { SimulationConfig } from '@/shared/protocol';
import { SimulationEngine } from './SimulationEngine';

/** dt = 0.25 точно представим в двоичном виде, поэтому шаги считаются без погрешности */
const CONFIG: SimulationConfig = { seed: 123, worldWidth: 100, worldDepth: 100, dt: 0.25 };

function createEngine(context: string): SimulationEngine {
  const engine = SimulationEngine.inst(context);
  engine.init(CONFIG);
  return engine;
}

describe('SimulationEngine', () => {
  afterEach(() => {
    SimulationEngine.destroyAllInstances();
  });

  it('после init стоит на паузе на нулевом шаге', () => {
    const engine = createEngine('test');

    expect(engine.getSnapshot()).toEqual({ step: 0, time: 0, running: false, speed: 1 });
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
    let steps = 0;
    for (let i = 0; i < 100; i++) {
      steps += engine.update(0, 2);
    }

    expect(engine.step).toBeLessThan(10);
    expect(steps).toBeLessThan(10);
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

  it('reset возвращает шаг и генератор к начальному состоянию', () => {
    const engine = createEngine('test');
    const initialRandomState = engine.random.state;

    engine.start();
    engine.advance(50);
    engine.random.next();
    engine.reset();

    expect(engine.getSnapshot()).toEqual({ step: 0, time: 0, running: false, speed: 1 });
    expect(engine.random.state).toBe(initialRandomState);
  });

  it('воспроизводит состояние при одинаковых seed и командах', () => {
    const run = (context: string): [number, number] => {
      const engine = createEngine(context);
      engine.setSpeed(2);
      engine.start();
      engine.update(0.1, 3);
      engine.update(0.2, 3);
      engine.stepOnce();
      engine.advance(20);
      return [engine.step, engine.random.state];
    };

    expect(run('a')).toEqual(run('b'));
  });
});
