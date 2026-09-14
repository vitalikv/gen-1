import { DEFAULT_SIMULATION_CONFIG } from '@/core/config';
import type { SimulationConfig } from '@/shared/config';

/**
 * Конфигурация для тестов; dt = 0.25 точно представим в двоичном виде
 * Хищников нет, если population не задан явно
 */
export function createTestConfig(
  overrides: Partial<Omit<SimulationConfig, 'population'>> & { population?: Partial<SimulationConfig['population']> } = {},
): SimulationConfig {
  const config = structuredClone(DEFAULT_SIMULATION_CONFIG);
  config.environment.terrain = 'plain';
  config.population.initialPredators = 0;
  return { ...config, dt: 0.25, ...overrides, population: { ...config.population, ...overrides.population } };
}
