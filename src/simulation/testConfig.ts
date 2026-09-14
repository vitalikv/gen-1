import { DEFAULT_SIMULATION_CONFIG } from '@/core/config';
import type { SimulationConfig } from '@/shared/config';

/** Конфигурация для тестов; dt = 0.25 точно представим в двоичном виде */
export function createTestConfig(overrides: Partial<SimulationConfig> = {}): SimulationConfig {
  return { ...structuredClone(DEFAULT_SIMULATION_CONFIG), dt: 0.25, ...overrides };
}
