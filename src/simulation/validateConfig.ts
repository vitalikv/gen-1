import type { SimulationConfig } from '@/shared/config';
import type { Shape } from '@/shared/environment';

function fail(path: string, value: unknown): never {
  throw new Error(`Некорректная конфигурация: ${path} = ${JSON.stringify(value)}`);
}

function requireNumber(path: string, value: number, { min = 0, integer = false, positive = false } = {}): void {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    (positive && value <= 0) ||
    (integer && !Number.isInteger(value))
  ) {
    fail(path, value);
  }
}

function requireShape(path: string, shape: Shape): void {
  requireNumber(`${path}.x`, shape.x, { min: -Infinity });
  requireNumber(`${path}.z`, shape.z, { min: -Infinity });
  if (shape.kind === 'circle') {
    requireNumber(`${path}.radius`, shape.radius, { positive: true });
  } else if (shape.kind === 'rect') {
    requireNumber(`${path}.width`, shape.width, { positive: true });
    requireNumber(`${path}.depth`, shape.depth, { positive: true });
  } else {
    fail(`${path}.kind`, (shape as { kind: unknown }).kind);
  }
}

/** Проверяет значения конфигурации; бросает ошибку с путем к первому некорректному полю */
export function validateConfig(config: SimulationConfig): void {
  if (config.mode !== undefined && !['evolution', 'settlement'].includes(config.mode)) fail('mode', config.mode);
  requireNumber('seed', config.seed, { min: -Infinity, integer: true });
  requireNumber('dt', config.dt, { positive: true });
  requireNumber('world.width', config.world.width, { positive: true });
  requireNumber('world.depth', config.world.depth, { positive: true });
  requireNumber('population.initial', config.population.initial, { integer: true });
  requireNumber('population.initialPredators', config.population.initialPredators, { integer: true });
  requireNumber('population.max', config.population.max, { integer: true, positive: true });
  requireNumber('food.initial', config.food.initial, { integer: true });
  requireNumber('food.max', config.food.max, { integer: true });
  requireNumber('food.spawnPerSecond', config.food.spawnPerSecond);
  requireNumber('food.energy', config.food.energy);

  for (const key of ['capacityPerSize', 'initialShare', 'baseCost', 'moveCost', 'visionCost'] as const) {
    requireNumber(`energy.${key}`, config.energy[key], { positive: key === 'capacityPerSize' });
  }
  for (const key of ['maxAge', 'minReproductionAge', 'longevityCost', 'offspringEnergyShare', 'reproductionCostPerSize'] as const) {
    requireNumber(`lifecycle.${key}`, config.lifecycle[key]);
  }
  if (config.lifecycle.offspringEnergyShare > 1) {
    fail('lifecycle.offspringEnergyShare', config.lifecycle.offspringEnergyShare);
  }

  requireNumber('mutation.rate', config.mutation.rate);
  if (config.mutation.rate > 1) {
    fail('mutation.rate', config.mutation.rate);
  }
  requireNumber('mutation.sigmaScale', config.mutation.sigmaScale);
  requireNumber('behavior.turnRate', config.behavior.turnRate);
  requireNumber('behavior.minWanderSpeedShare', config.behavior.minWanderSpeedShare);
  for (const key of ['digestionPerSecond', 'stomachCapacityShare', 'growthDuration', 'growthCostPerSize',
    'staminaDrain', 'staminaRecovery', 'starvationDamage'] as const) {
    requireNumber(`physiology.${key}`, config.physiology[key], { positive: true });
  }
  for (const key of ['gestationDuration', 'femaleRecovery', 'maleRecovery', 'pregnancyCostPerSize'] as const) {
    requireNumber(`reproduction.${key}`, config.reproduction[key], { positive: key === 'gestationDuration' });
  }
  requireNumber('resources.regrowthPerSecond', config.resources.regrowthPerSecond);
  requireNumber('predation.stomachShare', config.predation.stomachShare, { positive: true });
  for (const key of ['bodyEnergyPerSize', 'efficiency', 'catchChance', 'attackCooldown', 'fleeDuration', 'scentRadius', 'shareRadius', 'immigrationInterval'] as const) {
    requireNumber(`predation.${key}`, config.predation[key]);
  }
  for (const key of ['efficiency', 'catchChance'] as const) {
    if (config.predation[key] > 1) fail(`predation.${key}`, config.predation[key]);
  }
  requireNumber('perception.memoryDuration', config.perception.memoryDuration);
  requireNumber('perception.memoryCost', config.perception.memoryCost);
  requireNumber('perception.mateCallRadius', config.perception.mateCallRadius);
  requireNumber('perception.fieldOfView', config.perception.fieldOfView, { positive: true });
  if (config.perception.fieldOfView > Math.PI * 2) fail('perception.fieldOfView', config.perception.fieldOfView);

  if (config.environment.terrain !== undefined && !['plain', 'geographic'].includes(config.environment.terrain)) {
    fail('environment.terrain', config.environment.terrain);
  }
  config.environment.obstacles.forEach((shape, i) => requireShape(`environment.obstacles[${i}]`, shape));
  if (config.environment.terrainSettings !== undefined) {
    const settings = config.environment.terrainSettings;
    if (!settings || typeof settings !== 'object') fail('environment.terrainSettings', settings);
    for (const [key, max] of [['lakeCount', 50], ['riverCount', 10], ['lakeSize', 200], ['riverWidth', 50], ['sandPercent', 100]] as const) {
      const path = `environment.terrainSettings.${key}`;
      requireNumber(path, settings[key], { integer: key.endsWith('Count'), positive: key === 'lakeSize' || key === 'riverWidth' });
      if (settings[key] > max) fail(path, settings[key]);
    }
  }
  requireNumber('environment.baseFertility', config.environment.baseFertility);
  config.environment.zones.forEach((zone, i) => {
    requireShape(`environment.zones[${i}].shape`, zone.shape);
    requireNumber(`environment.zones[${i}].fertility`, zone.fertility);
  });

  requireNumber('season.period', config.season.period, { positive: true });
  requireNumber('season.amplitude', config.season.amplitude);
}
