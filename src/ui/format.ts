import { memorySlotCount, type GeneName } from '@/shared/genes';
import type { OrganismAction } from '@/shared/snapshot';

export const ACTION_LABELS: Readonly<Record<OrganismAction, string>> = {
  wandering: 'Исследует',
  seeking: 'Идет к пище',
  eating: 'Ест',
  avoiding: 'Обходит препятствие',
  resting: 'Отдыхает',
  seekingMate: 'Ищет партнёра',
  mating: 'Спаривается',
  remembering: 'Возвращается к пище',
  fleeing: 'Убегает',
  hunting: 'Охотится',
  following: 'Следует за родителем',
};

export function formatGene(name: GeneName, value: number): string {
  switch (name) {
    case 'reproductionThreshold':
    case 'exploration':
    case 'hungerThreshold':
    case 'restThreshold':
    case 'matePriority':
    case 'caution':
      return `${Math.round(value * 100)}%`;
    case 'size':
      return value.toFixed(2);
    case 'longevity':
    case 'memorySpan':
      return `×${value.toFixed(2)}`;
    case 'memorySlots':
      return String(memorySlotCount(value));
    default:
      return value.toFixed(1);
  }
}
