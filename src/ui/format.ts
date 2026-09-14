import type { GeneName } from '@/shared/genes';
import type { OrganismAction } from '@/shared/snapshot';

export const ACTION_LABELS: Readonly<Record<OrganismAction, string>> = {
  wandering: 'Исследует',
  seeking: 'Идет к пище',
  eating: 'Ест',
};

export function formatGene(name: GeneName, value: number): string {
  switch (name) {
    case 'reproductionThreshold':
    case 'exploration':
      return `${Math.round(value * 100)}%`;
    case 'size':
      return value.toFixed(2);
    default:
      return value.toFixed(1);
  }
}
