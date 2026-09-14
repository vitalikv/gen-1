import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SIMULATION_CONFIG } from '@/core/config';
import { PERSON_RADIUS } from '@/shared/settlement';
import { SimulationEngine } from '@/simulation/SimulationEngine';
import { SimulationRuntime } from '@/worker/SimulationRuntime';
import type { SimulationResponse } from '@/shared/protocol';
import { Settlement } from './Settlement';

function config(seed = 1) {
  const c = { ...structuredClone(DEFAULT_SIMULATION_CONFIG) };
  c.mode = 'settlement'; c.seed = seed;
  return c;
}

describe('Первый житель поселения', () => {
  afterEach(() => SimulationEngine.destroyAllInstances());

  it('доставляет ягоды, ест и сохраняет баланс конечных ресурсов', () => {
    const settlement = new Settlement(config());
    let delivered = false; let carried = false; let full = false;
    for (let step = 0; step < 18000; step++) {
      settlement.tick(1 / 30);
      const s = settlement.state;
      delivered ||= s.store.berries > 0; carried ||= s.person.cargo > 0; full ||= s.store.berries === s.store.capacity;
      expect(s.bushes.reduce((sum, b) => sum + b.berries, 0) + s.person.cargo + s.store.berries + s.eaten).toBe(120);
      expect(s.person.cargo).toBeLessThanOrEqual(8);
      expect(s.store.berries).toBeLessThanOrEqual(s.store.capacity);
      expect(settlement.environment.isBlocked(s.person.x, s.person.z, PERSON_RADIUS)).toBe(false);
    }
    expect({ delivered, carried, full }).toEqual({ delivered: true, carried: true, full: true });
    expect(settlement.state.eaten).toBeGreaterThan(0);
    expect(settlement.state.person.hunger).toBeLessThan(70);
  });

  it('повторяет старт по Seed и меняет расположение кустов при другом Seed', () => {
    expect(new Settlement(config()).state).toEqual(new Settlement(config()).state);
    expect(new Settlement(config(2)).state.bushes).not.toEqual(new Settlement(config()).state.bushes);
  });

  it('обходит стену и не прокладывает путь на изолированный берег', () => {
    const c = config(); c.environment.terrain = 'plain'; c.world = { width: 60, depth: 60 };
    c.environment.obstacles = [{ kind: 'rect', x: 0, z: 0, width: 2, depth: 30 }];
    const settlement = new Settlement(c);
    const start = { x: -9, z: 1 }; const end = { x: 9, z: 1 };
    const path = settlement.route(start, end);
    expect(path).not.toBeNull();
    expect(path!.some((p) => Math.abs(p.z) > 15)).toBe(true);
    let previous = start;
    for (const point of path!) { expect(settlement.clearSegment(previous, point)).toBe(true); previous = point; }
    c.environment.obstacles[0] = { kind: 'rect', x: 0, z: 0, width: 2, depth: 60 };
    expect(new Settlement(c).route(start, end)).toBeNull();
  });

  it('точно продолжает сохранение во время переноски', () => {
    const engine = SimulationEngine.inst('original'); engine.init(config());
    let state = engine.saveState();
    for (let i = 0; i < 6000; i++) {
      engine.advance(1); state = engine.saveState();
      if (state.settlement!.person.cargo > 0 && state.settlement!.person.path.length > 0) break;
    }
    expect(state.settlement!.person.cargo).toBeGreaterThan(0);
    expect(state.settlement!.person.path.length).toBeGreaterThan(0);
    const restored = SimulationEngine.inst('restored'); restored.loadState(JSON.parse(JSON.stringify(state)));
    engine.advance(3000); restored.advance(3000);
    expect(restored.getSnapshot()).toEqual(engine.getSnapshot());
    expect(restored.saveState().settlement).toEqual(engine.saveState().settlement);
  });

  it('не пересекает реку без переправы', () => {
    const c = config(); c.environment.terrainSettings!.lakeCount = 0;
    const settlement = new Settlement(c);
    expect(settlement.route({ x: -90, z: 0 }, { x: 90, z: 0 })).toBeNull();
  });

  it('не принимает дублированные ресурсы и не теряет текущий запуск при ошибке загрузки', () => {
    const engine = SimulationEngine.inst('invalid'); engine.init(config());
    const before = engine.getSnapshot();
    const state = engine.saveState(); state.settlement!.store.berries++;
    expect(() => engine.loadState(state)).toThrow('Некорректное сохранение поселения');
    expect(engine.getSnapshot()).toEqual(before);
  });

  it('показывает истощение кустов без отрицательных остатков', () => {
    const settlement = new Settlement(config());
    for (const bush of settlement.state.bushes) bush.berries = 0;
    settlement.state.eaten = settlement.state.initialBerries;
    for (let i = 0; i < 300; i++) settlement.tick(1 / 30);
    expect(settlement.state.person.reason).toContain('Кусты истощены');
    expect(settlement.state.person.cargo).toBe(0);
  });

  it('передаёт режим, шаги, сброс и сохранение через Worker runtime', () => {
    const responses: SimulationResponse[] = [];
    const engine = SimulationEngine.inst('runtime');
    const runtime = new SimulationRuntime(engine, (response) => responses.push(response));
    runtime.handleCommand({ type: 'init', config: config() });
    runtime.handleCommand({ type: 'step' });
    runtime.handleCommand({ type: 'saveState' });
    const saved = responses.find((r) => r.type === 'state');
    expect(saved?.type === 'state' && saved.state.settlement?.person).toBeTruthy();
    expect(engine.step).toBe(1);
    runtime.handleCommand({ type: 'reset' }); expect(engine.step).toBe(0);
    const evolution = config(); evolution.mode = 'evolution';
    runtime.handleCommand({ type: 'updateConfig', config: evolution, reset: true });
    expect(engine.getSnapshot().settlement).toBeUndefined();
    expect(engine.world.organisms.length).toBeGreaterThan(0);
  });
});
