export const GENE_NAMES = [
  'speed', 'perception', 'size', 'reproductionThreshold', 'exploration',
  'longevity', 'hungerThreshold', 'restThreshold', 'matePriority', 'memorySlots', 'memorySpan', 'caution',
] as const;

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
  /** Множитель начала старения; базовый расход растёт как longevity^lifecycle.longevityCost */
  longevity: { label: 'Долголетие', min: 0.5, max: 2, initial: 1, sigma: 0.08 },
  /** Доля энергии, ниже которой организм с почти пустым желудком ищет пищу */
  hungerThreshold: { label: 'Порог голода', min: 0.2, max: 0.95, initial: 0.65, sigma: 0.04 },
  /** Выносливость, при которой организм останавливается на отдых */
  restThreshold: { label: 'Порог усталости', min: 0.05, max: 0.5, initial: 0.15, sigma: 0.03 },
  /** Насколько голодный, но готовый к размножению организм предпочитает партнёра пище */
  matePriority: { label: 'Приоритет партнёра', min: 0, max: 1, initial: 0, sigma: 0.05 },
  /** Число запоминаемых растений после округления; каждое место стоит энергии */
  memorySlots: { label: 'Мест в памяти', min: 0, max: 8, initial: 1, sigma: 0.4 },
  /** Множитель базовой длительности памяти perception.memoryDuration */
  memorySpan: { label: 'Длительность памяти', min: 0.25, max: 4, initial: 1, sigma: 0.15 },
  /** Доля радиуса восприятия, на которой травоядное убегает от замеченного хищника */
  caution: { label: 'Осторожность', min: 0, max: 1, initial: 0.6, sigma: 0.05 },
};

/** Средние стартовые значения хищников, отличные от initial; разброс задаётся теми же sigma */
export const PREDATOR_INITIAL_GENES: Readonly<Partial<GeneValues>> = {
  speed: 10,
  perception: 16,
  memorySlots: 0,
};

/** Фактическое число мест в памяти для значения гена memorySlots */
export function memorySlotCount(value: number): number {
  return Math.round(value);
}

/** Выносливость, до которой отдыхает уставший организм, выше порога усталости */
export const REST_RECOVERY_MARGIN = 0.55;

export function normalizeGene(name: GeneName, value: number): number {
  const { min, max } = GENE_DEFINITIONS[name];
  return (value - min) / (max - min);
}
