import type { Organism } from '../Organism';
import type { World } from '../World';
import { EnergySystem } from './EnergySystem';

/** Допуск к сумме радиусов тел: жертва успевает сместиться между планированием и попыткой */
const CATCH_REACH_MARGIN = 0.5;
/** Наибольшая доля добычи, которую родитель отдаёт детёнышам поблизости */
const YOUNG_SHARE = 0.5;

/** Поимка травоядных хищниками и передача пищевой ценности жертвы */
export class PredationSystem {
  /** Растущий детёныш хищника, о котором заботится parent */
  public static isDependentYoung(parent: Organism, other: Organism): boolean {
    return other.isPredator && other.alive && other.life.growth < 1
      && (other.parentId === parent.id || other.life.fatherId === parent.id);
  }

  /** catchChance при равных размерах; крупный хищник ловит чаще, мелкий — реже */
  public static catchProbability(world: World, predator: Organism, prey: Organism): number {
    return Math.min(1, world.config.predation.catchChance * 2 * predator.bodySize / (predator.bodySize + prey.bodySize));
  }

  /** Энергия, которую хищник может получить из жертвы: её запасы и тело с учётом эффективности */
  public static preyValue(world: World, prey: Organism): number {
    const { bodyEnergyPerSize, efficiency } = world.config.predation;
    return (prey.energy + prey.life.stomach + bodyEnergyPerSize * prey.bodySize) * efficiency;
  }

  /**
   * Одна попытка поимки; после неё хищник ждёт attackCooldown независимо от исхода
   * @returns true, если жертва поймана и съедена
   */
  public tryCatch(world: World, predator: Organism, prey: Organism): boolean {
    if (!predator.alive || !prey.alive || !predator.isPredator || prey.isPredator || predator.life.attackCooldown > 0) {
      return false;
    }
    if (Math.hypot(predator.x - prey.x, predator.z - prey.z) > predator.bodySize + prey.bodySize + CATCH_REACH_MARGIN
      || !world.environment.hasLineOfSight(predator, prey)) {
      return false;
    }

    predator.life.attackCooldown = world.config.predation.attackCooldown;
    if (world.random.next() >= PredationSystem.catchProbability(world, predator, prey)) {
      predator.life.reason = 'Жертва вырвалась; хищник готовится к новой попытке';
      return false;
    }

    prey.alive = false;
    prey.life.deathCause = 'predation';
    prey.life.reason = 'Пойман хищником';
    world.killsTotal++;
    const { stomachShare, shareRadius } = world.config.predation;
    const value = PredationSystem.preyValue(world, prey);
    // Детёныши рядом получают до половины добычи; несъеденное ими достаётся охотнику.
    let youngBudget = value * YOUNG_SHARE;
    let fed = 0;
    world.organismIndex.forEachInRadius(predator.x, predator.z, shareRadius, (young) => {
      if (youngBudget > 0 && PredationSystem.isDependentYoung(predator, young)) {
        const eaten = EnergySystem.swallow(young, youngBudget, stomachShare);
        youngBudget -= eaten;
        if (eaten > 0) fed++;
      }
    });
    EnergySystem.swallow(predator, value * (1 - YOUNG_SHARE) + youngBudget, stomachShare);
    predator.life.targetPreyId = null;
    predator.action = 'eating';
    predator.life.reason = fed > 0 ? `Поймал жертву и делится с детёнышами: ${fed}` : 'Поймал жертву и ест; пища будет постепенно усвоена';
    return true;
  }
}
