/**
 * Конфигурация модели мира. Единицы: длина — условные единицы мира, время — секунды модели
 */
export interface SimulationConfig {
  /** Seed генератора случайных чисел эксперимента */
  seed: number;
  /** Фиксированный шаг модельного времени */
  dt: number;
  world: {
    /** Размер по оси X; мир центрирован в начале координат */
    width: number;
    /** Размер по оси Z */
    depth: number;
  };
  population: {
    initial: number;
    /** Предел численности: при достижении рождения пропускаются */
    max: number;
  };
  food: {
    initial: number;
    max: number;
    spawnPerSecond: number;
    /** Энергия одной единицы пищи */
    energy: number;
  };
  energy: {
    /** Вместимость энергии на единицу размера тела */
    capacityPerSize: number;
    /** Доля вместимости у организмов стартовой популяции */
    initialShare: number;
    /** c_base: расход на жизнь на единицу размера */
    baseCost: number;
    /** c_move: расход на движение, умножается на size * speed² */
    moveCost: number;
    /** c_vision: расход на восприятие на единицу радиуса */
    visionCost: number;
  };
  lifecycle: {
    maxAge: number;
    minReproductionAge: number;
    /** Доля энергии родителя, передаваемая потомку */
    offspringEnergyShare: number;
    /** Стоимость размножения на единицу размера родителя */
    reproductionCostPerSize: number;
  };
  mutation: {
    /** Вероятность мутации каждого гена */
    rate: number;
    /** Множитель к sigma всех генов */
    sigmaScale: number;
  };
  behavior: {
    /** Интенсивность случайных поворотов при исследовании, радиан за √секунду */
    turnRate: number;
    /** Минимальная доля скорости при исследовании */
    minWanderSpeedShare: number;
  };
}

/** Радиус единицы пищи: организм съедает ее при расстоянии size + FOOD_RADIUS */
export const FOOD_RADIUS = 0.5;
