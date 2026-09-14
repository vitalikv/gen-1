import { afterEach, describe, expect, it } from 'vitest';
import { GENE_DEFINITIONS, GENE_NAMES, PREDATOR_INITIAL_GENES, type GeneValues } from '@/shared/genes';
import type { Diet, Sex } from '@/shared/life';
import { Genome } from './Genome';
import { Organism } from './Organism';
import { SimulationEngine } from './SimulationEngine';
import { createTestConfig } from './testConfig';
import { BehaviorSystem } from './systems/BehaviorSystem';
import { compatible, EvolutionSystem } from './systems/EvolutionSystem';
import { PredationSystem } from './systems/PredationSystem';
import { World } from './World';

let nextParentId = 10_000;

function genome(diet: Diet, overrides: Partial<GeneValues> = {}): Genome {
  const values = {} as GeneValues;
  for (const name of GENE_NAMES) values[name] = GENE_DEFINITIONS[name].initial;
  return new Genome({ ...values, ...(diet === 'predator' ? PREDATOR_INITIAL_GENES : {}), ...overrides });
}

/** Взрослая особь с собственным фиктивным родителем, чтобы особи не считались родственниками */
function spawn(world: World, diet: Diet, x: number, z: number, options: { sex?: Sex; genes?: Partial<GeneValues>; energy?: number } = {}): Organism {
  const g = genome(diet, options.genes);
  const parent = new Organism({ id: nextParentId++, parentId: null, generation: -1, genome: g, x, z, heading: 0,
    energy: 1, capacityPerSize: world.config.energy.capacityPerSize, diet });
  const organism = world.addOffspring({ parent, genome: g, x, z, heading: 0, energy: options.energy ?? 50, sex: options.sex ?? 'female' });
  world.commitStep();
  organism.life.growth = 1;
  organism.age = 20;
  return organism;
}

function emptyWorld(): World {
  const config = createTestConfig({ population: { initial: 0, max: 100 }, food: { initial: 0, max: 0, spawnPerSecond: 0, energy: 25 } });
  config.predation.catchChance = 1;
  return World.create(config);
}

