import type { SimulationConfig } from '@/shared/protocol';

export const DEFAULT_SIMULATION_CONFIG: Readonly<SimulationConfig> = {
  seed: 1,
  worldWidth: 200,
  worldDepth: 200,
  dt: 1 / 30,
};

export const MIN_SIMULATION_SPEED = 0.25;
export const MAX_SIMULATION_SPEED = 16;

export const SIMULATION_SPEED_OPTIONS: readonly number[] = [0.25, 0.5, 1, 2, 4, 8, 16];
