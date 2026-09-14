import { GENE_NAMES, type GeneName, type GeneValues } from './genes';

export const ORGANISM_ACTIONS = ['wandering', 'seeking', 'eating', 'avoiding'] as const;

export type OrganismAction = (typeof ORGANISM_ACTIONS)[number];

/**
 * Упакованные поля организма в SimulationSnapshot.organisms
 * [x, z, heading, energyRatio, action, ...гены в порядке GENE_NAMES]
 */
export const ORGANISM_FIELD = {
  x: 0,
  z: 1,
  heading: 2,
  energyRatio: 3,
  action: 4,
} as const;

const ORGANISM_GENE_OFFSET = 5;

export const ORGANISM_STRIDE = ORGANISM_GENE_OFFSET + GENE_NAMES.length;

export function organismGeneField(name: GeneName): number {
  return ORGANISM_GENE_OFFSET + GENE_NAMES.indexOf(name);
}

/** Упакованные поля пищи: [x, z] */
export const FOOD_STRIDE = 2;

/** Снимок состояния симуляции для отображения; массивы передаются с передачей владения */
export interface SimulationSnapshot {
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
  energy: number;
  capacity: number;
  action: OrganismAction;
  genes: GeneValues;
}

/** Точка истории эксперимента */
export interface StatsSample {
  time: number;
  population: number;
  food: number;
  /** Рождения и смерти с предыдущей точки */
  births: number;
  deaths: number;
  averageEnergyRatio: number;
  averageGenes: GeneValues;
  /** Сезонный множитель плодородия */
  season: number;
}
