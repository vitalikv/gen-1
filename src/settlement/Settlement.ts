import { SeededRandom } from '@/core/SeededRandom';
import type { SimulationConfig } from '@/shared/config';
import { CARRY_CAPACITY, PERSON_RADIUS, type SettlementPoint, type SettlementState } from '@/shared/settlement';
import { Environment } from '@/simulation/Environment';

/** A static navigation graph shared by resource placement and all trips. */
export class Settlement {
  public state: SettlementState;
  public readonly environment: Environment;
  private readonly _points: SettlementPoint[] = [];
  private readonly _edges: number[][] = [];
  private readonly _columns: number;
  private readonly _rows: number;

  public constructor(public readonly config: SimulationConfig) {
    this.environment = new Environment(config);
    this._columns = Math.max(2, Math.min(256, Math.ceil(config.world.width / 2)));
    this._rows = Math.max(2, Math.min(256, Math.ceil(config.world.depth / 2)));
    const dx = config.world.width / this._columns;
    const dz = config.world.depth / this._rows;
    const free: boolean[] = [];
    for (let r = 0; r < this._rows; r++) for (let c = 0; c < this._columns; c++) {
      const p = { x: (c + 0.5) * dx - config.world.width / 2, z: (r + 0.5) * dz - config.world.depth / 2 };
      this._points.push(p);
      this._edges.push([]);
      free.push(!this.environment.isBlocked(p.x, p.z, PERSON_RADIUS)
        && Math.abs(p.x) + PERSON_RADIUS < config.world.width / 2
        && Math.abs(p.z) + PERSON_RADIUS < config.world.depth / 2);
    }
    for (let i = 0; i < this._points.length; i++) {
      if (!free[i]) continue;
      for (const j of [i % this._columns ? i - 1 : -1, i - this._columns]) {
        if (j < 0 || !free[j] || !this.clearSegment(this._points[i]!, this._points[j]!)) continue;
        this._edges[i]!.push(j);
        this._edges[j]!.push(i);
      }
    }
    // Pick the nearest-to-centre component with enough room for this scenario.
    const visited = new Set<number>();
    const candidates = this._points.map((_, i) => i).filter((i) => free[i])
      .sort((a, b) => this._distance(this._points[a]!, { x: 0, z: 0 }) - this._distance(this._points[b]!, { x: 0, z: 0 }));
    let start = -1;
    let component: number[] = [];
    for (const candidate of candidates) {
      if (visited.has(candidate)) continue;
      const queue = [candidate]; visited.add(candidate);
      for (let head = 0; head < queue.length; head++) for (const next of this._edges[queue[head]!]!) {
        if (!visited.has(next)) { visited.add(next); queue.push(next); }
      }
      if (queue.length >= 20) { start = candidate; component = queue; break; }
    }
    if (start < 0) throw new Error('Для поселения не хватает связного участка суши. Уменьшите воду или препятствия.');
    const home = this._points[start]!;
    const local = component.filter((i) => this._distance(home, this._points[i]!) >= 8 && this._distance(home, this._points[i]!) <= 35);
    if (local.length < 3) throw new Error('Недостаточно места для ягодных кустов рядом с поселением. Измените карту.');
    const random = new SeededRandom(config.seed ^ 0x73657474);
    const bushes: SettlementState['bushes'] = [];
    for (let i = 0; i < 3; i++) {
      const index = Math.floor(random.next() * local.length);
      bushes.push({ ...this._points[local.splice(index, 1)[0]!]!, id: i + 1, berries: 40 });
    }
    this.state = {
      version: 1,
      person: { ...home, id: 1, name: 'Дар', hunger: 15, cargo: 0, task: 'idle', target: null, path: [], progress: 0, reason: 'Выбирает куст' },
      store: { ...home, berries: 0, capacity: 40 }, bushes, eaten: 0, initialBerries: 120,
    };
  }

  public clearSegment(a: SettlementPoint, b: SettlementPoint): boolean {
    const steps = Math.max(1, Math.ceil(this._distance(a, b) / 0.3));
    for (let i = 0; i <= steps; i++) {
      // Inflate slightly to make the sampled sweep conservative between probes.
      if (this.environment.isBlocked(a.x + (b.x - a.x) * i / steps, a.z + (b.z - a.z) * i / steps, PERSON_RADIUS + 0.16)) return false;
    }
    return true;
  }

  public route(a: SettlementPoint, b: SettlementPoint): SettlementPoint[] | null {
    const nearest = (p: SettlementPoint) => {
      let best = -1; let distance = Infinity;
      for (let i = 0; i < this._points.length; i++) {
        const d = this._distance(p, this._points[i]!);
        if (this._edges[i]!.length && d < distance && this.clearSegment(p, this._points[i]!)) { distance = d; best = i; }
      }
      return best;
    };
    const start = nearest(a); const end = nearest(b);
    if (start < 0 || end < 0 || !this.clearSegment(this._points[end]!, b)) return null;
    const parents = new Int32Array(this._points.length).fill(-1);
    const queue = [start]; parents[start] = start;
    for (let head = 0; head < queue.length && parents[end] === -1; head++) {
      for (const next of this._edges[queue[head]!]!) if (parents[next] === -1) { parents[next] = queue[head]!; queue.push(next); }
    }
    if (parents[end] === -1) return null;
    const path = [{ ...b }];
    for (let i = end; i !== start; i = parents[i]!) path.push({ ...this._points[i]! });
    path.push({ ...this._points[start]! });
    return path.reverse();
  }

