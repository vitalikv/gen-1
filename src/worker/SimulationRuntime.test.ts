import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SimulationResponse } from '@/shared/protocol';
import { SimulationEngine } from '@/simulation/SimulationEngine';
import { createTestConfig } from '@/simulation/testConfig';
import { SimulationRuntime } from './SimulationRuntime';

const CONFIG = createTestConfig({ seed: 1 });

describe('SimulationRuntime', () => {
  let responses: SimulationResponse[];
  let transfers: ArrayBuffer[][];
  let runtime: SimulationRuntime;
  let engine: SimulationEngine;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    responses = [];
    transfers = [];
    engine = SimulationEngine.inst('runtime-test');
    runtime = new SimulationRuntime(engine, (response, transfer = []) => {
      responses.push(response);
      transfers.push(transfer);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    SimulationEngine.destroyAllInstances();
  });

  const lastOfType = <T extends SimulationResponse['type']>(type: T) =>
    responses.filter((response): response is Extract<SimulationResponse, { type: T }> => response.type === type).at(-1);

  it('отвечает ready, конфигурацией, снимком и статистикой на init; буферы снимков передаются', () => {
    runtime.handleCommand({ type: 'init', config: CONFIG });

    expect(responses.map((response) => response.type)).toEqual(['ready', 'config', 'snapshot', 'stats']);
    expect(transfers[0]).toHaveLength(3);
    expect(transfers[2]).toHaveLength(3);
  });

  it('применяет updateConfig и сообщает текущую и следующую конфигурацию', () => {
    runtime.handleCommand({ type: 'init', config: CONFIG });
    const next = structuredClone(CONFIG);
    next.seed = 99;
    next.food.energy = 40;

    runtime.handleCommand({ type: 'updateConfig', config: next, reset: false });

    expect(lastOfType('config')).toMatchObject({
      current: { seed: CONFIG.seed, food: { energy: 40 } },
      next: { seed: 99, food: { energy: 40 } },
    });

    runtime.handleCommand({ type: 'updateConfig', config: next, reset: true });
    expect(lastOfType('config')?.current.seed).toBe(99);
  });

  it('сохраняет состояние и загружает его', () => {
    runtime.handleCommand({ type: 'init', config: CONFIG });
    for (let i = 0; i < 5; i++) {
      runtime.handleCommand({ type: 'step' });
    }
    runtime.handleCommand({ type: 'saveState' });
    const state = lastOfType('state')!.state;

    runtime.handleCommand({ type: 'reset' });
    runtime.handleCommand({ type: 'loadState', state: JSON.parse(JSON.stringify(state)) });

    expect(lastOfType('snapshot')?.snapshot.step).toBe(5);
    expect(lastOfType('config')?.current.seed).toBe(CONFIG.seed);
  });

  it('после start считает шаги по реальному времени и отправляет снимки', () => {
    runtime.handleCommand({ type: 'init', config: CONFIG });
    runtime.handleCommand({ type: 'start' });

    vi.advanceTimersByTime(1000);

    expect(engine.step).toBeGreaterThanOrEqual(3);
    expect(engine.step).toBeLessThanOrEqual(4);
    expect(lastOfType('snapshot')?.snapshot.step).toBe(engine.step);
  });

  it('на паузе останавливает расчет', () => {
    runtime.handleCommand({ type: 'init', config: CONFIG });
    runtime.handleCommand({ type: 'start' });
    vi.advanceTimersByTime(500);
    runtime.handleCommand({ type: 'pause' });

    const pausedStep = engine.step;
    vi.advanceTimersByTime(5000);

    expect(engine.step).toBe(pausedStep);
    expect(lastOfType('snapshot')?.snapshot).toMatchObject({ step: pausedStep, running: false });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('отправляет снимок сразу после step и reset', () => {
    runtime.handleCommand({ type: 'init', config: CONFIG });

    runtime.handleCommand({ type: 'step' });
    expect(lastOfType('snapshot')?.snapshot.step).toBe(1);

    runtime.handleCommand({ type: 'reset' });
    expect(lastOfType('snapshot')?.snapshot.step).toBe(0);
  });

  it('отправляет подробности выбранного организма и снимает выбор при reset', () => {
    runtime.handleCommand({ type: 'init', config: CONFIG });
    const id = lastOfType('snapshot')!.snapshot.organismIds[0]!;

    runtime.handleCommand({ type: 'inspectOrganism', id });
    expect(lastOfType('organismDetails')).toMatchObject({ id, details: { id } });

    runtime.handleCommand({ type: 'reset' });
    const count = responses.filter((response) => response.type === 'organismDetails').length;
    runtime.handleCommand({ type: 'step' });
    expect(responses.filter((response) => response.type === 'organismDetails')).toHaveLength(count);
  });

  it('пробрасывает ошибку команды до init', () => {
    expect(() => runtime.handleCommand({ type: 'start' })).toThrow();
  });
});
