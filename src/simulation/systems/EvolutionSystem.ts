import type { Organism } from '../Organism';
import type { World } from '../World';

/**
 * Бесполое размножение и наследование генов с мутациями
 */
export class EvolutionSystem {
  /**
   * Родитель передает потомку часть энергии и оплачивает стоимость размножения:
   * energy_before = energy_after + child_energy + cost
   * @returns потомок или null, если размножение не произошло
   */
  public tryReproduce(world: World, organism: Organism): Organism | null {
    const { lifecycle, mutation, energy, population } = world.config;

    if (
      !organism.alive ||
      organism.age < lifecycle.minReproductionAge ||
      organism.energyRatio < organism.genome.get('reproductionThreshold') ||
      world.populationCount >= population.max
    ) {
      return null;
    }

    const size = organism.genome.get('size');
    const cost = lifecycle.reproductionCostPerSize * size;
    const childGenome = organism.genome.mutate(world.random, mutation.rate, mutation.sigmaScale);
    const childCapacity = energy.capacityPerSize * childGenome.get('size');
    const childEnergy = Math.min(organism.energy * lifecycle.offspringEnergyShare, childCapacity);

    if (organism.energy - childEnergy - cost <= 0) {
      return null;
    }

    organism.energy -= childEnergy + cost;

    const angle = world.random.range(0, Math.PI * 2);
    const offset = size * 2;
    return world.addOffspring({
      parent: organism,
      genome: childGenome,
      x: organism.x + Math.cos(angle) * offset,
      z: organism.z + Math.sin(angle) * offset,
      heading: angle,
      energy: childEnergy,
    });
  }
}
