import type { Organism } from '../Organism';
import type { Food, World } from '../World';

/**
 * Энергия, возраст и смерть
 */
export class EnergySystem {
  /** Энергия пищи ограничивается вместимостью организма; излишек теряется */
  public eat(organism: Organism, food: Food): void {
    organism.energy = Math.min(organism.capacity, organism.energy + food.energy);
    organism.action = 'eating';
    food.eaten = true;
  }

  /** Расход за шаг: (c_base * size + c_move * size * speed² + c_vision * radius) * dt */
  public static costPerSecond(world: World, organism: Organism): number {
    const { baseCost, moveCost, visionCost } = world.config.energy;
    const size = organism.genome.get('size');
    const speed = organism.currentSpeed;
    return baseCost * size + moveCost * size * speed * speed + visionCost * organism.genome.get('perception');
  }

  public update(world: World, organism: Organism, dt: number): void {
    organism.energy -= EnergySystem.costPerSecond(world, organism) * dt;
    organism.age += dt;

    if (organism.energy <= 0) {
      organism.energy = 0;
      organism.alive = false;
    } else if (organism.age >= world.config.lifecycle.maxAge) {
      organism.alive = false;
    }
  }
}
