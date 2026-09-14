import {
  OBSTACLE_PRESETS,
  ZONE_PRESETS,
  type ObstaclePresetId,
  type ResourceZone,
  type Shape,
  type ZonePresetId,
} from './environment';

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
    /** Частота появления пищи при плодородии 1 по всему миру */
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
  physiology: {
    digestionPerSecond: number;
    stomachCapacityShare: number;
    growthDuration: number;
    growthCostPerSize: number;
    staminaDrain: number;
    staminaRecovery: number;
    starvationDamage: number;
  };
  reproduction: {
    gestationDuration: number;
    femaleRecovery: number;
    maleRecovery: number;
    pregnancyCostPerSize: number;
  };
  resources: { regrowthPerSecond: number };
  perception: { fieldOfView: number; memoryDuration: number };
  behavior: {
    /** Интенсивность случайных поворотов при исследовании, радиан за √секунду */
    turnRate: number;
    /** Минимальная доля скорости при исследовании */
    minWanderSpeedShare: number;
  };
  environment: {
    /** Шаблон, по которому построены obstacles; фигуры — источник истины для модели */
    obstaclePreset: ObstaclePresetId;
    obstacles: Shape[];
    zonePreset: ZonePresetId;
    /** Плодородие вне зон */
    baseFertility: number;
    zones: ResourceZone[];
  };
  season: {
    enabled: boolean;
    /** Период сезонного цикла, секунды */
    period: number;
    /** Размах колебаний плодородия: множитель 1 ± amplitude */
    amplitude: number;
  };
}

/** Радиус единицы пищи: организм съедает ее при расстоянии size + FOOD_RADIUS */
export const FOOD_RADIUS = 0.5;

export function applyObstaclePreset(config: SimulationConfig, preset: ObstaclePresetId): void {
  config.environment.obstaclePreset = preset;
  config.environment.obstacles = OBSTACLE_PRESETS[preset].create(config.world.width, config.world.depth);
}

export function applyZonePreset(config: SimulationConfig, preset: ZonePresetId): void {
  config.environment.zonePreset = preset;
  config.environment.baseFertility = ZONE_PRESETS[preset].baseFertility;
  config.environment.zones = ZONE_PRESETS[preset].create(config.world.width, config.world.depth);
}

/**
 * Переносит параметры, которые можно менять во время запуска
 * Остальные (seed, размеры мира, стартовые численности, вместимость энергии, препятствия) применяются при сбросе
 */
export function applyLiveSettings(target: SimulationConfig, source: SimulationConfig): void {
  target.population.max = source.population.max;
  target.food.max = source.food.max;
  target.food.spawnPerSecond = source.food.spawnPerSecond;
  target.food.energy = source.food.energy;
  target.energy.baseCost = source.energy.baseCost;
  target.energy.moveCost = source.energy.moveCost;
  target.energy.visionCost = source.energy.visionCost;
  target.lifecycle = { ...source.lifecycle };
  target.mutation = { ...source.mutation };
  target.behavior = { ...source.behavior };
  target.physiology = { ...source.physiology };
  target.reproduction = { ...source.reproduction };
  target.resources = { ...source.resources };
  target.perception = { ...source.perception };
  target.environment.zonePreset = source.environment.zonePreset;
  target.environment.baseFertility = source.environment.baseFertility;
  target.environment.zones = structuredClone(source.environment.zones);
  target.season = { ...source.season };
}
