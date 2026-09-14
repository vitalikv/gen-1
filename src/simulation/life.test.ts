import { afterEach, describe, expect, it } from 'vitest';
import { GENE_DEFINITIONS, GENE_NAMES, type GeneValues } from '@/shared/genes';
import { Genome } from './Genome';
import { Organism } from './Organism';
import { SimulationEngine } from './SimulationEngine';
import { World } from './World';
import { createTestConfig } from './testConfig';
import { BehaviorSystem } from './systems/BehaviorSystem';
import { EnergySystem } from './systems/EnergySystem';
import { compatible, EvolutionSystem, isReady } from './systems/EvolutionSystem';
import { FoodSystem } from './systems/FoodSystem';

function pair() {
  const config = createTestConfig({ population: { initial: 2, max: 100 }, food: { initial: 0, max: 100, energy: 25, spawnPerSecond: 0 } });
  const world = World.create(config);
  const [mother, father] = world.organisms as [Organism, Organism];
  for (const organism of [mother, father]) {
    organism.x = 0;
    organism.z = 0;
    organism.age = 10;
    organism.energy = organism.capacity * 0.95;
  }
  return { world, mother, father, evolution: new EvolutionSystem() };
}

describe('Половое размножение', () => {
  it('без самца и от однополой пары зачатие и рождение невозможны', () => {
    const { world, mother, father, evolution } = pair();
    expect(evolution.tryReproduce(world, mother, 100)).toBeNull();
    expect(evolution.tryMate(world, mother, mother)).toBe(false);
    father.life.sex = 'female';
    expect(evolution.tryMate(world, mother, father)).toBe(false);
    expect(world.birthsTotal).toBe(0);
  });

  it('рождение от двух родителей требует беременности и сохраняет энергетический баланс', () => {
    const { world, mother, father, evolution } = pair();
    const before = mother.energy + father.energy;
    expect(evolution.tryMate(world, mother, father)).toBe(true);
    const reserved = mother.life.pregnancy!.energy;
    const cost = world.config.lifecycle.reproductionCostPerSize * (mother.bodySize + father.bodySize);
    expect(mother.energy + father.energy + reserved + cost).toBeCloseTo(before, 10);
    expect(world.birthsTotal).toBe(0);
    expect(evolution.tryReproduce(world, mother, world.config.reproduction.gestationDuration - 0.25)).toBeNull();
    const child = evolution.tryReproduce(world, mother, 0.25)!;
    expect(child.parentId).toBe(mother.id);
    expect(child.life.fatherId).toBe(father.id);
    expect(child.generation).toBe(Math.max(mother.generation, father.generation) + 1);
    expect(child.energy).toBe(reserved);
    expect(child.life.growth).toBe(0.4);
    expect(isReady(world, child)).toBe(false);
    expect(mother.life.pregnancy).toBeNull();
    expect(mother.life.recovery).toBe(world.config.reproduction.femaleRecovery);
    expect(father.life.recovery).toBe(world.config.reproduction.maleRecovery);
    expect(evolution.tryMate(world, mother, father)).toBe(false);
  });

  it('зрелость, здоровье, энергия, дистанция и препятствие ограничивают спаривание', () => {
    for (const change of [
      (o: Organism) => { o.age = 0; },
      (o: Organism) => { o.life.growth = 0.4; },
      (o: Organism) => { o.life.health = 0.5; },
      (o: Organism) => { o.life.stamina = 0.1; },
      (o: Organism) => { o.energy = 0; },
      (o: Organism) => { o.x = 20; },
    ]) {
      const { world, mother, father, evolution } = pair();
      change(father);
      expect(evolution.tryMate(world, mother, father)).toBe(false);
    }
    const { world, mother, father, evolution } = pair();
    mother.x = -1;
    father.x = 1;
    world.config.environment.obstacles.push({ kind: 'rect', x: 0, z: 0, width: 0.1, depth: 10 });
    expect(evolution.tryMate(world, mother, father)).toBe(false);
  });

  it('исключает родителей, потомков и особей с общим родителем', () => {
    const { world, mother, father, evolution } = pair();
    evolution.tryMate(world, mother, father);
    const child = evolution.tryReproduce(world, mother, 10)!;
    child.life.sex = 'male';
    expect(compatible(mother, child)).toBe(false);
    child.life.sex = 'female';
    expect(compatible(father, child)).toBe(false);
    const sibling = world.addOffspring({ parent: mother, fatherId: father.id, sex: 'male', genome: father.genome,
      x: 0, z: 0, heading: 0, energy: 20 });
    expect(compatible(child, sibling)).toBe(false);
  });

  it('беременность не повторяется, смерть матери прекращает рождение, смерть отца не отменяет зачатие', () => {
    const { world, mother, father, evolution } = pair();
    evolution.tryMate(world, mother, father);
    expect(evolution.tryMate(world, mother, father)).toBe(false);
    father.alive = false;
    expect(evolution.tryReproduce(world, mother, 10)).not.toBeNull();
    const next = pair();
    next.evolution.tryMate(next.world, next.mother, next.father);
    next.mother.alive = false;
    expect(next.evolution.tryReproduce(next.world, next.mother, 10)).toBeNull();
  });

  it('предел популяции соблюдается и при зачатии, и при рождении', () => {
    const { world, mother, father, evolution } = pair();
    world.config.population.max = 2;
    expect(evolution.tryMate(world, mother, father)).toBe(false);
    world.config.population.max = 3;
    expect(evolution.tryMate(world, mother, father)).toBe(true);
    world.config.population.max = 2;
    expect(evolution.tryReproduce(world, mother, 10)).toBeNull();
    world.config.population.max = 3;
    expect(evolution.tryReproduce(world, mother, 0.25)).not.toBeNull();
    expect(world.populationCount).toBe(3);
  });

  it('стартовые полы сбалансированы; пол детей и наследование воспроизводимы', () => {
    const { world } = pair();
    const low = {} as GeneValues;
    const high = {} as GeneValues;
    for (const name of GENE_NAMES) { low[name] = GENE_DEFINITIONS[name].min; high[name] = GENE_DEFINITIONS[name].max; }
    let maternal = 0;
    let paternal = 0;
    for (let i = 0; i < 50; i++) {
      const child = new Genome(low).recombine(new Genome(high), world.random, 0, 1);
      for (const name of GENE_NAMES) {
        expect([low[name], high[name]]).toContain(child.get(name));
        if (child.get(name) === low[name]) maternal++; else paternal++;
      }
    }
    expect(maternal).toBeGreaterThan(0);
    expect(paternal).toBeGreaterThan(0);
    expect(world.organisms.map((o) => o.sex)).toEqual(['female', 'male']);
  });
});

