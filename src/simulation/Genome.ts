import type { SeededRandom } from '@/core/SeededRandom';
import { GENE_DEFINITIONS, GENE_NAMES, type GeneName, type GeneValues } from '@/shared/genes';

function clampGene(name: GeneName, value: number): number {
  const { min, max } = GENE_DEFINITIONS[name];
  return Math.min(Math.max(value, min), max);
}

/**
 * Наследуемые параметры организма; значения всегда в допустимых диапазонах
 */
export class Genome {
  private readonly _values: GeneValues;

  public constructor(values: GeneValues) {
    const clamped = {} as GeneValues;
    for (const name of GENE_NAMES) {
      clamped[name] = clampGene(name, values[name]);
    }
    this._values = clamped;
  }

  /** Геном стартовой популяции: разброс вокруг initial (или means) с масштабом sigma */
  public static createInitial(random: SeededRandom, means: Readonly<Partial<GeneValues>> = {}): Genome {
    const values = {} as GeneValues;
    for (const name of GENE_NAMES) {
      const { initial, sigma } = GENE_DEFINITIONS[name];
      values[name] = random.normal(means[name] ?? initial, sigma);
    }
    return new Genome(values);
  }

  public get(name: GeneName): number {
    return this._values[name];
  }

  public toValues(): GeneValues {
    return { ...this._values };
  }

  /** Независимое наследование каждого признака от одного из двух родителей. */
  public recombine(other: Genome, random: SeededRandom, rate: number, sigmaScale: number): Genome {
    const values = {} as GeneValues;
    for (const name of GENE_NAMES) {
      values[name] = random.next() < 0.5 ? this.get(name) : other.get(name);
    }
    return new Genome(values).mutate(random, rate, sigmaScale);
  }

  /** gene_child = clamp(gene_parent + Normal(0, sigma), min, max) с вероятностью rate */
  public mutate(random: SeededRandom, rate: number, sigmaScale: number): Genome {
    const values = {} as GeneValues;
    for (const name of GENE_NAMES) {
      const value = this._values[name];
      values[name] =
        random.next() < rate ? value + random.normal(0, GENE_DEFINITIONS[name].sigma * sigmaScale) : value;
    }
    return new Genome(values);
  }
}
