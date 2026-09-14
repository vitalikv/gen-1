import { describe, expect, it } from 'vitest';
import { SeededRandom } from './SeededRandom';

function sequence(random: SeededRandom, length: number): number[] {
  return Array.from({ length }, () => random.next());
}

describe('SeededRandom', () => {
  it('повторяет последовательность при одинаковом seed', () => {
    expect(sequence(new SeededRandom(42), 100)).toEqual(sequence(new SeededRandom(42), 100));
  });

  it('дает разные последовательности при разных seed', () => {
    expect(sequence(new SeededRandom(1), 10)).not.toEqual(sequence(new SeededRandom(2), 10));
  });

  it('продолжает последовательность из сохраненного состояния', () => {
    const random = new SeededRandom(7);
    sequence(random, 25);
    const saved = random.state;
    const expected = sequence(random, 25);

    const restored = new SeededRandom(0);
    restored.state = saved;

    expect(sequence(restored, 25)).toEqual(expected);
  });

  it('соблюдает границы диапазонов', () => {
    const random = new SeededRandom(3);

    for (let i = 0; i < 10_000; i++) {
      const value = random.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);

      const ranged = random.range(-5, 5);
      expect(ranged).toBeGreaterThanOrEqual(-5);
      expect(ranged).toBeLessThan(5);

      const integer = random.int(0, 3);
      expect([0, 1, 2]).toContain(integer);
    }
  });

  it('генерирует нормальное распределение с заданными параметрами', () => {
    const random = new SeededRandom(11);
    const samples = Array.from({ length: 20_000 }, () => random.normal(10, 2));
    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    const variance = samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples.length;

    expect(mean).toBeCloseTo(10, 1);
    expect(Math.sqrt(variance)).toBeCloseTo(2, 1);
  });

  it('отклоняет некорректный seed', () => {
    expect(() => new SeededRandom(Number.NaN)).toThrow();
  });
});