  public tick(dt: number): void {
    const { person: p, store, bushes } = this.state;
    p.hunger = Math.min(100, p.hunger + dt * 0.35);
    const eat = (source: { berries: number }) => {
      if (p.hunger < 40 || source.berries < 1) return false;
      source.berries--; this.state.eaten++; p.hunger = Math.max(0, p.hunger - 25); return true;
    };
    if (p.hunger >= 70 && p.cargo > 0) {
      const carried = { berries: p.cargo }; eat(carried); p.cargo = carried.berries;
    }
    if (this._distance(p, store) < 0.1) eat(store);
    if (p.path.length) {
      let travel = 6 * dt;
      while (p.path.length && travel > 0) {
        const next = p.path[0]!; const d = this._distance(p, next);
        if (d <= travel) { p.x = next.x; p.z = next.z; p.path.shift(); travel -= d; }
        else { p.x += (next.x - p.x) * travel / d; p.z += (next.z - p.z) * travel / d; travel = 0; }
      }
      return;
    }
    if (p.task === 'toStore') {
      const amount = Math.min(p.cargo, store.capacity - store.berries);
      store.berries += amount; p.cargo -= amount; p.task = 'idle';
    }
    if (p.task === 'toBush') { p.task = 'gathering'; p.reason = 'Собирает ягоды'; }
    if (p.task === 'gathering') {
      const bush = bushes.find((b) => b.id === p.target);
      if (bush && bush.berries > 0 && p.cargo < CARRY_CAPACITY) {
        p.progress += dt;
        while (p.progress >= 1 && bush.berries > 0 && p.cargo < CARRY_CAPACITY) { bush.berries--; p.cargo++; p.progress -= 1; }
        if (p.cargo === CARRY_CAPACITY || bush.berries === 0) p.progress = 0;
        return;
      }
      p.progress = 0; p.task = 'idle';
    }
    const go = (target: SettlementPoint, task: 'toBush' | 'toStore', reason: string) => {
      const path = this.route(p, target);
      if (!path) { p.reason = 'Нет проходимого пути'; return false; }
      p.path = path; p.task = task; p.reason = reason; return true;
    };
    if (store.berries >= store.capacity && this._distance(p, store) < 0.1) { p.reason = 'Склад полон — ждёт'; return; }
    if (p.cargo > 0 || (p.hunger >= 40 && store.berries > 0)) {
      if (this._distance(p, store) > 0.1) { go(store, 'toStore', 'Несёт ягоды на склад / идёт поесть'); return; }
      if (p.cargo > 0) { p.task = 'toStore'; p.reason = 'Разгружает ягоды'; return; }
    }
    if (store.berries >= store.capacity) { p.reason = 'Склад полон — ждёт'; return; }
    const available = bushes.filter((b) => b.berries > 0).sort((a, b) => this._distance(p, a) - this._distance(p, b));
    for (const bush of available) {
      if (go(bush, 'toBush', `Идёт к кусту №${bush.id}`)) { p.target = bush.id; return; }
    }
    p.reason = available.length ? 'Нет проходимого пути к ягодам' : 'Кусты истощены — ягод больше нет';
  }

  public restore(value: SettlementState): void {
    const fail = () => { throw new Error('Некорректное сохранение поселения'); };
    if (!value || value.version !== 1 || !value.person || !value.store || !Array.isArray(value.bushes)) fail();
    const number = (v: number, max = Infinity) => { if (!Number.isFinite(v) || v < 0 || v > max) fail(); };
    const point = (p: SettlementPoint) => {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)
        || Math.abs(p.x) + PERSON_RADIUS >= this.config.world.width / 2
        || Math.abs(p.z) + PERSON_RADIUS >= this.config.world.depth / 2
        || this.environment.isBlocked(p.x, p.z, PERSON_RADIUS)) fail();
    };
    const p = value.person;
    point(p); point(value.store); number(p.hunger, 100); number(p.cargo, CARRY_CAPACITY); number(p.progress, 1);
    number(value.store.capacity); number(value.store.berries, value.store.capacity); number(value.eaten); number(value.initialBerries);
    if (typeof p.name !== 'string' || typeof p.reason !== 'string' || !['idle', 'toBush', 'gathering', 'toStore'].includes(p.task) || !Array.isArray(p.path)) fail();
    const ids = new Set<number>();
    for (const bush of value.bushes) { point(bush); number(bush.berries); if (!Number.isInteger(bush.id) || ids.has(bush.id)) fail(); ids.add(bush.id); }
    if (p.target !== null && !ids.has(p.target)) fail();
    let previous: SettlementPoint = p;
    for (const next of p.path) { point(next); if (!this.clearSegment(previous, next)) fail(); previous = next; }
    const destination = p.path.at(-1) ?? p;
    if (p.task === 'idle' && p.path.length) fail();
    if (p.task === 'toStore' && this._distance(destination, value.store) > 0.001) fail();
    if (p.task === 'toBush' || p.task === 'gathering') {
      const bush = value.bushes.find((b) => b.id === p.target);
      if (!bush || this._distance(destination, bush) > 0.001 || (p.task === 'gathering' && p.path.length)) fail();
    }
    if ([p.cargo, value.store.berries, value.eaten, value.initialBerries, ...value.bushes.map((b) => b.berries)].some((v) => !Number.isInteger(v))) fail();
    if (value.bushes.reduce((sum, b) => sum + b.berries, 0) + p.cargo + value.store.berries + value.eaten !== value.initialBerries) fail();
    this.state = structuredClone(value);
  }

  private _distance(a: SettlementPoint, b: SettlementPoint): number { return Math.hypot(a.x - b.x, a.z - b.z); }
}
