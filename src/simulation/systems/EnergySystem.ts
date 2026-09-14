import { memoryCapacity } from '../FoodMemory';
import type { Organism } from '../Organism';
import type { Food, World } from '../World';
import { agingOnset } from './EvolutionSystem';

/** Пища усваивается постепенно; голод повреждает здоровье. */
export class EnergySystem {
  /**
   * Помещает в желудок сколько поместится из available
   * @returns съеденное количество
   */
  public static swallow(organism: Organism, available: number, stomachCapacityShare: number): number {
    const space = Math.max(0, organism.capacity * stomachCapacityShare - organism.life.stomach);
    const amount = Math.min(space, available);
    if (amount > 0) organism.life.stomach += amount;
    return Math.max(0, amount);
  }

  public eat(organism: Organism, food: Food, stomachCapacityShare = 0.5): void {
    const amount = EnergySystem.swallow(organism, food.energy, stomachCapacityShare);
    if (amount <= 0) return;
    food.energy -= amount;
    food.eaten = food.energy < 0.01;
    organism.action = 'eating';
    organism.life.reason = 'Ест; пища будет постепенно усвоена';
  }

  public static costPerSecond(world: World, organism: Organism): number {
    const { baseCost, moveCost, visionCost } = world.config.energy;
    const size = organism.bodySize;
    // Долголетие оплачивается постоянным расходом на поддержание тела.
    const maintenance = organism.genome.get('longevity') ** world.config.lifecycle.longevityCost;
    const memory = world.config.perception.memoryCost * memoryCapacity(organism) * organism.genome.get('memorySpan');
    return baseCost * size * maintenance + moveCost * size * organism.currentSpeed ** 2
      + visionCost * organism.genome.get('perception') + memory
      + (organism.life.pregnancy ? world.config.reproduction.pregnancyCostPerSize * size : 0);
  }

  public update(world: World, organism: Organism, dt: number): void {
    const { life } = organism;
    const { physiology } = world.config;
    const digested = Math.min(life.stomach, physiology.digestionPerSecond * organism.bodySize * dt,
      Math.max(0, organism.capacity - organism.energy));
    life.stomach -= digested;
    organism.energy += digested;
    organism.energy -= EnergySystem.costPerSecond(world, organism) * dt;
    if (life.growth < 1 && organism.energyRatio > 0.25) {
      const growth = Math.min(1 - life.growth, 0.6 * dt / physiology.growthDuration,
        Math.max(0, organism.energy - organism.capacity * 0.25) / (physiology.growthCostPerSize * organism.genome.get('size')));
      life.growth += growth;
      organism.energy -= growth * physiology.growthCostPerSize * organism.genome.get('size');
      // Растущее тело тоже должно оставаться снаружи препятствий.
      world.environment.resolve(organism, organism.bodySize, { x: 0, z: 0 });
      organism.x = world.clampX(organism.x);
      organism.z = world.clampZ(organism.z);
    }
    const effort = organism.currentSpeed / organism.genome.get('speed');
    life.stamina = Math.min(1, Math.max(0, life.stamina + (effort < 0.1
      ? physiology.staminaRecovery : -physiology.staminaDrain * effort ** 2) * dt));
    if (organism.energy <= 0) {
      organism.energy = 0;
      life.health = Math.max(0, life.health - physiology.starvationDamage * dt);
    } else if (organism.energyRatio > 0.3) {
      const healing = Math.min(1 - life.health, 0.015 * dt, organism.energy / 10);
      life.health += healing;
      organism.energy -= healing * 10;
    }
    life.recovery = Math.max(0, life.recovery - dt);
    life.attackCooldown = Math.max(0, life.attackCooldown - dt);
    organism.age += dt;
    if (life.health <= 0) {
      organism.alive = false;
      life.deathCause = 'starvation';
    } else if (organism.age > agingOnset(world, organism)) {
      const onset = agingOnset(world, organism);
      const hazard = (organism.age - onset) / Math.max(1, onset * 0.2) ** 2;
      if (world.random.next() < 1 - Math.exp(-hazard * dt)) {
        organism.alive = false;
        life.deathCause = 'age';
      }
    }
  }
}
