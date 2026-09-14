import type { SimulationConfig } from '@/shared/protocol';

export const DEFAULT_SIMULATION_CONFIG: Readonly<SimulationConfig> = {
  seed: 1,
  worldWidth: 200,
  worldDepth: 200,
  dt: 1 / 30,
};
