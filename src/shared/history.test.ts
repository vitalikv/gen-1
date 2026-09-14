import { describe, expect, it } from 'vitest';
import { downsampleHistory } from './history';
import type { StatsSample } from './snapshot';

function sample(time: number): StatsSample {
  return {
    time,
    population: time * 2,
    food: 0,
    births: 1,
    deaths: 2,
    averageEnergyRatio: 0.5,
    averageGenes: { speed: 1, perception: 1, size: 1, reproductionThreshold: 0.5, exploration: 0.5 },
    season: 1,
    males: 0, females: 0, mature: 0, pregnancies: 0, biomass: 0, starving: 0,
  };
}

describe('downsampleHistory', () => {
  it('возвращает копию короткой истории без изменений', () => {
    const history = [sample(0), sample(1)];
    const result = downsampleHistory(history, 10);

    expect(result).toEqual(history);
    expect(result[0]).not.toBe(history[0]);
  });

  it('сохраняет первую и последнюю точки и сумму рождений и смертей', () => {
    const history = Array.from({ length: 1001 }, (_, i) => sample(i));
    const result = downsampleHistory(history, 101);

    expect(result).toHaveLength(101);
    expect(result[0]!.time).toBe(0);
    expect(result.at(-1)!.time).toBe(1000);
    expect(result.reduce((sum, item) => sum + item.births, 0)).toBe(1001);
    expect(result.reduce((sum, item) => sum + item.deaths, 0)).toBe(2002);
  });
});
