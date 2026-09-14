const UINT32_RANGE = 4294967296;

/**
 * Воспроизводимый генератор случайных чисел (Mulberry32)
 * Состояние — одно 32-битное число: его можно сохранить и восстановить
 */
export class SeededRandom {
  private _state: number;

  public constructor(seed: number) {
    this._state = SeededRandom._toUint32(seed);
  }

  public get state(): number {
    return this._state;
  }

  public set state(value: number) {
    this._state = SeededRandom._toUint32(value);
  }

  /** Число в диапазоне [0, 1) */
  public next(): number {
    this._state = (this._state + 0x6d2b79f5) >>> 0;
    let t = this._state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE;
  }

  /** Число в диапазоне [min, max) */
  public range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Целое число в диапазоне [min, max) */
  public int(min: number, max: number): number {
    return Math.floor(this.range(Math.ceil(min), Math.floor(max)));
  }

  /** Нормальное распределение (преобразование Бокса — Мюллера) */
  public normal(mean = 0, sigma = 1): number {
    const u1 = 1 - this.next();
    const u2 = this.next();
    return mean + sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  private static _toUint32(value: number): number {
    if (!Number.isFinite(value)) {
      throw new Error(`SeededRandom: некорректное значение ${value}`);
    }
    return value >>> 0;
  }
}
