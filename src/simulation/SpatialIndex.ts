export interface SpatialItem {
  readonly id: number;
  x: number;
  z: number;
}

/**
 * Пространственная сетка для поиска объектов в радиусе
 * Мир центрирован в начале координат; объекты вне границ попадают в крайние ячейки
 */
export class SpatialIndex<T extends SpatialItem> {
  private readonly _cellSize: number;
  private readonly _columns: number;
  private readonly _rows: number;
  private readonly _originX: number;
  private readonly _originZ: number;
  private readonly _cells: T[][];

  public constructor(width: number, depth: number, cellSize: number) {
    this._cellSize = cellSize;
    this._columns = Math.max(1, Math.ceil(width / cellSize));
    this._rows = Math.max(1, Math.ceil(depth / cellSize));
    this._originX = -width / 2;
    this._originZ = -depth / 2;
    this._cells = Array.from({ length: this._columns * this._rows }, () => []);
  }

  public clear(): void {
    for (const cell of this._cells) {
      cell.length = 0;
    }
  }

  public insert(item: T): void {
    const column = this._column(item.x);
    const row = this._row(item.z);
    this._cells[row * this._columns + column]!.push(item);
  }

  /**
   * Ближайший объект в радиусе, удовлетворяющий условию
   * При равном расстоянии выбирается объект с меньшим ID — результат не зависит от порядка ячеек
   */
  public findNearest(x: number, z: number, radius: number, accept: (item: T) => boolean): T | null {
    let nearest: T | null = null;
    let nearestDistanceSq = radius * radius;
    const minColumn = this._column(x - radius);
    const maxColumn = this._column(x + radius);
    const minRow = this._row(z - radius);
    const maxRow = this._row(z + radius);

    for (let row = minRow; row <= maxRow; row++) {
      for (let column = minColumn; column <= maxColumn; column++) {
        for (const item of this._cells[row * this._columns + column]!) {
          const dx = item.x - x;
          const dz = item.z - z;
          const distanceSq = dx * dx + dz * dz;
          const closer = nearest
            ? distanceSq < nearestDistanceSq || (distanceSq === nearestDistanceSq && item.id < nearest.id)
            : distanceSq <= nearestDistanceSq;

          if (closer && accept(item)) {
            nearest = item;
            nearestDistanceSq = distanceSq;
          }
        }
      }
    }

    return nearest;
  }

  public forEachInRadius(x: number, z: number, radius: number, callback: (item: T, distanceSq: number) => void): void {
    const radiusSq = radius * radius;
    const minColumn = this._column(x - radius);
    const maxColumn = this._column(x + radius);
    const minRow = this._row(z - radius);
    const maxRow = this._row(z + radius);

    for (let row = minRow; row <= maxRow; row++) {
      for (let column = minColumn; column <= maxColumn; column++) {
        for (const item of this._cells[row * this._columns + column]!) {
          const dx = item.x - x;
          const dz = item.z - z;
          const distanceSq = dx * dx + dz * dz;
          if (distanceSq <= radiusSq) {
            callback(item, distanceSq);
          }
        }
      }
    }
  }

  private _column(x: number): number {
    const column = Math.floor((x - this._originX) / this._cellSize);
    return Math.min(Math.max(column, 0), this._columns - 1);
  }

  private _row(z: number): number {
    const row = Math.floor((z - this._originZ) / this._cellSize);
    return Math.min(Math.max(row, 0), this._rows - 1);
  }
}
