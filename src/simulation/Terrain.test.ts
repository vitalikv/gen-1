import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SIMULATION_CONFIG } from '@/core/config';
import { Terrain } from '@/shared/Terrain';
import { SimulationEngine } from './SimulationEngine';
import { World } from './World';
import { FoodSystem } from './systems/FoodSystem';
import { validateConfig } from './validateConfig';

function config(seed = 1) { return { ...structuredClone(DEFAULT_SIMULATION_CONFIG), seed }; }

describe('Географическая местность', () => {
  afterEach(() => SimulationEngine.destroyAllInstances());

  it('задаёт точную долю песка на суше и позволяет отключить воду', () => {
    const c = config();
    c.environment.terrainSettings!.lakeCount = 0;
    c.environment.terrainSettings!.riverCount = 0;
    for (const percent of [0, 27, 100]) {
      c.environment.terrainSettings!.sandPercent = percent;
      const terrain = new Terrain(c);
      expect(terrain.cells.includes(2)).toBe(false);
      expect(terrain.cells.filter((cell) => cell === 1).length).toBe(Math.round(terrain.cells.length * percent / 100));
    }
    c.environment.terrainSettings!.lakeCount = 4;
    c.environment.terrainSettings!.sandPercent = 35;
    const terrain = new Terrain(c);
    const land = terrain.cells.filter((cell) => cell !== 2).length;
    expect(land).toBeLessThan(terrain.cells.length);
    expect(terrain.cells.filter((cell) => cell === 1).length).toBe(Math.round(land * 0.35));
  });

  it('увеличение размеров озёр и ширины рек увеличивает площадь воды', () => {
    for (const key of ['lakeSize', 'riverWidth'] as const) {
      const c = config();
      c.environment.terrainSettings![key] = 2;
      const small = new Terrain(c).cells.filter((cell) => cell === 2).length;
      c.environment.terrainSettings![key] = 40;
      expect(new Terrain(c).cells.filter((cell) => cell === 2).length).toBeGreaterThan(small);
    }
  });

  it('адаптирует сетку к прямоугольному миру и сохраняет старую сетку', () => {
    const c = config();
    c.world = { width: 400, depth: 100 };
    const terrain = new Terrain(c);
    expect([terrain.columns, terrain.rows, terrain.cellWidth, terrain.cellDepth]).toEqual([400, 100, 1, 1]);
    delete c.environment.terrainSettings;
    const legacy = new Terrain(c);
    expect([legacy.columns, legacy.rows]).toEqual([192, 192]);
    expect(legacy.cells).toEqual(new Terrain(c).cells);
  });

  it('проверяет параметры генерации', () => {
    for (const [key, value] of [['lakeCount', -1], ['riverCount', 1.5], ['lakeSize', 0], ['riverWidth', NaN], ['sandPercent', 101]] as const) {
      const c = config();
      c.environment.terrainSettings![key] = value;
      expect(() => validateConfig(c)).toThrow(`environment.terrainSettings.${key}`);
    }
  });

  it('применяет размер и ландшафт только при сбросе', () => {
    const engine = SimulationEngine.inst('terrain-size');
    engine.init(config());
    const next = config();
    next.world = { width: 300, depth: 100 };
    next.environment.terrainSettings!.lakeCount = 0;
    next.environment.terrainSettings!.riverCount = 0;
    engine.updateConfig(next, false);
    expect(engine.world.config.world.width).toBe(200);
    expect(engine.world.environment.terrain.cells.includes(2)).toBe(true);
    engine.reset();
    expect(engine.world.config.world).toEqual(next.world);
    expect(engine.world.environment.terrain.cells.includes(2)).toBe(false);
  });

  it('повторяет карту по seed и содержит все три поверхности при разных seed', () => {
    for (const seed of [1, 2, 5, 42, -1, 999]) {
      const terrain = new Terrain(config(seed));
      expect(new Set(terrain.cells)).toEqual(new Set([0, 1, 2]));
      expect(terrain.cells).toEqual(new Terrain(config(seed)).cells);
    }
    expect(new Terrain(config(1)).cells).not.toEqual(new Terrain(config(2)).cells);
  });

  it('замедляет восстановление на песке и не создаёт растения в воде', () => {
    const world = World.create(config());
    const points = new Map<string, { x: number; z: number }>();
    for (let z = -99; z < 100; z += 2) {
      for (let x = -99; x < 100; x += 2) points.set(world.environment.terrain.kindAt(x, z), { x, z });
    }
    for (const food of world.food) expect(world.environment.terrain.kindAt(food.x, food.z)).not.toBe('water');
    world.food.length = 0;
    world.config.food.spawnPerSecond = 0;
    for (const kind of ['grass', 'sand', 'water']) {
      world.food.push({ id: world.food.length, ...points.get(kind)!, energy: 0, maxEnergy: 25, eaten: true });
    }
    new FoodSystem().spawn(world, 1, 0);
    expect(world.food[0]!.energy).toBeCloseTo(0.6);
    expect(world.food[1]!.energy).toBeCloseTo(0.6 * 0.07);
    expect(world.food[2]!.energy).toBe(0);
  });

  it('останавливает большой шаг перед рекой, вода не закрывает обзор', () => {
    const world = new World(config());
    const start = { x: -99, z: 0 };
    const end = { x: 99, z: 0 };
    expect(world.environment.hasLineOfSight(start, end)).toBe(true);
    expect(world.environment.terrain.stopAtShore(start, end, 1, { x: 0, z: 0 })).toBe(true);
    expect(end.x).toBeLessThan(50);
    expect(world.environment.isBlocked(end.x, end.z, 1)).toBe(false);
  });

  it('размещает потомство из воды на суше', () => {
    const world = World.create(config());
    const parent = world.organisms[0]!;
    let water = { x: 0, z: 0 };
    for (let x = -99; x < 100; x++) {
      if (world.environment.terrain.kindAt(x, 0) === 'water') { water = { x, z: 0 }; break; }
    }
    const child = world.addOffspring({ parent, genome: parent.genome, ...water, heading: 0, energy: 10 });
    expect(world.environment.isBlocked(child.x, child.z, child.bodySize)).toBe(false);
  });

  it('не допускает организмы в воду за 600 шагов и точно продолжает сохранение', () => {
    const engine = SimulationEngine.inst('terrain-original');
    engine.init(config());
    for (let step = 0; step < 600; step++) {
      engine.advance(1);
      for (const organism of engine.world.organisms) {
        expect(engine.world.environment.isBlocked(organism.x, organism.z, organism.bodySize - 1e-6)).toBe(false);
      }
    }
    const restored = SimulationEngine.inst('terrain-restored');
    restored.loadState(engine.saveState());
    engine.advance(100);
    restored.advance(100);
    expect(restored.world.toSaved()).toEqual(engine.world.toSaved());
    expect(restored.world.environment.terrain.cells).toEqual(engine.world.environment.terrain.cells);
  });

  it('меняет местность только при сбросе и поддерживает старую конфигурацию', () => {
    const engine = SimulationEngine.inst('terrain-settings');
    engine.init(config());
    const plain = config();
    delete plain.environment.terrain;
    engine.updateConfig(plain, false);
    expect(engine.world.environment.terrain.enabled).toBe(true);
    engine.reset();
    expect(engine.world.environment.terrain.enabled).toBe(false);
    expect(engine.world.environment.fertilityAt(0, 0)).toBe(1);
  });
});
