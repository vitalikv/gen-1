import type { Organism } from '../Organism';
import type { Food, World } from '../World';

/** Пища усваивается постепенно; голод повреждает здоровье. */
export class EnergySystem {
  public eat(organism: Organism, food: Food, stomachCapacityShare = 0.5): void {
    const space = Math.max(0, organism.capacity * stomachCapacityShare - organism.life.stomach);
    const amount = Math.min(space, food.energy);
    if (amount <= 0) return;
    organism.life.stomach += amount;
    food.energy -= amount;
    food.eaten = food.energy < 0.01;
    organism.action = 'eating';
    organism.life.reason = 'Ест; пища будет постепенно усвоена';
  }

  public static costPerSecond(world: World, organism: Organism): number {
    const { baseCost, moveCost, visionCost } = world.config.energy;
    const size = organism.bodySize;
    return baseCost * size + moveCost * size * organism.currentSpeed ** 2
      + visionCost * organism.genome.get('perception')
      + (organism.life.pregnancy ? world.config.reproduction.pregnancyCostPerSize * size : 0);
  }

  public update(world: World, organism: Organism, dt: number): void {
    const { life } = organism;
    const { physiology, lifecycle } = world.config;
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
    organism.age += dt;
    if (life.health <= 0) {
      organism.alive = false;
      life.deathCause = 'starvation';
    } else if (organism.age > lifecycle.maxAge) {
      const hazard = (organism.age - lifecycle.maxAge) / Math.max(1, lifecycle.maxAge * 0.2) ** 2;
      if (world.random.next() < 1 - Math.exp(-hazard * dt)) {
        organism.alive = false;
        life.deathCause = 'age';
      }
    }
  }
}
