import { describe, expect, it } from 'vitest';
import { SeededRandom } from '@/core/SeededRandom';
import { GENE_DEFINITIONS, GENE_NAMES, type GeneValues } from '@/shared/genes';
import { Genome } from './Genome';

function expectInRange(genome: Genome): void {
  for (const name of GENE_NAMES) {
    const { min, max } = GENE_DEFINITIONS[name];
    expect(genome.get(name)).toBeGreaterThanOrEqual(min);
    expect(genome.get(name)).toBeLessThanOrEqual(max);
  }
}

describe('Genome', () => {
  it('ограничивает значения допустимыми диапазонами', () => {
    const values = {} as GeneValues;
    for (const name of GENE_NAMES) {
      values[name] = 1e9;
    }
    const genome = new Genome(values);

    for (const name of GENE_NAMES) {
      expect(genome.get(name)).toBe(GENE_DEFINITIONS[name].max);
    }
  });

  it('не меняет гены при нулевой вероятности мутации', () => {
    const random = new SeededRandom(1);
    const parent = Genome.createInitial(random);

    expect(parent.mutate(random, 0, 1).toValues()).toEqual(parent.toValues());
  });

  it('держит гены в диапазонах при многократных мутациях', () => {
    const random = new SeededRandom(2);
    let genome = Genome.createInitial(random);

    for (let i = 0; i < 2000; i++) {
      genome = genome.mutate(random, 1, 5);
      expectInRange(genome);
    }
  });

  it('мутирует воспроизводимо при одинаковом seed', () => {
    const run = () => {
      const random = new SeededRandom(3);
      return Genome.createInitial(random).mutate(random, 0.5, 1).toValues();
    };

    expect(run()).toEqual(run());
  });
});
