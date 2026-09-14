import type { World } from '../World';

/**
 * Появление пищи с учетом плодородия зон и сезона; построение индекса для поиска
 */
export class FoodSystem {
  /**
   * Частота попыток: spawnPerSecond * season * maxFertility; каждая попытка принимается
   * с вероятностью fertility / maxFertility, поэтому плотность пищи пропорциональна плодородию
   */
  public spawn(world: World, dt: number, time: number): void {
    const { environment } = world;
    for (const food of world.food) {
      food.energy = Math.min(food.maxEnergy, food.energy + world.config.resources.regrowthPerSecond
        * environment.fertilityAt(food.x, food.z) * environment.seasonMultiplier(time) * dt);
      food.eaten = food.energy < Math.min(1, food.maxEnergy);
    }
    world.foodSpawnAccumulator +=
      world.config.food.spawnPerSecond * environment.seasonMultiplier(time) * environment.maxFertility * dt;

    while (world.foodSpawnAccumulator >= 1) {
      world.foodSpawnAccumulator -= 1;
      world.trySpawnFood();
    }
  }

  public rebuildIndex(world: World): void {
    world.foodIndex.clear();
    for (const food of world.food) {
      if (!food.eaten) {
        world.foodIndex.insert(food);
      }
    }
  }
}
