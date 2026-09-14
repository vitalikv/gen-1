import { describe, expect, it } from 'vitest';
import { FOOD_RADIUS } from '@/shared/config';
import { GENE_DEFINITIONS, GENE_NAMES, type GeneValues } from '@/shared/genes';
import { Genome } from '../Genome';
import { Organism } from '../Organism';
import { createTestConfig } from '../testConfig';
import { World } from '../World';
import { BehaviorSystem } from './BehaviorSystem';
import { EnergySystem } from './EnergySystem';
import { EvolutionSystem } from './EvolutionSystem';
import { FoodSystem } from './FoodSystem';

function initialGenes(overrides: Partial<GeneValues> = {}): Genome {
  const values = {} as GeneValues;
  for (const name of GENE_NAMES) {
    values[name] = GENE_DEFINITIONS[name].initial;
  }
  return new Genome({ ...values, ...overrides });
}

function emptyWorld(overrides: Parameters<typeof createTestConfig>[0] = {}): World {
  return new World(createTestConfig(overrides));
}

function addOrganism(world: World, genome: Genome, x = 0, z = 0, energy = 50): Organism {
  const parent = new Organism({
    id: 0,
    parentId: null,
    generation: -1,
    genome,
    x,
    z,
    heading: 0,
    energy: 1,
    capacityPerSize: world.config.energy.capacityPerSize,
  });
  world.addOffspring({ parent, genome, x, z, heading: 0, energy });
  world.commitStep();
  world.organisms.at(-1)!.life.growth = 1;
  return world.organisms.at(-1)!;
}

describe('BehaviorSystem', () => {
  it('двигается к ближайшей пище в радиусе восприятия и достигает ее', () => {
    const world = emptyWorld();
    const organism = addOrganism(world, initialGenes({ perception: 20, speed: 10, size: 1 }));
    world.food.push({ id: 1, x: 15, z: 0, energy: 25, maxEnergy: 25, eaten: false }, { id: 2, x: -18, z: 0, energy: 25, maxEnergy: 25, eaten: false });

    const behavior = new BehaviorSystem();
    const foodSystem = new FoodSystem();
    let reached = null;
    for (let i = 0; i < 10 && !reached; i++) {
      foodSystem.rebuildIndex(world);
      reached = behavior.update(world, organism, world.config.dt);
    }

    expect(reached?.id).toBe(1);
    expect(organism.action).toBe('seeking');
    expect(Math.hypot(organism.x - 15, organism.z)).toBeCloseTo(1 + FOOD_RADIUS, 6);
  });

  it('не выходит за границы мира при исследовании', () => {
    const world = emptyWorld({ world: { width: 20, depth: 10 } });
    const organism = addOrganism(world, initialGenes({ speed: 20, exploration: 1 }));
    const behavior = new BehaviorSystem();

    for (let i = 0; i < 2000; i++) {
      behavior.update(world, organism, world.config.dt);
      expect(Math.abs(organism.x)).toBeLessThanOrEqual(10);
      expect(Math.abs(organism.z)).toBeLessThanOrEqual(5);
    }
    expect(organism.action).toBe('wandering');
  });
});

describe('EnergySystem', () => {
  it('расходует энергию по формуле модели', () => {
    const world = emptyWorld();
    const organism = addOrganism(world, initialGenes({ size: 2, perception: 10 }), 0, 0, 100);
    organism.currentSpeed = 5;
    const { baseCost, moveCost, visionCost } = world.config.energy;

    new EnergySystem().update(world, organism, 0.25);

    const expectedCost = (baseCost * 2 + moveCost * 2 * 25 + visionCost * 10) * 0.25;
    expect(organism.energy).toBeCloseTo(100 - expectedCost, 10);
    expect(organism.age).toBe(0.25);
  });

  it('помещает пищу в желудок вместо мгновенного получения энергии', () => {
    const world = emptyWorld();
    const organism = addOrganism(world, initialGenes({ size: 1 }), 0, 0, 90);
    const food = { id: 1, x: 0, z: 0, energy: 50, maxEnergy: 50, eaten: false };

    new EnergySystem().eat(organism, food);

    expect(organism.energy).toBe(90);
    expect(organism.life.stomach).toBe(50);
    expect(food.eaten).toBe(true);
  });

  it('голод постепенно повреждает здоровье; старение не является жёстким пределом', () => {
    const world = emptyWorld();
    const energySystem = new EnergySystem();

    const starving = addOrganism(world, initialGenes(), 0, 0, 0.001);
    energySystem.update(world, starving, 0.25);
    expect(starving.alive).toBe(true);
    expect(starving.life.health).toBeLessThan(1);
    for (let i = 0; i < 40; i++) energySystem.update(world, starving, 0.25);
    expect(starving.alive).toBe(false);

    const old = addOrganism(world, initialGenes(), 0, 0, 100);
    old.age = world.config.lifecycle.maxAge;
    energySystem.update(world, old, 0.25);
    expect(old.alive).toBe(true);
  });
});

describe('EvolutionSystem', () => {
  it('не размножается ниже порога энергии, до минимального возраста и при пределе популяции', () => {
    const evolution = new EvolutionSystem();

    const world = emptyWorld();
    const hungry = addOrganism(world, initialGenes({ reproductionThreshold: 0.9 }), 0, 0, 50);
    hungry.age = 10;
    expect(evolution.tryReproduce(world, hungry)).toBeNull();

    const young = addOrganism(world, initialGenes({ reproductionThreshold: 0.3 }), 0, 0, 90);
    expect(evolution.tryReproduce(world, young)).toBeNull();

    const crowded = emptyWorld({ population: { initial: 0, max: 1 } });
    const single = addOrganism(crowded, initialGenes({ reproductionThreshold: 0.3 }), 0, 0, 90);
    single.age = 10;
    expect(evolution.tryReproduce(crowded, single)).toBeNull();
  });
});

describe('World', () => {
  it('удаляет погибших, сохраняет растения и добавляет родившихся в конец', () => {
    const world = World.create(createTestConfig({ population: { initial: 5, max: 100 } }));
    const ids = world.organisms.map((organism) => organism.id);
    world.organisms[1]!.alive = false;
    world.organisms[3]!.alive = false;
    world.food[0]!.eaten = true;
    const foodBefore = world.food.length;

    const child = world.addOffspring({
      parent: world.organisms[0]!,
      genome: world.organisms[0]!.genome,
      x: 0,
      z: 0,
      heading: 0,
      energy: 10,
    });
    world.commitStep();

    expect(world.organisms.map((organism) => organism.id)).toEqual([ids[0], ids[2], ids[4], child.id]);
    expect(world.getOrganism(ids[1]!)).toBeNull();
    expect(world.food.length).toBe(foodBefore);
    expect(world.deathsTotal).toBe(2);
    expect(world.birthsTotal).toBe(1);
  });

  it('не превышает предел пищи', () => {
    const world = World.create(createTestConfig({ food: { initial: 10, max: 10, spawnPerSecond: 100, energy: 1 } }));
    new FoodSystem().spawn(world, 1, 0);

    expect(world.food.length).toBe(10);
  });
});
