/** Фигура в плоскости XZ; x, z — центр */
export type Shape =
  | { kind: 'circle'; x: number; z: number; radius: number }
  | { kind: 'rect'; x: number; z: number; width: number; depth: number };

/** Зона с собственным плодородием: плотность появления пищи пропорциональна fertility */
export interface ResourceZone {
  shape: Shape;
  fertility: number;
}

export type ObstaclePresetId = 'none' | 'walls' | 'islands' | 'blocks';
export type ZonePresetId = 'uniform' | 'oases' | 'gradient' | 'poles';

interface ObstaclePreset {
  label: string;
  create(width: number, depth: number): Shape[];
}

interface ZonePreset {
  label: string;
  baseFertility: number;
  create(width: number, depth: number): ResourceZone[];
}

function rectFromEdges(minX: number, maxX: number, minZ: number, maxZ: number): Shape {
  return { kind: 'rect', x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, width: maxX - minX, depth: maxZ - minZ };
}

/** Вертикальная стена от края до края с проходом */
function wallWithGap(x: number, thickness: number, depth: number, gapCenter: number, gapSize: number): Shape[] {
  const halfDepth = depth / 2;
  const halfThickness = thickness / 2;
  return [
    rectFromEdges(x - halfThickness, x + halfThickness, -halfDepth, gapCenter - gapSize / 2),
    rectFromEdges(x - halfThickness, x + halfThickness, gapCenter + gapSize / 2, halfDepth),
  ];
}

export const OBSTACLE_PRESETS: Readonly<Record<ObstaclePresetId, ObstaclePreset>> = {
  none: { label: 'Нет', create: () => [] },
  walls: {
    label: 'Стены с проходами',
    create: (width, depth) => [
      ...wallWithGap(-width / 6, 4, depth, -depth / 4, depth * 0.15),
      ...wallWithGap(width / 6, 4, depth, depth / 4, depth * 0.15),
    ],
  },
  islands: {
    label: 'Скалы',
    create: (width, depth) => {
      const scale = Math.min(width, depth);
      return [
        [-0.25, -0.25, 0.08],
        [0.28, -0.18, 0.06],
        [0, 0.05, 0.1],
        [-0.3, 0.3, 0.07],
        [0.3, 0.3, 0.09],
      ].map(([x, z, radius]) => ({ kind: 'circle', x: x! * width, z: z! * depth, radius: radius! * scale }));
    },
  },
  blocks: {
    label: 'Блоки',
    create: (width, depth) => {
      const blocks: Shape[] = [];
      for (const x of [-0.3, 0, 0.3]) {
        for (const z of [-0.3, 0, 0.3]) {
          blocks.push({ kind: 'rect', x: x * width, z: z * depth, width: width * 0.12, depth: depth * 0.12 });
        }
      }
      return blocks;
    },
  },
};

export const ZONE_PRESETS: Readonly<Record<ZonePresetId, ZonePreset>> = {
  uniform: { label: 'Равномерно', baseFertility: 1, create: () => [] },
  oases: {
    label: 'Оазисы',
    baseFertility: 0.25,
    create: (width, depth) => {
      const radius = Math.min(width, depth) * 0.12;
      return [
        [-0.25, -0.25],
        [0.25, -0.25],
        [-0.25, 0.25],
        [0.25, 0.25],
      ].map(([x, z]) => ({ shape: { kind: 'circle', x: x! * width, z: z! * depth, radius }, fertility: 4 }));
    },
  },
  gradient: {
    label: 'Градиент',
    baseFertility: 1,
    create: (width, depth) =>
      [0.25, 0.75, 1.25, 1.75].map((fertility, i) => ({
        shape: rectFromEdges(-width / 2 + (i * width) / 4, -width / 2 + ((i + 1) * width) / 4, -depth / 2, depth / 2),
        fertility,
      })),
  },
  poles: {
    label: 'Два полюса',
    baseFertility: 0.25,
    create: (width, depth) => {
      const radius = Math.min(width, depth) * 0.2;
      return [-0.3, 0.3].map((x) => ({ shape: { kind: 'circle', x: x * width, z: 0, radius }, fertility: 3 }));
    },
  },
};

export function containsPoint(shape: Shape, x: number, z: number): boolean {
  if (shape.kind === 'circle') {
    return (x - shape.x) ** 2 + (z - shape.z) ** 2 <= shape.radius ** 2;
  }
  return Math.abs(x - shape.x) <= shape.width / 2 && Math.abs(z - shape.z) <= shape.depth / 2;
}
