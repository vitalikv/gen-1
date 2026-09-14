import type { StatsSample } from './snapshot';

/**
 * Прореживает историю до maxSamples точек равномерно по индексу; первая и последняя точки сохраняются
 * Рождения и смерти пропущенных точек суммируются в следующую сохраненную
 */
export function downsampleHistory(history: readonly StatsSample[], maxSamples: number): StatsSample[] {
  if (history.length <= maxSamples || maxSamples < 2) {
    return history.map((sample) => structuredClone(sample));
  }

  const result: StatsSample[] = [];
  const stride = (history.length - 1) / (maxSamples - 1);
  let births = 0;
  let deaths = 0;
  let nextIndex = 0;

  for (let i = 0; i < history.length; i++) {
    const sample = history[i]!;
    births += sample.births;
    deaths += sample.deaths;

    if (i === Math.round(nextIndex * stride)) {
      result.push({ ...structuredClone(sample), births, deaths });
      births = 0;
      deaths = 0;
      nextIndex++;
    }
  }

  return result;
}
