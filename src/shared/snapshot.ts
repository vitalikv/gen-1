import { GENE_NAMES, type GeneName, type GeneValues } from './genes';
import type { LifeState } from './life';

export const ORGANISM_ACTIONS = [
  'wandering', 'seeking', 'eating', 'avoiding', 'resting', 'seekingMate', 'mating', 'remembering', 'fleeing', 'hunting', 'following',
] as const;

export type OrganismAction = (typeof ORGANISM_ACTIONS)[number];

/**
 * Упакованные поля организма в SimulationSnapshot.organisms
 * [x, z, heading, energyRatio, action, sex, bodySize, pregnant, predator, ...гены в порядке GENE_NAMES]
 */
export const ORGANISM_FIELD = {
  x: 0,
  z: 1,
  heading: 2,
  energyRatio: 3,
  action: 4,
  sex: 5,
  bodySize: 6,
  pregnant: 7,
  /** 1 — хищник, 0 — травоядное */
  predator: 8,
} as const;

const ORGANISM_GENE_OFFSET = 9;

export const ORGANISM_STRIDE = ORGANISM_GENE_OFFSET + GENE_NAMES.length;

export function organismGeneField(name: GeneName): number {
  return ORGANISM_GENE_OFFSET + GENE_NAMES.indexOf(name);
}

/** Упакованные поля растения: [x, z, доля оставшейся биомассы] */
export const FOOD_STRIDE = 3;

/** Снимок состояния симуляции для отображения; массивы передаются с передачей владения */
export interface SimulationSnapshot {
  settlement?: import('./settlement').SettlementState;
  /** Номер последнего рассчитанного шага */
  step: number;
  /** Модельное время, секунды */
  time: number;
  running: boolean;
  /** Множитель скорости модельного времени относительно реального */
  speed: number;
  /** Текущий сезонный множитель плодородия */
  season: number;
  /** ID организмов по возрастанию; порядок совпадает с organisms */
  organismIds: Uint32Array;
  organisms: Float32Array;
  food: Float32Array;
}

/** Подробности одного организма для инспектора */
export interface OrganismDetails {
  id: number;
  parentId: number | null;
  generation: number;
  age: number;
  /** Возраст начала старения с учётом гена долголетия */
  agingOnset: number;
  energy: number;
  capacity: number;
  action: OrganismAction;
  genes: GeneValues;
  life: LifeState;
  mature: boolean;
}

/** Точка истории эксперимента */
export interface StatsSample {
  time: number;
  /** Все организмы: травоядные и хищники */
  population: number;
  predators: number;
  food: number;
  /** Рождения, смерти и из них съеденные хищниками с предыдущей точки */
  births: number;
  deaths: number;
  kills: number;
  averageEnergyRatio: number;
  /** Средние гены травоядных */
  averageGenes: GeneValues;
  /** Средние гены хищников; нули, если хищников нет */
  averagePredatorGenes: GeneValues;
  /** Сезонный множитель плодородия */
  season: number;
  males: number;
  females: number;
  mature: number;
  pregnancies: number;
  biomass: number;
  starving: number;
}