describe('Хищники', () => {
  afterEach(() => SimulationEngine.destroyAllInstances());

  it('поимка убивает жертву, передаёт энергию хищнику и запускает паузу между попытками', () => {
    const world = emptyWorld();
    const predator = spawn(world, 'predator', 0, 0, { energy: 10 });
    const prey = spawn(world, 'herbivore', 2, 0, { energy: 40 });
    world.rebuildOrganismIndex();
    const value = PredationSystem.preyValue(world, prey);

    expect(new PredationSystem().tryCatch(world, predator, prey)).toBe(true);
    expect(prey.alive).toBe(false);
    expect(prey.life.deathCause).toBe('predation');
    expect(world.killsTotal).toBe(1);
    expect(predator.life.stomach).toBeCloseTo(Math.min(value, predator.capacity * world.config.predation.stomachShare), 10);
    expect(predator.life.attackCooldown).toBe(world.config.predation.attackCooldown);

    const next = spawn(world, 'herbivore', 2, 0);
    expect(new PredationSystem().tryCatch(world, predator, next)).toBe(false);
    expect(next.alive).toBe(true);
  });

  it('не ловит издалека, не ловит хищников, а травоядные не охотятся', () => {
    const world = emptyWorld();
    const predator = spawn(world, 'predator', 0, 0);
    const far = spawn(world, 'herbivore', 10, 0);
    const rival = spawn(world, 'predator', 1, 0);
    const herbivore = spawn(world, 'herbivore', 1, 1);
    const system = new PredationSystem();
    expect(system.tryCatch(world, predator, far)).toBe(false);
    expect(system.tryCatch(world, predator, rival)).toBe(false);
    expect(system.tryCatch(world, herbivore, far)).toBe(false);
    expect(world.killsTotal).toBe(0);
  });

  it('вероятность поимки растёт с размером хищника', () => {
    const world = emptyWorld();
    world.config.predation.catchChance = 0.4;
    const prey = spawn(world, 'herbivore', 0, 0);
    const small = spawn(world, 'predator', 0, 0, { genes: { size: 0.5 } });
    const large = spawn(world, 'predator', 0, 0, { genes: { size: 2 } });
    expect(PredationSystem.catchProbability(world, small, prey)).toBeLessThan(0.4);
    expect(PredationSystem.catchProbability(world, large, prey)).toBeGreaterThan(0.4);
  });

  it('голодный хищник преследует видимую жертву, а травоядное убегает от замеченного хищника', () => {
    const world = emptyWorld();
    const predator = spawn(world, 'predator', 0, 0, { energy: 10 });
    const prey = spawn(world, 'herbivore', 6, 0, { energy: 90 });
    prey.heading = Math.PI;
    world.rebuildOrganismIndex();
    const behavior = new BehaviorSystem();

    const intent = behavior.plan(world, predator, 0.25);
    expect(predator.action).toBe('hunting');
    expect(intent.prey).toBe(prey);

    behavior.plan(world, prey, 0.25);
    expect(prey.action).toBe('fleeing');
    expect(Math.abs(prey.heading)).toBeCloseTo(0);

    // Потеряв хищника из виду, травоядное ещё fleeDuration секунд убегает от последнего места встречи.
    predator.x = -100;
    world.rebuildOrganismIndex();
    behavior.plan(world, prey, 0.25);
    expect(prey.action).toBe('fleeing');
    behavior.plan(world, prey, world.config.predation.fleeDuration);
    expect(prey.action).not.toBe('fleeing');
  });

  it('нулевая осторожность отключает бегство', () => {
    const world = emptyWorld();
    spawn(world, 'predator', 0, 0, { energy: 100 });
    const prey = spawn(world, 'herbivore', 6, 0, { energy: 90, genes: { caution: 0 } });
    prey.heading = Math.PI;
    world.rebuildOrganismIndex();
    new BehaviorSystem().plan(world, prey, 0.25);
    expect(prey.action).not.toBe('fleeing');
  });

  it('виды не скрещиваются, детёныш наследует вид матери', () => {
    const world = emptyWorld();
    const female = spawn(world, 'predator', 0, 0, { energy: 100 });
    const herbivoreMale = spawn(world, 'herbivore', 0, 0, { sex: 'male', energy: 100 });
    const predatorMale = spawn(world, 'predator', 0, 0, { sex: 'male', energy: 100 });
    expect(compatible(female, herbivoreMale)).toBe(false);
    expect(compatible(female, predatorMale)).toBe(true);

    const evolution = new EvolutionSystem();
    expect(evolution.tryMate(world, female, predatorMale)).toBe(true);
    const child = evolution.tryReproduce(world, female, 100)!;
    expect(child.isPredator).toBe(true);
  });

  it('детёныш держится рядом с родителем и получает долю добычи', () => {
    const world = emptyWorld();
    const mother = spawn(world, 'predator', 0, 0, { energy: 100 });
    const young = world.addOffspring({ parent: mother, genome: mother.genome, x: 3, z: 0, heading: 0, energy: 5 });
    world.commitStep();
    const prey = spawn(world, 'herbivore', 2, 0, { energy: 40 });
    world.rebuildOrganismIndex();

    const behavior = new BehaviorSystem();
    behavior.plan(world, young, 0.25);
    expect(young.action).toBe('following');
    // Мать сыта, но охотится ради голодного детёныша.
    expect(behavior.plan(world, mother, 0.25).prey).toBe(prey);

    expect(new PredationSystem().tryCatch(world, mother, prey)).toBe(true);
    expect(young.life.stomach).toBeGreaterThan(0);
    expect(mother.life.stomach).toBeGreaterThan(0);
  });

  it('готовые особи идут на брачный зов за пределами видимости', () => {
    const world = emptyWorld();
    const female = spawn(world, 'herbivore', 0, 0, { energy: 95 });
    spawn(world, 'herbivore', 40, 0, { sex: 'male', energy: 95 });
    world.rebuildOrganismIndex();
    new BehaviorSystem().plan(world, female, 0.25);
    expect(female.action).toBe('seekingMate');

    world.config.perception.mateCallRadius = 0;
    new BehaviorSystem().plan(world, female, 0.25);
    expect(female.action).not.toBe('seekingMate');
  });

  it('приток извне возвращает сытую пару, только если хищники были в эксперименте', () => {
    const config = createTestConfig({ population: { initial: 4, initialPredators: 2, max: 100 } });
    const engine = SimulationEngine.inst('immigration');
    engine.init(config);
    for (const organism of engine.world.organisms) if (organism.isPredator) organism.alive = false;
    engine.world.commitStep();
    engine.advance(Math.round(config.predation.immigrationInterval / config.dt) + 1);
    const arrived = engine.world.organisms.filter((organism) => organism.isPredator);
    expect(arrived.map((organism) => organism.sex).sort()).toEqual(['female', 'male']);
    expect(engine.world.immigrantsTotal).toBe(2);

    const without = SimulationEngine.inst('no-immigration');
    without.init(createTestConfig({ population: { initial: 4, initialPredators: 0, max: 100 } }));
    without.advance(Math.round(config.predation.immigrationInterval / config.dt) + 1);
    expect(without.world.organisms.some((organism) => organism.isPredator)).toBe(false);
  });

  it('эксперимент с хищниками воспроизводим и точно продолжается из сохранения', () => {
    const config = createTestConfig({ seed: 12, dt: 1 / 30, population: { initial: 60, initialPredators: 8, max: 500 } });
    const continuous = SimulationEngine.inst('predators-continuous');
    continuous.init(config);
    continuous.advance(1800);

    const original = SimulationEngine.inst('predators-original');
    original.init(config);
    original.advance(900);
    const restored = SimulationEngine.inst('predators-restored');
    restored.loadState(JSON.parse(JSON.stringify(original.saveState())));
    restored.advance(900);

    expect(restored.world.toSaved()).toEqual(continuous.world.toSaved());
    expect(restored.statsHistory).toEqual(continuous.statsHistory);
    expect(continuous.world.killsTotal).toBeGreaterThan(0);
    expect(continuous.statsHistory.at(-1)!.predators).toBe(continuous.world.organisms.filter((o) => o.isPredator).length);
  });
});
