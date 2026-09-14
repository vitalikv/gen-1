import type { GeneValues } from './genes';

export type Sex = 'male' | 'female';
export type DeathCause = 'starvation' | 'age';

export interface Pregnancy {
  fatherId: number;
  generation: number;
  genes: GeneValues;
  sex: Sex;
  remaining: number;
  energy: number;
}

/** Все изменяемые физиологические и поведенческие данные входят в сохранение. */
export interface LifeState {
  sex: Sex;
  fatherId: number | null;
  growth: number;
  health: number;
  stamina: number;
  stomach: number;
  recovery: number;
  pregnancy: Pregnancy | null;
  targetFoodId: number | null;
  mateId: number | null;
  memory: { x: number; z: number; remaining: number } | null;
  reason: string;
  deathCause: DeathCause | null;
}
