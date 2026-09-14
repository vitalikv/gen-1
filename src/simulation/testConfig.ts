import { DEFAULT_SIMULATION_CONFIG } from '@/core/config';
import type { SimulationConfig } from '@/shared/config';

/** Конфигурация для тестов; dt = 0.25 точно представим в двоичном виде */
export function createTestConfig(overrides: Partial<SimulationConfig> = {}): SimulationConfig {
  const config = structuredClone(DEFAULT_SIMULATION_CONFIG);
  config.environment.terrain = 'plain';
  return { ...config, dt: 0.25, ...overrides };
}
