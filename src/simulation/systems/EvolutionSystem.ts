import { Genome } from '../Genome';
import type { Organism } from '../Organism';
import type { World } from '../World';

export function isMature(world: World, organism: Organism): boolean {
  return organism.life.growth >= 1 - 1e-9 && organism.age >= world.config.lifecycle.minReproductionAge;
}

export function isReady(world: World, organism: Organism): boolean {
  return organism.alive && isMature(world, organism) && organism.life.health >= 0.7
    && organism.life.stamina >= 0.35 && organism.life.recovery <= 0 && !organism.life.pregnancy
    && organism.energyRatio >= organism.genome.get('reproductionThreshold');
}

export function compatible(a: Organism, b: Organism): boolean {
  if (a.id === b.id || a.sex === b.sex) return false;
  const parentsA = [a.parentId, a.life.fatherId].filter((id): id is number => id !== null);
  const parentsB = [b.parentId, b.life.fatherId].filter((id): id is number => id !== null);
  return !parentsA.includes(b.id) && !parentsB.includes(a.id)
    && !parentsA.some((id) => parentsB.includes(id));
}

/** Зачатие требует готовых самки и самца; рождение происходит после вынашивания. */
export class EvolutionSystem {
  public tryMate(world: World, a: Organism, b: Organism): boolean {
    if (!isReady(world, a) || !isReady(world, b) || !compatible(a, b)
      || world.populationCount >= world.config.population.max) return false;
    if (Math.hypot(a.x - b.x, a.z - b.z) > a.bodySize + b.bodySize + 0.5
      || !world.environment.hasLineOfSight(a, b)) return false;
    const mother = a.sex === 'female' ? a : b;
    const father = a.sex === 'male' ? a : b;
    const { lifecycle, reproduction, mutation } = world.config;
    const motherCost = lifecycle.reproductionCostPerSize * mother.bodySize;
    const fatherCost = lifecycle.reproductionCostPerSize * father.bodySize;
    const childEnergy = mother.energy * lifecycle.offspringEnergyShare;
    if (mother.energy <= childEnergy + motherCost || father.energy <= fatherCost || childEnergy <= 0) return false;
    const genome = mother.genome.recombine(father.genome, world.random, mutation.rate, mutation.sigmaScale);
    const reserved = Math.min(childEnergy, world.config.energy.capacityPerSize * genome.get('size'));
    mother.energy -= reserved + motherCost;
    father.energy -= fatherCost;
    mother.life.pregnancy = {
      fatherId: father.id, generation: Math.max(mother.generation, father.generation) + 1,
      genes: genome.toValues(), sex: world.random.next() < 0.5 ? 'female' : 'male',
      remaining: reproduction.gestationDuration, energy: reserved,
    };
    father.life.recovery = reproduction.maleRecovery;
    for (const organism of [mother, father]) {
      organism.action = 'mating';
      organism.life.reason = 'Спаривание с готовым партнёром';
      organism.life.mateId = null;
    }
    return true;
  }

  public tryReproduce(world: World, mother: Organism, dt = world.config.dt): Organism | null {
    const pregnancy = mother.life.pregnancy;
    if (!mother.alive || mother.sex !== 'female' || !pregnancy) return null;
    pregnancy.remaining = Math.max(0, pregnancy.remaining - dt);
    if (pregnancy.remaining > 0) return null;
    if (world.populationCount >= world.config.population.max) {
      mother.life.reason = 'Рождение ожидает свободного места: достигнут предел популяции';
      return null;
    }
    const angle = world.random.range(0, Math.PI * 2);
    const child = world.addOffspring({
      parent: mother, fatherId: pregnancy.fatherId, generation: pregnancy.generation,
      sex: pregnancy.sex, genome: new Genome(pregnancy.genes), energy: pregnancy.energy,
      x: mother.x + Math.cos(angle) * mother.bodySize * 2,
      z: mother.z + Math.sin(angle) * mother.bodySize * 2, heading: angle,
    });
    mother.life.pregnancy = null;
    mother.life.recovery = world.config.reproduction.femaleRecovery;
    mother.life.reason = 'Родила детёныша; восстанавливается';
    return child;
  }
}
