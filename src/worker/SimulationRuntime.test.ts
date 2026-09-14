import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SimulationConfig, SimulationResponse } from '@/shared/protocol';
import { SimulationEngine } from '@/simulation/SimulationEngine';
import { SimulationRuntime } from './SimulationRuntime';

const CONFIG: SimulationConfig = { seed: 1, worldWidth: 100, worldDepth: 100, dt: 0.25 };

describe('SimulationRuntime', () => {
  let responses: SimulationResponse[];
  let runtime: SimulationRuntime;
  let engine: SimulationEngine;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    responses = [];
    engine = SimulationEngine.inst('runtime-test');
    runtime = new SimulationRuntime(engine, (response) => responses.push(response));
  });

  afterEach(() => {
    vi.useRealTimers();
    SimulationEngine.destroyAllInstances();
  });

  const lastSnapshot = () => {
    const snapshots = responses.filter((response) => response.type === 'snapshot');
    return snapshots.at(-1)?.snapshot;
  };

  it('отвечает ready и снимком на init', () => {
    runtime.handleCommand({ type: 'init', config: CONFIG });

    expect(responses.map((response) => response.type)).toEqual(['ready', 'snapshot']);
  });

  it('после start считает шаги по реальному времени и отправляет снимки', () => {
    runtime.handleCommand({ type: 'init', config: CONFIG });
    runtime.handleCommand({ type: 'start' });

    vi.advanceTimersByTime(1000);

    expect(engine.step).toBeGreaterThanOrEqual(3);
    expect(engine.step).toBeLessThanOrEqual(4);
    expect(lastSnapshot()?.step).toBe(engine.step);
  });

  it('на паузе останавливает расчет', () => {
    runtime.handleCommand({ type: 'init', config: CONFIG });
    runtime.handleCommand({ type: 'start' });
    vi.advanceTimersByTime(500);
    runtime.handleCommand({ type: 'pause' });

    const pausedStep = engine.step;
    vi.advanceTimersByTime(5000);

    expect(engine.step).toBe(pausedStep);
    expect(lastSnapshot()).toMatchObject({ step: pausedStep, running: false });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('отправляет снимок сразу после step и reset', () => {
    runtime.handleCommand({ type: 'init', config: CONFIG });

    runtime.handleCommand({ type: 'step' });
    expect(lastSnapshot()?.step).toBe(1);

    runtime.handleCommand({ type: 'reset' });
    expect(lastSnapshot()?.step).toBe(0);
  });

  it('пробрасывает ошибку команды до init', () => {
    expect(() => runtime.handleCommand({ type: 'start' })).toThrow();
  });
});
