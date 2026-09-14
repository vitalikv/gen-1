import { memorySlotCount } from '@/shared/genes';
import type { FoodMemory } from '@/shared/life';
import type { Organism } from './Organism';
import type { Food, World } from './World';

/** Минимальная ожидаемая доля пищи растения, ради которой стоит возвращаться */
export const REMEMBERED_FOOD_MIN_SHARE = 0.5;
/** Расстояние, добавляемое к пути при сравнении мест: близкие места не получают бесконечного преимущества */
const DISTANCE_BIAS = 10;

export function memoryCapacity(organism: Organism): number {
  return memorySlotCount(organism.genome.get('memorySlots'));
}

export function memoryDuration(world: World, organism: Organism): number {
  return world.config.perception.memoryDuration * organism.genome.get('memorySpan');
}

/** Забывает места, которые организм не видел дольше своей длительности памяти */
export function forgetStale(world: World, organism: Organism): void {
  const { life } = organism;
  const duration = memoryDuration(world, organism);
  life.memory = life.memory.filter((entry) => organism.age - entry.seenAt < duration);
}

export function isRemembered(organism: Organism, food: Food): boolean {
  return organism.life.memory.some((entry) => entry.foodId === food.id);
}

/**
 * Обновляет запись о растении или добавляет новую
 * При заполненной памяти новое растение вытесняет место с наименьшим ожидаемым запасом, если оно не хуже
 */
export function rememberFood(world: World, organism: Organism, food: Food): void {
  const capacity = memoryCapacity(organism);
  const { memory } = organism.life;
  const existing = memory.find((entry) => entry.foodId === food.id);
  if (existing) {
    existing.energy = food.energy;
    existing.seenAt = organism.age;
    return;
  }
  if (capacity <= 0) return;
  const entry: FoodMemory = { foodId: food.id, x: food.x, z: food.z, energy: food.energy,
    maxEnergy: food.maxEnergy, seenAt: organism.age };
  if (memory.length < capacity) {
    memory.push(entry);
    return;
  }
  let worst = 0;
  let worstEstimate = Infinity;
  for (let i = 0; i < memory.length; i++) {
    const estimate = estimateFood(world, organism, memory[i]!);
    if (estimate < worstEstimate) {
      worst = i;
      worstEstimate = estimate;
    }
  }
  if (food.energy >= worstEstimate) memory[worst] = entry;
}

/**
 * Ожидаемый запас пищи: организм знает плодородие места, но не учитывает сезон и других едоков
 */
export function estimateFood(world: World, organism: Organism, entry: FoodMemory): number {
  const elapsed = Math.max(0, organism.age - entry.seenAt);
  const regrowth = world.config.resources.regrowthPerSecond * world.environment.fertilityAt(entry.x, entry.z);
  return Math.min(entry.maxEnergy, entry.energy + regrowth * elapsed);
}

/** Самое выгодное место с учётом ожидаемой пищи и расстояния или null */
export function chooseRemembered(world: World, organism: Organism): FoodMemory | null {
  let best: FoodMemory | null = null;
  let bestScore = 0;
  for (const entry of organism.life.memory) {
    const estimate = estimateFood(world, organism, entry);
    if (estimate < entry.maxEnergy * REMEMBERED_FOOD_MIN_SHARE) continue;
    const score = estimate / (Math.hypot(entry.x - organism.x, entry.z - organism.z) + DISTANCE_BIAS);
    if (score > bestScore) {
      best = entry;
      bestScore = score;
    }
  }
  return best;
}
