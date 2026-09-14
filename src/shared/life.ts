import type { GeneValues } from './genes';

export type Sex = 'male' | 'female';
/** Вид организма: наследуется от матери и не мутирует */
export type Diet = 'herbivore' | 'predator';
export type DeathCause = 'starvation' | 'age' | 'predation';

export interface Pregnancy {
  fatherId: number;
  generation: number;
  genes: GeneValues;
  sex: Sex;
  remaining: number;
  energy: number;
}

/** Запомненное растение: где оно, сколько пищи было при последнем наблюдении и когда */
export interface FoodMemory {
  foodId: number;
  x: number;
  z: number;
  energy: number;
  maxEnergy: number;
  /** Возраст организма в момент наблюдения */
  seenAt: number;
}

/** Все изменяемые физиологические и поведенческие данные входят в сохранение. */
export interface LifeState {
  sex: Sex;
  diet: Diet;
  fatherId: number | null;
  growth: number;
  health: number;
  stamina: number;
  stomach: number;
  recovery: number;
  pregnancy: Pregnancy | null;
  targetFoodId: number | null;
  /** Жертва, которую преследует хищник */
  targetPreyId: number | null;
  /** Время до следующей попытки хищника схватить жертву */
  attackCooldown: number;
  /** Где травоядное последний раз видело хищника и сколько ещё убегает от этого места */
  threat: { x: number; z: number; remaining: number } | null;
  mateId: number | null;
  /** Не больше memorySlotCount мест; устаревшие забываются */
  memory: FoodMemory[];
  reason: string;
  deathCause: DeathCause | null;
}
