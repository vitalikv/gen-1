export const GENE_NAMES = ['speed', 'perception', 'size', 'reproductionThreshold', 'exploration'] as const;

export type GeneName = (typeof GENE_NAMES)[number];

export type GeneValues = Record<GeneName, number>;

export interface GeneDefinition {
  label: string;
  min: number;
  max: number;
  /** Среднее значение у стартовой популяции */
  initial: number;
  /** Масштаб мутации и разброса стартовой популяции */
  sigma: number;
}

export const GENE_DEFINITIONS: Readonly<Record<GeneName, Readonly<GeneDefinition>>> = {
  /** Максимальная скорость, единиц в секунду */
  speed: { label: 'Скорость', min: 2, max: 20, initial: 8, sigma: 1 },
  /** Радиус поиска пищи */
  perception: { label: 'Восприятие', min: 3, max: 40, initial: 12, sigma: 1.5 },
  /** Радиус тела: вместимость энергии, дальность захвата пищи и расход */
  size: { label: 'Размер', min: 0.5, max: 3, initial: 1, sigma: 0.1 },
  /** Доля вместимости энергии, при которой организм размножается */
  reproductionThreshold: { label: 'Порог размножения', min: 0.3, max: 0.95, initial: 0.7, sigma: 0.04 },
  /** Доля скорости и прямолинейность движения при отсутствии цели */
  exploration: { label: 'Исследование', min: 0, max: 1, initial: 0.5, sigma: 0.05 },
};

export function normalizeGene(name: GeneName, value: number): number {
  const { min, max } = GENE_DEFINITIONS[name];
  return (value - min) / (max - min);
}
