import type { SimulationConfig } from '@/shared/config';

export const DEFAULT_SIMULATION_CONFIG: Readonly<SimulationConfig> = {
  seed: 1,
  dt: 1 / 30,
  world: { width: 200, depth: 200 },
  population: { initial: 80, max: 3000 },
  food: { initial: 400, max: 800, spawnPerSecond: 25, energy: 25 },
  energy: { capacityPerSize: 100, initialShare: 0.5, baseCost: 1, moveCost: 0.02, visionCost: 0.05 },
  lifecycle: { maxAge: 90, minReproductionAge: 8, offspringEnergyShare: 0.3, reproductionCostPerSize: 10 },
  physiology: { digestionPerSecond: 10, stomachCapacityShare: 0.5, growthDuration: 8,
    growthCostPerSize: 20, staminaDrain: 0.06, staminaRecovery: 0.18, starvationDamage: 0.12 },
  reproduction: { gestationDuration: 6, femaleRecovery: 5, maleRecovery: 3, pregnancyCostPerSize: 0.8 },
  resources: { regrowthPerSecond: 0.6 },
  perception: { fieldOfView: Math.PI * 1.5, memoryDuration: 20 },
  mutation: { rate: 0.2, sigmaScale: 1 },
  behavior: { turnRate: 2, minWanderSpeedShare: 0.1 },
  environment: { obstaclePreset: 'none', obstacles: [], zonePreset: 'uniform', baseFertility: 1, zones: [] },
  season: { enabled: false, period: 120, amplitude: 0.6 },
};

export const MIN_SIMULATION_SPEED = 0.25;
export const MAX_SIMULATION_SPEED = 16;

export const SIMULATION_SPEED_OPTIONS: readonly number[] = [0.25, 0.5, 1, 2, 4, 8, 16];
