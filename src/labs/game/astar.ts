/**
 * Steppable A* on a uniform grid. One call to step() = one node expansion,
 * so the visualizer can animate the open/closed sets.
 * Open set = binary min-heap ordered by (f, h, -insertion) with lazy deletion.
 */

export type Heuristic = 'manhattan' | 'euclidean' | 'octile' | 'dijkstra';

export interface GridSpec {
  cols: number;
  rows: number;
  walls: Uint8Array; // 1 = wall
}

export interface SearchOptions {
  diagonal: boolean;
  heuristic: Heuristic;
  weight: number; // 1 = admissible A*, >1 = weighted A* (faster, may be suboptimal)
}

export type NodeState = 0 | 1 | 2; // 0 unseen, 1 open, 2 closed
export type Status = 'running' | 'found' | 'no-path';

const SQRT2 = Math.SQRT2;

export function heuristicFn(kind: Heuristic): (dx: number, dy: number) => number {
  switch (kind) {
    case 'manhattan':
      return (dx, dy) => dx + dy;
    case 'euclidean':
      return (dx, dy) => Math.hypot(dx, dy);
    case 'octile':
      return (dx, dy) => dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
    case 'dijkstra':
      return () => 0;
  }
}

class MinHeap {
  private items: { idx: number; f: number; h: number; seq: number }[] = [];
  private seq = 0;
  get size() {
    return this.items.length;
  }
  private less(a: number, b: number) {
    const x = this.items[a], y = this.items[b];
    if (x.f !== y.f) return x.f < y.f;
    if (x.h !== y.h) return x.h < y.h; // tie-break toward the goal
    return x.seq > y.seq; // then prefer most recent (LIFO) for straighter exploration
  }
  push(idx: number, f: number, h: number) {
    const it = this.items;
    it.push({ idx, f, h, seq: this.seq++ });
    let i = it.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      [it[i], it[p]] = [it[p], it[i]];
      i = p;
    }
  }
  pop() {
    const it = this.items;
    const top = it[0];
    const last = it.pop()!;
    if (it.length) {
      it[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < it.length && this.less(l, m)) m = l;
        if (r < it.length && this.less(r, m)) m = r;
        if (m === i) break;
        [it[i], it[m]] = [it[m], it[i]];
        i = m;
      }
    }
    return top;
  }
}

export class AStarSearch {
  readonly g: Float64Array;
  readonly h: Float64Array;
  readonly parent: Int32Array;
  readonly state: Uint8Array;
  status: Status = 'running';
  current = -1;
  expanded = 0;
  path: number[] = [];
  private open = new MinHeap();
  private openCount = 0;
  private hFn: (dx: number, dy: number) => number;

  constructor(
    readonly grid: GridSpec,
    readonly start: number,
    readonly goal: number,
    readonly opts: SearchOptions,
  ) {
    const n = grid.cols * grid.rows;
    this.g = new Float64Array(n).fill(Infinity);
    this.h = new Float64Array(n).fill(NaN);
    this.parent = new Int32Array(n).fill(-1);
    this.state = new Uint8Array(n);
    this.hFn = heuristicFn(opts.heuristic);
    this.g[start] = 0;
    this.h[start] = this.heur(start);
    this.state[start] = 1;
    this.openCount = 1;
    this.open.push(start, this.h[start], this.h[start]);
  }

  get openSize() {
    return this.openCount;
  }

  f(i: number) {
    return this.g[i] + this.h[i];
  }

  private heur(i: number) {
    const { cols } = this.grid;
    const dx = Math.abs((i % cols) - (this.goal % cols));
    const dy = Math.abs(Math.floor(i / cols) - Math.floor(this.goal / cols));
    return this.opts.weight * this.hFn(dx, dy);
  }

  /** Expand one node. Returns false once the search has finished. */
  step(): boolean {
    if (this.status !== 'running') return false;
    let cur = -1;
    while (this.open.size) {
      const top = this.open.pop();
      if (this.state[top.idx] === 2) continue; // stale duplicate
      if (top.f > this.f(top.idx) + 1e-9) continue; // outdated priority
      cur = top.idx;
      break;
    }
    if (cur < 0) {
      this.status = 'no-path';
      this.current = -1;
      return false;
    }
    this.current = cur;
    this.state[cur] = 2;
    this.openCount--;
    this.expanded++;

    if (cur === this.goal) {
      this.status = 'found';
      const path = [cur];
      while (this.parent[path[0]] >= 0) path.unshift(this.parent[path[0]]);
      this.path = path;
      return false;
    }

    const { cols, rows, walls } = this.grid;
    const cx = cur % cols, cy = Math.floor(cur / cols);
    const dirs = this.opts.diagonal ? DIRS8 : DIRS4;
    for (const [dx, dy, cost] of dirs) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const ni = ny * cols + nx;
      if (walls[ni] || this.state[ni] === 2) continue;
      // no corner cutting: both orthogonal neighbours must be free for a diagonal move
      if (dx && dy && (walls[cy * cols + nx] || walls[ny * cols + cx])) continue;
      const tentative = this.g[cur] + cost;
      if (tentative < this.g[ni] - 1e-9) {
        this.g[ni] = tentative;
        this.parent[ni] = cur;
        if (Number.isNaN(this.h[ni])) this.h[ni] = this.heur(ni);
        if (this.state[ni] !== 1) {
          this.state[ni] = 1;
          this.openCount++;
        }
        this.open.push(ni, tentative + this.h[ni], this.h[ni]);
      }
    }
    return true;
  }

  runToEnd(maxSteps = 1e6) {
    for (let i = 0; i < maxSteps && this.step(); i++);
  }

  get pathCost(): number {
    return this.status === 'found' ? this.g[this.goal] : NaN;
  }
}

const DIRS4: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
];
const DIRS8: [number, number, number][] = [...DIRS4, [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2]];

// ---------------------------------------------------------------------------
// Grid generators
// ---------------------------------------------------------------------------
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function scatterWalls(cols: number, rows: number, density: number, seed: number, keep: number[]): Uint8Array {
  const r = rng(seed);
  const w = new Uint8Array(cols * rows);
  for (let i = 0; i < w.length; i++) w[i] = r() < density ? 1 : 0;
  for (const k of keep) w[k] = 0;
  return w;
}

/** Recursive-backtracker maze. Works best with odd cols/rows; passages on odd coordinates. */
export function generateMaze(cols: number, rows: number, seed: number): Uint8Array {
  const r = rng(seed);
  const w = new Uint8Array(cols * rows).fill(1);
  const idx = (x: number, y: number) => y * cols + x;
  const stack: [number, number][] = [[1, 1]];
  w[idx(1, 1)] = 0;
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const options = ([[2, 0], [-2, 0], [0, 2], [0, -2]] as const).filter(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      return nx > 0 && ny > 0 && nx < cols - 1 && ny < rows - 1 && w[idx(nx, ny)] === 1;
    });
    if (!options.length) {
      stack.pop();
      continue;
    }
    const [dx, dy] = options[Math.floor(r() * options.length)];
    w[idx(x + dx / 2, y + dy / 2)] = 0;
    w[idx(x + dx, y + dy)] = 0;
    stack.push([x + dx, y + dy]);
  }
  // knock out a few extra walls so there are multiple routes (more interesting for A*)
  for (let k = 0; k < (cols * rows) / 18; k++) {
    const x = 1 + Math.floor(r() * (cols - 2));
    const y = 1 + Math.floor(r() * (rows - 2));
    if ((x + y) % 2 === 1) w[idx(x, y)] = 0;
  }
  return w;
}
