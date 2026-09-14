import type { SimulationConfig } from '@/shared/config';

export const DEFAULT_SIMULATION_CONFIG: Readonly<SimulationConfig> = {
  seed: 1,
  dt: 1 / 30,
  world: { width: 200, depth: 200 },
  population: { initial: 80, max: 3000 },
  food: { initial: 400, max: 800, spawnPerSecond: 25, energy: 25 },
  energy: { capacityPerSize: 100, initialShare: 0.5, baseCost: 1, moveCost: 0.02, visionCost: 0.05 },
  lifecycle: { maxAge: 90, minReproductionAge: 3, offspringEnergyShare: 0.5, reproductionCostPerSize: 10 },
  mutation: { rate: 0.2, sigmaScale: 1 },
  behavior: { turnRate: 2, minWanderSpeedShare: 0.1 },
};

export const MIN_SIMULATION_SPEED = 0.25;
export const MAX_SIMULATION_SPEED = 16;

export const SIMULATION_SPEED_OPTIONS: readonly number[] = [0.25, 0.5, 1, 2, 4, 8, 16];