describe('Физиология, поведение и ресурсы', () => {
  afterEach(() => SimulationEngine.destroyAllInstances());

  it.each([1, 7, 23])('несколько поколений на стандартных настройках, seed %s', (seed) => {
    const engine = SimulationEngine.inst(`long-${seed}`);
    engine.init(createTestConfig({ seed, dt: 1 / 30 }));
    engine.advance(30 * 180);
    expect(engine.world.birthsTotal).toBeGreaterThan(0);
    expect(engine.world.organisms.length).toBeGreaterThan(0);
    expect(engine.world.organisms.some((o) => o.generation >= 2)).toBe(true);
    for (const organism of engine.world.organisms) {
      expect(Number.isFinite(organism.energy)).toBe(true);
      expect(organism.energy).toBeGreaterThanOrEqual(0);
      expect(organism.energy).toBeLessThanOrEqual(organism.capacity);
      expect(organism.life.stamina).toBeGreaterThanOrEqual(0);
      expect(organism.life.stamina).toBeLessThanOrEqual(1);
      if (organism.generation > 0) {
        expect(organism.parentId).not.toBeNull();
        expect(organism.life.fatherId).not.toBeNull();
      }
    }
  });

  it('еда усваивается постепенно, остаток не исчезает при полном желудке', () => {
    const { world, mother } = pair();
    mother.energy = 10;
    const food = { id: 1, x: 0, z: 0, energy: 100, maxEnergy: 100, eaten: false };
    const energy = new EnergySystem();
    energy.eat(mother, food, 0.5);
    expect(mother.energy).toBe(10);
    expect(mother.life.stomach + food.energy).toBeCloseTo(100);
    const stomach = mother.life.stomach;
    energy.update(world, mother, 0.25);
    expect(mother.life.stomach).toBeLessThan(stomach);
    expect(mother.energy).toBeGreaterThan(10);
    expect(mother.energy).toBeLessThan(mother.capacity);
  });

  it('сытая уставшая особь отдыхает и восстанавливает выносливость', () => {
    const { world, mother } = pair();
    mother.life.stamina = 0.05;
    const x = mother.x;
    new BehaviorSystem().update(world, mother, 0.25);
    new EnergySystem().update(world, mother, 0.25);
    expect(mother.action).toBe('resting');
    expect(mother.x).toBe(x);
    expect(mother.life.stamina).toBeGreaterThan(0.05);
  });

  it('организм ищет видимого партнёра и не видит еду сквозь стену или позади себя', () => {
    const { world, mother, father } = pair();
    father.x = 5;
    mother.heading = 0;
    world.rebuildOrganismIndex();
    const behavior = new BehaviorSystem();
    behavior.plan(world, mother, 0.25);
    expect(mother.action).toBe('seekingMate');
    expect(mother.life.mateId).toBe(father.id);
    mother.energy = 10;
    world.food.push({ id: 1, x: 5, z: 0, energy: 25, maxEnergy: 25, eaten: false });
    new FoodSystem().rebuildIndex(world);
    world.config.environment.obstacles.push({ kind: 'rect', x: 2, z: 0, width: 1, depth: 20 });
    expect(behavior.plan(world, mother, 0.25).food).toBeNull();
    world.config.environment.obstacles.length = 0;
    mother.heading = Math.PI;
    expect(behavior.plan(world, mother, 0.25).food).toBeNull();
    mother.heading = 0;
    expect(behavior.plan(world, mother, 0.25).food?.id).toBe(1);
  });

  it('истощённое растение восстанавливается в том же месте в зависимости от сезона', () => {
    const { world } = pair();
    const plant = world.trySpawnFood()!;
    plant.energy = 0;
    plant.eaten = true;
    world.commitStep();
    expect(world.food).toContain(plant);
    world.config.season.enabled = true;
    world.config.season.period = 4;
    world.config.season.amplitude = 1;
    const system = new FoodSystem();
    system.spawn(world, 1, 1);
    expect(plant.energy).toBeCloseTo(world.config.resources.regrowthPerSecond * 2);
    const summerEnergy = plant.energy;
    system.spawn(world, 1, 3);
    expect(plant.energy).toBe(summerEnergy);
  });

  it('сохраняет беременность, память и физиологию с точным продолжением после загрузки', () => {
    const config = createTestConfig({ world: { width: 30, depth: 30 }, population: { initial: 10, max: 100 } });
    const original = SimulationEngine.inst('pregnant');
    original.init(config);
    const mother = original.world.organisms[0]!;
    const father = original.world.organisms[1]!;
    for (const o of [mother, father]) { o.x = 0; o.z = 0; o.energy = o.capacity * 0.95; }
    expect(new EvolutionSystem().tryMate(original.world, mother, father)).toBe(true);
    mother.life.memory = [{ foodId: 999, x: 5, z: 5, energy: 25, maxEnergy: 25, seenAt: mother.age }];
    mother.life.stomach = 10;
    original.advance(3);
    const restored = SimulationEngine.inst('restored-pregnant');
    restored.loadState(JSON.parse(JSON.stringify(original.saveState())));
    original.advance(40);
    restored.advance(40);
    expect(restored.world.toSaved()).toEqual(original.world.toSaved());
    expect(restored.statsHistory).toEqual(original.statsHistory);
    expect(original.world.birthsTotal).toBeGreaterThan(0);
  });

  it('разрешение конкуренции за пищу не закрепляет преимущество первого ID', () => {
    const winners = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) {
      const engine = SimulationEngine.inst(`competition-${seed}`);
      engine.init(createTestConfig({ seed, population: { initial: 2, max: 2 }, food: { initial: 0, max: 1, energy: 25, spawnPerSecond: 0 } }));
      for (const o of engine.world.organisms) { o.x = 0; o.z = 0; o.energy = 10; }
      engine.world.food.push({ id: 1, x: 0, z: 0, energy: 25, maxEnergy: 25, eaten: false });
      engine.advance(1);
      winners.add(engine.world.organisms.find((o) => o.life.stomach > 0)!.id);
    }
    expect(winners.size).toBe(2);
  });
});
