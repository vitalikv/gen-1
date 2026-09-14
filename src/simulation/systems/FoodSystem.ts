import type { World } from '../World';

/**
 * Появление пищи и построение индекса для поиска
 */
export class FoodSystem {
  /** Добавляет пищу с постоянной частотой; дробная часть переносится между шагами */
  public spawn(world: World, dt: number): void {
    world.foodSpawnAccumulator += world.config.food.spawnPerSecond * dt;
    while (world.foodSpawnAccumulator >= 1) {
      world.foodSpawnAccumulator -= 1;
      world.spawnFood();
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
