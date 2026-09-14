import { SeededRandom } from '@/core/SeededRandom';
import type { SimulationConfig } from './config';

export type TerrainKind = 'grass' | 'sand' | 'water';

/** Shared, deterministic terrain. Its own RNG never consumes simulation randomness. */
export class Terrain {
  public readonly columns = 192;
  public readonly rows = 192;
  public readonly cells = new Uint8Array(this.columns * this.rows);
  public readonly cellWidth: number;
  public readonly cellDepth: number;
  public readonly enabled: boolean;
  private readonly _width: number;
  private readonly _depth: number;

  public constructor(config: SimulationConfig) {
    this.enabled = config.environment.terrain === 'geographic';
    this._width = config.world.width;
    this._depth = config.world.depth;
    this.cellWidth = this._width / this.columns;
    this.cellDepth = this._depth / this.rows;
    if (!this.enabled) return;
    const random = new SeededRandom(config.seed ^ 0x74657272);
    const phase = random.range(0, Math.PI * 2);
    const lakes = Array.from({ length: 3 }, (_, i) => ({
      x: (i % 2 === 0 ? -1 : 1) * random.range(0.2, 0.32),
      z: (i - 1) * 0.29 + random.range(-0.04, 0.04),
      rx: random.range(0.065, 0.11), rz: random.range(0.07, 0.12),
    }));
    const dunes = Array.from({ length: 5 }, () => ({
      x: random.range(-0.42, 0.42), z: random.range(-0.42, 0.42),
      rx: random.range(0.09, 0.19), rz: random.range(0.08, 0.16),
    }));
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.columns; col++) {
        const x = (col + 0.5) / this.columns - 0.5;
        const z = (row + 0.5) / this.rows - 0.5;
        const riverX = 0.1 * Math.sin(z * 8 + phase) + 0.035 * Math.sin(z * 21 + phase);
        const river = Math.abs(x - riverX) - (0.018 + 0.005 * Math.sin(z * 17 + phase));
        let shore = river;
        for (const lake of lakes) {
          const dx = (x - lake.x) / lake.rx;
          const dz = (z - lake.z) / lake.rz;
          const angle = Math.atan2(dz, dx);
          shore = Math.min(shore, (Math.hypot(dx, dz) - 1 - 0.1 * Math.sin(angle * 5 + phase)) * lake.rx);
        }
        const sand = shore < 0.012 || dunes.some((dune) =>
          ((x - dune.x) / dune.rx) ** 2 + ((z - dune.z) / dune.rz) ** 2
          < 1 + 0.18 * Math.sin(x * 65 + z * 43 + phase));
        this.cells[row * this.columns + col] = shore < 0 ? 2 : sand ? 1 : 0;
      }
    }
  }

  public kindAt(x: number, z: number): TerrainKind {
    const col = Math.max(0, Math.min(this.columns - 1, Math.floor((x + this._width / 2) / this.cellWidth)));
    const row = Math.max(0, Math.min(this.rows - 1, Math.floor((z + this._depth / 2) / this.cellDepth)));
    return (['grass', 'sand', 'water'] as const)[this.cells[row * this.columns + col]!]!;
  }

  public fertilityAt(x: number, z: number): number {
    const kind = this.kindAt(x, z);
    return kind === 'water' ? 0 : kind === 'sand' ? 0.07 : 1;
  }

  /** Circle against nearby water cells, with exact rounded corners. */
  public isBlocked(x: number, z: number, radius: number): boolean {
    if (!this.enabled) return false;
    const minCol = Math.max(0, Math.floor((x - radius + this._width / 2) / this.cellWidth));
    const maxCol = Math.min(this.columns - 1, Math.floor((x + radius + this._width / 2) / this.cellWidth));
    const minRow = Math.max(0, Math.floor((z - radius + this._depth / 2) / this.cellDepth));
    const maxRow = Math.min(this.rows - 1, Math.floor((z + radius + this._depth / 2) / this.cellDepth));
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        if (this.cells[row * this.columns + col] !== 2) continue;
        const dx = Math.max(0, Math.abs(x - ((col + 0.5) * this.cellWidth - this._width / 2)) - this.cellWidth / 2);
        const dz = Math.max(0, Math.abs(z - ((row + 0.5) * this.cellDepth - this._depth / 2)) - this.cellDepth / 2);
        if (dx * dx + dz * dz <= radius * radius) return true;
      }
    }
    return false;
  }

  /** Sweep the entire movement so large steps cannot jump across a river. */
  public stopAtShore(start: { x: number; z: number }, end: { x: number; z: number }, radius: number,
    normal: { x: number; z: number }): boolean {
    if (!this.enabled) return false;
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (Math.min(this.cellWidth, this.cellDepth) * 0.4)));
    for (let step = 1; step <= steps; step++) {
      if (!this.isBlocked(start.x + dx * step / steps, start.z + dz * step / steps, radius)) continue;
      let low = (step - 1) / steps;
      let high = step / steps;
      for (let i = 0; i < 14; i++) {
        const mid = (low + high) / 2;
        if (this.isBlocked(start.x + dx * mid, start.z + dz * mid, radius)) high = mid;
        else low = mid;
      }
      end.x = start.x + dx * low;
      end.z = start.z + dz * low;
      // Estimate an outward shore normal from free directions around contact.
      normal.x = 0;
      normal.z = 0;
      const probe = Math.min(this.cellWidth, this.cellDepth) * 0.5;
      for (let i = 0; i < 16; i++) {
        const nx = Math.cos(i * Math.PI / 8);
        const nz = Math.sin(i * Math.PI / 8);
        if (!this.isBlocked(end.x + nx * probe, end.z + nz * probe, radius)) {
          normal.x += nx;
          normal.z += nz;
        }
      }
      const length = Math.hypot(normal.x, normal.z);
      if (length > 1e-8) { normal.x /= length; normal.z /= length; }
      else {
        const distance = Math.hypot(dx, dz) || 1;
        normal.x = -dx / distance;
        normal.z = -dz / distance;
      }
      return true;
    }
    return false;
  }

  /** Deterministic fallback for births or initial points inside a lake. */
  public nearestLand(x: number, z: number, radius: number, free: (x: number, z: number) => boolean): { x: number; z: number } {
    let best: { x: number; z: number } | null = null;
    let distance = Infinity;
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.columns; col++) {
        const px = (col + 0.5) * this.cellWidth - this._width / 2;
        const pz = (row + 0.5) * this.cellDepth - this._depth / 2;
        const d = (px - x) ** 2 + (pz - z) ** 2;
        if (d < distance && !this.isBlocked(px, pz, radius) && free(px, pz)) {
          best = { x: px, z: pz };
          distance = d;
        }
      }
    }
    if (!best) throw new Error('На карте нет свободного участка для организма такого размера');
    return best;
  }
}
