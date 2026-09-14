export interface SettlementPoint { x: number; z: number }
export type PersonTask = 'idle' | 'toBush' | 'gathering' | 'toStore';
export interface SettlementState {
  version: 1;
  person: SettlementPoint & {
    id: number; name: string; hunger: number; cargo: number;
    task: PersonTask; target: number | null; path: SettlementPoint[];
    progress: number; reason: string;
  };
  store: SettlementPoint & { berries: number; capacity: number };
  bushes: (SettlementPoint & { id: number; berries: number })[];
  eaten: number;
  initialBerries: number;
}
export const PERSON_RADIUS = 0.7;
export const CARRY_CAPACITY = 8;
