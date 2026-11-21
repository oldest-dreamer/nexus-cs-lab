import type { Module } from '../../types';

const raw = String.raw;

export const physicsModule: Module = {
  id: 'game-physics',
  title: 'Physics & Collision Detection',
  level: 'Intermediate',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'game-integration-verlet',
      title: 'Integrators: Explicit Euler, Semi-Implicit Euler & Verlet',
      summary: 'How a physics engine turns forces into motion each step, why naive explicit Euler adds energy until springs and orbits explode, and why semi-implicit Euler and Verlet stay stable (and power ropes and cloth).',
      difficulty: 'Intermediate',
      minutes: 24,
      xp: 120,
      labId: 'game-engine',
      labMode: 'physics',
      analogy:
        "Integrating is walking blindfolded along a curved path using only the direction you are facing right now. Explicit Euler takes the step using where you were heading before the turn, so on a circle you drift outward every step and spiral away. Semi-implicit Euler turns first and then steps, which keeps you on the circle. Verlet does not even store your heading: it looks at where you were a step ago and where you are now, and continues the same way.",
      intuition: [
        { title: 'The step', body: "Each fixed step knows position x, velocity v and acceleration a = F/m. The integrator decides the order in which v and x are updated, and that order decides whether energy is conserved, lost or created." },
        { title: 'Explicit Euler: x += v·dt; v += a·dt', body: "Position uses the old velocity. For a spring or an orbit this adds a little energy every step. Tab 1's spring (k = 1, dt = 0.1) grows from energy 0.5 to over 10,000 in 1000 steps." },
        { title: 'Semi-implicit (symplectic) Euler: v += a·dt; x += v·dt', body: "Swap the two lines and energy stays bounded (within about 5% in the same test). It is just as cheap, which is why Box2D, Bullet and most game engines use it." },
        { title: 'Velocity Verlet', body: "x += v·dt + ½a·dt²; compute new a; v += ½(a_old + a_new)·dt. Second-order accurate: the projectile in Tab 1 lands exactly where the closed-form answer says, and the spring's energy stays within 0.25%." },
        { title: 'Position Verlet and constraints', body: "Store current and previous positions: x_new = 2x − x_prev + a·dt². Velocity is implicit, so you can simply move points to satisfy constraints (rope lengths, cloth) and the motion stays consistent. This is the core of Jakobsen's Hitman ragdolls and most cloth sims." },
        { title: 'Everything still needs a fixed step', body: "All integrators are only stable below some dt. Combined with the fixed timestep from Module 1, a symplectic integrator makes physics deterministic and stable on every machine." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Energy after 1000 spring steps (start 0.5)', body: 'Same spring, same dt, different update order. Values from Tab 1.', flow: ['explicit Euler → 10,479 (explodes)', 'semi-implicit Euler → ~0.52 (bounded, ±5%)', 'velocity Verlet → ~0.4997 (±0.25%)', 'choose symplectic for games'] },
        { kind: 'tip', title: 'Damping is a design tool', body: 'Multiply velocity by a factor such as 0.99 per step (or use exp(−c·dt)) to bleed energy deliberately. Never rely on integrator error as damping: it changes with dt.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'integrators_from_scratch.ts',
          explanation: 'Runnable TypeScript: the same spring and projectile integrated with explicit Euler, semi-implicit Euler and velocity Verlet, with energy drift and landing positions asserted, plus a position-Verlet rope whose segment lengths are held by constraint relaxation.',
          code: raw`//   explicit Euler            semi-implicit Euler        velocity Verlet
//   x += v*dt  (old v)        v += a*dt  (first)         x += v*dt + 0.5*a*dt^2
//   v += a*dt                 x += v*dt  (new v)         v += 0.5*(a + a_new)*dt
//   energy:  0.5 -> 10479     0.5 -> ~0.52 (bounded)     0.5 -> ~0.4997
//   ---- spring k = 1, m = 1, dt = 0.1, 1000 steps ----
import assert from 'node:assert/strict';

const k = 1, dt = 0.1, N = 1000;
const energy = (x: number, v: number) => 0.5 * (v * v + k * x * x);

function explicitEuler() { let x = 1, v = 0; for (let i = 0; i < N; i++) { const a = -k * x; x += v * dt; v += a * dt; } return energy(x, v); }
function semiImplicit() {
  let x = 1, v = 0, worst = 0;
  for (let i = 0; i < N; i++) { v += -k * x * dt; x += v * dt; worst = Math.max(worst, Math.abs(energy(x, v) - 0.5)); }
  return worst;
}
function velocityVerlet() {
  let x = 1, v = 0, a = -k * x, worst = 0;
  for (let i = 0; i < N; i++) {
    x += v * dt + 0.5 * a * dt * dt;
    const aNew = -k * x;
    v += 0.5 * (a + aNew) * dt; a = aNew;
    worst = Math.max(worst, Math.abs(energy(x, v) - 0.5));
  }
  return worst;
}
const exploded = explicitEuler();
assert.ok(exploded > 10_000);                    // energy created from nothing
assert.ok(semiImplicit() < 0.03);                // bounded: within ~5% of 0.5
assert.ok(velocityVerlet() < 0.0013);            // within ~0.25%

// projectile: up at 20 m/s, g = -10, 2 s in 20 steps; exact y(2) = 20*2 - 5*4 = 20
const g = -10, h = 0.1;
let y1 = 0, v1 = 20, y2 = 0, v2 = 20, y3 = 0, v3 = 20;
for (let i = 0; i < 20; i++) {
  y1 += v1 * h; v1 += g * h;                     // explicit
  v2 += g * h; y2 += v2 * h;                     // semi-implicit
  y3 += v3 * h + 0.5 * g * h * h; v3 += g * h;   // velocity Verlet (exact for constant a)
}
assert.deepEqual([Math.round(y1 * 1e9) / 1e9, Math.round(y2 * 1e9) / 1e9, Math.round(y3 * 1e9) / 1e9], [21, 19, 20]);

// position Verlet rope: 10 points, top pinned, segment length 10, gravity
const P = 10, SEG = 10;
const px = new Float64Array(P), py = new Float64Array(P), ox = new Float64Array(P), oy = new Float64Array(P);
for (let i = 0; i < P; i++) { px[i] = ox[i] = i * SEG; py[i] = oy[i] = 0; }   // starts horizontal
for (let step = 0; step < 600; step++) {
  for (let i = 1; i < P; i++) {
    const nx = 2 * px[i] - ox[i], ny = 2 * py[i] - oy[i] + 500 * (1 / 60) ** 2;
    ox[i] = px[i]; oy[i] = py[i]; px[i] = nx; py[i] = ny;
  }
  for (let it = 0; it < 20; it++) {
    for (let i = 0; i < P - 1; i++) {
      const dx = px[i + 1] - px[i], dy = py[i + 1] - py[i], d = Math.hypot(dx, dy), diff = (d - SEG) / d;
      const wA = i === 0 ? 0 : 0.5, wB = i === 0 ? 1 : 0.5;          // the pinned point never moves
      px[i] += dx * diff * wA; py[i] += dy * diff * wA;
      px[i + 1] -= dx * diff * wB; py[i + 1] -= dy * diff * wB;
    }
  }
}
let maxStretch = 0;
for (let i = 0; i < P - 1; i++) maxStretch = Math.max(maxStretch, Math.abs(Math.hypot(px[i + 1] - px[i], py[i + 1] - py[i]) - SEG) / SEG);
assert.ok(maxStretch < 0.01 && px[0] === 0 && py[0] === 0);       // lengths held within 1%, pin intact
assert.ok(py[P - 1] > 80);                                         // the rope has swung down to hang
console.log('explicit Euler energy:', exploded.toFixed(0), '| rope tip y:', py[P - 1].toFixed(1), '| max stretch', (maxStretch * 100).toFixed(3) + '%');`,
        },
        production: {
          language: 'ts',
          filename: 'verlet_cloth.ts',
          explanation: 'Production engine pattern: a position-Verlet cloth stored in Float32Arrays (current and previous positions), constraints as flat index/rest-length arrays, a fixed number of relaxation iterations per step, velocity damping via the previous-position trick and pinned points via inverse mass 0. No allocations inside step().',
          code: raw`export class VerletCloth {
  readonly x: Float32Array; readonly y: Float32Array;     // current positions
  readonly px: Float32Array; readonly py: Float32Array;   // previous positions (velocity is implicit)
  readonly invMass: Float32Array;                         // 0 = pinned
  private ca: Uint32Array; private cb: Uint32Array; private rest: Float32Array;
  private constraintCount = 0;

  constructor(readonly cols: number, readonly rows: number, spacing: number, maxConstraints = cols * rows * 2) {
    const n = cols * rows;
    this.x = new Float32Array(n); this.y = new Float32Array(n);
    this.px = new Float32Array(n); this.py = new Float32Array(n);
    this.invMass = new Float32Array(n).fill(1);
    this.ca = new Uint32Array(maxConstraints); this.cb = new Uint32Array(maxConstraints); this.rest = new Float32Array(maxConstraints);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      this.x[i] = this.px[i] = c * spacing; this.y[i] = this.py[i] = r * spacing;
      if (c > 0) this.link(i - 1, i, spacing);
      if (r > 0) this.link(i - cols, i, spacing);
    }
    for (let c = 0; c < cols; c += 4) this.invMass[c] = 0;    // pin every 4th top point
  }

  private link(a: number, b: number, len: number) {
    const k = this.constraintCount++;
    this.ca[k] = a; this.cb[k] = b; this.rest[k] = len;
  }

  step(dt: number, gx: number, gy: number, damping = 0.99, iterations = 8) {
    const { x, y, px, py, invMass } = this;
    const dt2 = dt * dt;
    for (let i = 0; i < x.length; i++) {
      if (invMass[i] === 0) continue;
      const vx = (x[i] - px[i]) * damping, vy = (y[i] - py[i]) * damping;   // implicit velocity
      px[i] = x[i]; py[i] = y[i];
      x[i] += vx + gx * dt2; y[i] += vy + gy * dt2;
    }
    for (let it = 0; it < iterations; it++) {
      for (let k = 0; k < this.constraintCount; k++) {
        const a = this.ca[k], b = this.cb[k];
        const dx = x[b] - x[a], dy = y[b] - y[a];
        const d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
        const wSum = invMass[a] + invMass[b];
        if (wSum === 0) continue;
        const s = (d - this.rest[k]) / (d * wSum);
        x[a] += dx * s * invMass[a]; y[a] += dy * s * invMass[a];
        x[b] -= dx * s * invMass[b]; y[b] -= dy * s * invMass[b];
      }
    }
  }
}`,
        },
        bug: {
          explanation:
            'Updating position with the old velocity before applying acceleration is explicit Euler: every step adds a little energy, so springs oscillate harder and harder, orbits spiral outward and stacked boxes jitter apart. Swapping the two lines (velocity first, then position with the new velocity) gives semi-implicit Euler, which is equally cheap and keeps energy bounded.',
          buggy: {
            language: 'ts',
            filename: 'body.ts',
            code: raw`// ❌ Explicit Euler: the spring gains energy every step and eventually explodes
function integrate(b: Body, dt: number) {
  const ax = b.fx / b.mass, ay = b.fy / b.mass;
  b.x += b.vx * dt; b.y += b.vy * dt;     // uses last step's velocity
  b.vx += ax * dt;  b.vy += ay * dt;
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'body.ts',
            code: raw`// ✅ Semi-implicit (symplectic) Euler: velocity first, then position
function integrate(b: Body, dt: number) {
  const ax = b.fx / b.mass, ay = b.fy / b.mass;
  b.vx += ax * dt;  b.vy += ay * dt;
  b.x += b.vx * dt; b.y += b.vy * dt;     // uses the freshly updated velocity
}`,
          },
        },
      },
      takeaways: [
        'Explicit Euler creates energy: springs and orbits explode over time.',
        'Semi-implicit Euler (v first, then x) is just as cheap and keeps energy bounded; it is the game-engine default.',
        'Velocity Verlet is second-order accurate; position Verlet makes constraints (ropes, cloth, ragdolls) simple.',
        'Use deliberate damping, never integrator error, and always integrate on a fixed timestep.',
        'Practice drill: rerun Tab 1\'s spring with dt = 2.1 and watch semi-implicit Euler and Verlet blow up as well: for this spring their stability limit is dt < 2/√k = 2, so even symplectic methods need a small enough step.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'game-broadphase-quadtree',
      title: 'Broad Phase: Uniform Grids & Quadtrees vs O(N²)',
      summary: 'Testing every object against every other is N(N−1)/2 checks. Broad-phase structures (uniform grids, spatial hashes, quadtrees) find the few pairs that might touch, producing exactly the same collisions with a fraction of the work.',
      difficulty: 'Intermediate',
      minutes: 24,
      xp: 130,
      labId: 'game-engine',
      labMode: 'physics',
      analogy:
        "Finding who is standing next to whom at a stadium by asking every person about every other person takes forever. Instead, everyone looks at their seat section, and you only compare people in the same or neighbouring sections. A uniform grid is fixed sections; a quadtree splits busy sections into four smaller ones, so crowded areas get finer sections and empty areas stay coarse.",
      intuition: [
        { title: 'Broad phase vs narrow phase', body: "The broad phase cheaply finds candidate pairs whose bounding boxes might overlap. The narrow phase (next chapter) runs exact tests only on those candidates. A good broad phase changes the cost from O(N²) to roughly O(N + pairs)." },
        { title: 'Brute force', body: "400 objects means 400·399/2 = 79,800 box tests per step. At 2,000 objects it is almost 2 million: quadratic growth is what kills frame rate when a level gets busy." },
        { title: 'Uniform grid / spatial hash', body: "Divide space into cells about the size of a typical object. Insert each box into every cell it overlaps, then test only pairs that share a cell. Deduplicate pairs that share more than one cell. Excellent for many similar-sized objects; a hash map of cells handles unbounded worlds." },
        { title: 'Quadtree', body: "A node holds up to a capacity of objects; when it overflows, it splits into four children. Objects that straddle a split line stay in the parent. Query by walking only the nodes whose bounds overlap the query box. Adapts to clustered scenes and very different object sizes." },
        { title: 'Correctness is parity', body: "A broad phase must never miss a pair that brute force finds. Tab 1 checks that the grid and the quadtree produce exactly the same pair set as the O(N²) loop while doing far fewer tests." },
        { title: 'Other options', body: "Sort-and-sweep (sort by min x, sweep for overlaps) exploits frame-to-frame coherence; dynamic AABB trees (Box2D, Bullet) handle mixed sizes and fast incremental updates." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Collision pipeline', body: 'Each stage shrinks the work for the next one.', flow: ['all bodies (N)', 'broad phase: grid / quadtree / AABB tree → candidate pairs', 'narrow phase: exact shape tests → contacts', 'solver: resolve contacts and constraints'] },
        { kind: 'tip', title: 'Pick the cell size', body: 'Start with a cell size about twice the typical object size. Too small and big objects occupy many cells; too large and each cell holds too many objects.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'broadphase_from_scratch.ts',
          explanation: 'Runnable TypeScript: 400 seeded random boxes tested with brute force, a uniform grid and a quadtree. Assertions prove all three produce the identical set of overlapping pairs, and that the grid and quadtree run far fewer box tests than the 79,800 of the O(N²) loop.',
          code: raw`//  BRUTE FORCE: N(N-1)/2 = 79,800 tests      UNIFORM GRID (cell 50)          QUADTREE (split at capacity)
//                                             +----+----+----+                +---------+----+----+
//   for i, for j > i: overlap(i, j)?          | a  | ab | b  |  test only     |         | .. | .  |
//                                             +----+----+----+  pairs that    |   .     +----+----+
//                                             |    | c  |    |  share a cell  |         | .  |....|
//   same pair set from all three  ---->  parity checked below
import assert from 'node:assert/strict';

type Box = { x: number; y: number; w: number; h: number };
function mulberry32(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rnd = mulberry32(42), WORLD = 1000, N = 400;
const boxes: Box[] = Array.from({ length: N }, () => ({ x: rnd() * (WORLD - 30), y: rnd() * (WORLD - 30), w: 5 + rnd() * 25, h: 5 + rnd() * 25 }));
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const key = (i: number, j: number) => (i < j ? i * N + j : j * N + i);

// 1) brute force
let bruteTests = 0; const brute = new Set<number>();
for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { bruteTests++; if (overlap(boxes[i], boxes[j])) brute.add(key(i, j)); }

// 2) uniform grid: insert into every overlapped cell, dedupe pairs
const CELL = 50, cells = new Map<number, number[]>();
boxes.forEach((b, i) => {
  for (let cy = Math.floor(b.y / CELL); cy <= Math.floor((b.y + b.h) / CELL); cy++)
    for (let cx = Math.floor(b.x / CELL); cx <= Math.floor((b.x + b.w) / CELL); cx++) {
      const c = cy * 1000 + cx; const list = cells.get(c); if (list) list.push(i); else cells.set(c, [i]);
    }
});
let gridTests = 0; const grid = new Set<number>(), tested = new Set<number>();
for (const list of cells.values()) for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
  const k = key(list[a], list[b]); if (tested.has(k)) continue; tested.add(k);
  gridTests++; if (overlap(boxes[list[a]], boxes[list[b]])) grid.add(k);
}

// 3) quadtree: straddlers stay in the parent
class QuadTree {
  items: number[] = []; kids: QuadTree[] | null = null;
  constructor(readonly b: Box, readonly depth = 0) {}
  insert(i: number): void {
    if (this.kids) { const k = this.childFor(boxes[i]); if (k) return k.insert(i); }
    this.items.push(i);
    if (!this.kids && this.items.length > 8 && this.depth < 6) {
      const { x, y, w, h } = this.b, hw = w / 2, hh = h / 2;
      this.kids = [new QuadTree({ x, y, w: hw, h: hh }, this.depth + 1), new QuadTree({ x: x + hw, y, w: hw, h: hh }, this.depth + 1),
        new QuadTree({ x, y: y + hh, w: hw, h: hh }, this.depth + 1), new QuadTree({ x: x + hw, y: y + hh, w: hw, h: hh }, this.depth + 1)];
      const old = this.items; this.items = []; for (const j of old) this.insert(j);
    }
  }
  childFor(o: Box) { return this.kids!.find((k) => o.x >= k.b.x && o.x + o.w <= k.b.x + k.b.w && o.y >= k.b.y && o.y + o.h <= k.b.y + k.b.h); }
  query(q: Box, out: number[]) {
    if (!overlap(q, this.b) && this.depth > 0) return;
    out.push(...this.items);
    if (this.kids) for (const k of this.kids) k.query(q, out);
  }
}
const tree = new QuadTree({ x: 0, y: 0, w: WORLD, h: WORLD });
for (let i = 0; i < N; i++) tree.insert(i);
let quadTests = 0; const quad = new Set<number>();
for (let i = 0; i < N; i++) {
  const cand: number[] = []; tree.query(boxes[i], cand);
  for (const j of cand) if (j > i) { quadTests++; if (overlap(boxes[i], boxes[j])) quad.add(key(i, j)); }
}

const sorted = (s: Set<number>) => [...s].sort((a, b) => a - b);
assert.equal(bruteTests, 79_800);
assert.ok(brute.size > 0);
assert.deepEqual(sorted(grid), sorted(brute));          // parity: no pair missed, none invented
assert.deepEqual(sorted(quad), sorted(brute));
assert.ok(gridTests * 20 < bruteTests && quadTests * 5 < bruteTests);
console.log('pairs', brute.size, '| tests brute', bruteTests, 'grid', gridTests, 'quadtree', quadTests);`,
        },
        production: {
          language: 'ts',
          filename: 'spatial_grid.ts',
          explanation: 'Production engine pattern: an allocation-free uniform grid rebuilt every step with a counting sort into flat Int32Arrays (cell start offsets plus packed entity lists), entities stored as SoA AABB arrays, and pair deduplication by only reporting a pair from the cell containing the overlap\'s top-left corner.',
          code: raw`// Rebuilt every fixed step. All buffers are preallocated; nothing is allocated per frame.
export class SpatialGrid {
  private cellStart: Int32Array; private cellCount: Int32Array; private items: Int32Array;
  private cellOf: Int32Array;                         // flat list of (entity, cell) memberships
  constructor(readonly cols: number, readonly rows: number, readonly cell: number, maxMemberships: number) {
    this.cellStart = new Int32Array(cols * rows + 1);
    this.cellCount = new Int32Array(cols * rows);
    this.items = new Int32Array(maxMemberships);
    this.cellOf = new Int32Array(maxMemberships * 2);
  }

  private clampCol(v: number) { return Math.min(this.cols - 1, Math.max(0, Math.floor(v / this.cell))); }
  private clampRow(v: number) { return Math.min(this.rows - 1, Math.max(0, Math.floor(v / this.cell))); }

  build(n: number, minX: Float32Array, minY: Float32Array, maxX: Float32Array, maxY: Float32Array) {
    this.cellCount.fill(0);
    let m = 0;
    for (let e = 0; e < n; e++) {                     // pass 1: count memberships per cell
      for (let r = this.clampRow(minY[e]); r <= this.clampRow(maxY[e]); r++)
        for (let c = this.clampCol(minX[e]); c <= this.clampCol(maxX[e]); c++) {
          const cell = r * this.cols + c;
          this.cellCount[cell]++; this.cellOf[m * 2] = e; this.cellOf[m * 2 + 1] = cell; m++;
        }
    }
    let sum = 0;                                      // pass 2: prefix sum -> start offsets
    for (let i = 0; i < this.cellCount.length; i++) { this.cellStart[i] = sum; sum += this.cellCount[i]; }
    this.cellStart[this.cellCount.length] = sum;
    this.cellCount.fill(0);
    for (let k = 0; k < m; k++) {                     // pass 3: scatter entities into their cells
      const cell = this.cellOf[k * 2 + 1];
      this.items[this.cellStart[cell] + this.cellCount[cell]++] = this.cellOf[k * 2];
    }
  }

  // Calls onPair(a, b) exactly once per overlapping pair
  forEachPair(minX: Float32Array, minY: Float32Array, maxX: Float32Array, maxY: Float32Array, onPair: (a: number, b: number) => void) {
    for (let cell = 0; cell < this.cellCount.length; cell++) {
      const start = this.cellStart[cell], end = this.cellStart[cell + 1];
      const col = cell % this.cols, row = (cell / this.cols) | 0;
      for (let i = start; i < end; i++) for (let j = i + 1; j < end; j++) {
        const a = this.items[i], b = this.items[j];
        if (maxX[a] <= minX[b] || maxX[b] <= minX[a] || maxY[a] <= minY[b] || maxY[b] <= minY[a]) continue;
        // dedupe: report only in the cell holding the top-left corner of the intersection
        const ox = Math.max(minX[a], minX[b]), oy = Math.max(minY[a], minY[b]);
        if (this.clampCol(ox) === col && this.clampRow(oy) === row) onPair(a, b);
      }
    }
  }
}`,
        },
        bug: {
          explanation:
            'Inserting each object only into the cell that contains its centre is fast but wrong: two boxes that overlap across a cell border have centres in different cells and are never compared, so they pass through each other. Insert each box into every cell its bounds overlap (and deduplicate pairs), or query the neighbouring cells as well.',
          buggy: {
            language: 'ts',
            filename: 'grid.ts',
            code: raw`// ❌ Centre-only insertion: overlapping boxes on either side of a cell border are never tested
for (const e of entities) {
  const cx = Math.floor((e.x + e.w / 2) / CELL), cy = Math.floor((e.y + e.h / 2) / CELL);
  cellAt(cx, cy).push(e);
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'grid.ts',
            code: raw`// ✅ Insert into every overlapped cell; dedupe pairs when testing
for (const e of entities) {
  for (let cy = Math.floor(e.y / CELL); cy <= Math.floor((e.y + e.h) / CELL); cy++)
    for (let cx = Math.floor(e.x / CELL); cx <= Math.floor((e.x + e.w) / CELL); cx++)
      cellAt(cx, cy).push(e);
}`,
          },
        },
      },
      takeaways: [
        'Brute-force collision is N(N−1)/2 tests; it collapses as object counts grow.',
        'A broad phase finds candidate pairs: uniform grids for similar sizes, quadtrees or AABB trees for clustered or mixed sizes.',
        'Insert objects into every overlapped cell and deduplicate pairs; straddlers stay in quadtree parents.',
        'Verify a broad phase by pair-set parity against brute force.',
        'Practice drill: set N = 2,000 and WORLD = 2,236 in Tab 1 (same density) and compare test counts: brute force grows 25× to 1,999,000 while the grid grows only about 5× (561 → ~3,000).',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'game-narrowphase-aabb-sat',
      title: 'Narrow Phase: AABB, Circles & the Separating Axis Theorem',
      summary: 'Exact collision tests for candidate pairs: AABB overlap and minimum translation vector, circle tests, and the Separating Axis Theorem for rotated convex polygons, including the depth and direction needed to push objects apart.',
      difficulty: 'Advanced',
      minutes: 26,
      xp: 140,
      labId: 'game-engine',
      labMode: 'physics',
      analogy:
        "Shine a torch on two cardboard shapes from every direction that matters and look at their shadows on the wall. If you can find even one direction where the shadows do not overlap, the shapes are not touching: there is a gap you could slide paper through. That is the Separating Axis Theorem. If every shadow overlaps, the smallest shadow overlap tells you the shortest push that separates them.",
      intuition: [
        { title: 'AABB test', body: "Axis-aligned boxes overlap only if their intervals overlap on both x and y: `a.min.x < b.max.x && b.min.x < a.max.x` and the same for y. Four comparisons, no square roots." },
        { title: 'Minimum translation vector (MTV)', body: "When boxes overlap, compute the overlap on each axis and push along the axis with the smallest overlap, in the direction away from the other box. This is how platformers stop the player at walls and floors." },
        { title: 'Circles', body: "Two circles overlap if the squared distance between centres is less than (r₁ + r₂)². The MTV points along the line between centres with depth r₁ + r₂ − d." },
        { title: 'Separating Axis Theorem', body: "Two convex shapes are disjoint if and only if some axis separates their projections. For polygons, the only candidate axes are the edge normals of both shapes. Project every vertex onto each normal, compare the intervals, and stop early at the first gap." },
        { title: 'Why not just AABBs?', body: "The AABB of a rotated box is bigger than the box. Tab 1 shows two 45°-rotated squares whose AABBs overlap while SAT proves there is a gap along the diagonal axis: AABBs alone give false collisions." },
        { title: 'Normalise the axes', body: "Projection depths are only real distances if the axis is unit length. Unnormalised normals still give a correct yes/no answer but a wrong MTV depth, causing push-outs that are too strong or too weak." },
      ],
      callouts: [
        { kind: 'architecture', title: 'SAT for two convex polygons', body: 'Early-out on the first separating axis; otherwise the smallest overlap is the MTV.', flow: ['collect edge normals of A and B (unit length)', 'project all vertices of A and B onto each axis', 'gap on any axis → no collision (stop)', 'all overlap → MTV = axis with smallest overlap', 'orient MTV from A towards B'] },
        { kind: 'tip', title: 'Use the cheapest shape that works', body: 'Circles and capsules are cheaper and roll smoother than polygons. Many games use a capsule for characters and boxes or polygons only for level geometry.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'sat_from_scratch.ts',
          explanation: 'Runnable TypeScript: AABB overlap with MTV, circle-circle overlap, and a full SAT implementation for convex polygons. Assertions cover the push-out depth and direction, a rotated box overlapping by exactly 0.114 along x, and a false positive where AABBs overlap but SAT finds a separating diagonal axis.',
          code: raw`//  SAT: project both shapes onto every edge normal
//
//     A: [------]                          axis n
//     B:       [------]   overlap -> keep  ----------->
//     A: [----]    [----] :B  gap -> SEPARATED (stop)
//   all axes overlap  ->  MTV = axis with the smallest overlap
import assert from 'node:assert/strict';

type V = { x: number; y: number };
type AABB = { minX: number; minY: number; maxX: number; maxY: number };
const r3 = (n: number) => Math.round(n * 1000) / 1000 + 0;

// 1) AABB overlap + minimum translation vector (push b out of a)
function aabbMtv(a: AABB, b: AABB): V | null {
  const ox = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const oy = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  if (ox <= 0 || oy <= 0) return null;
  const bcx = (b.minX + b.maxX) / 2, acx = (a.minX + a.maxX) / 2, bcy = (b.minY + b.maxY) / 2, acy = (a.minY + a.maxY) / 2;
  return ox < oy ? { x: bcx < acx ? -ox : ox, y: 0 } : { x: 0, y: bcy < acy ? -oy : oy };
}
const floor = { minX: 0, minY: 100, maxX: 500, maxY: 120 };
const player = { minX: 40, minY: 70, maxX: 60, maxY: 104 };      // sunk 4 px into the floor
assert.deepEqual(aabbMtv(floor, player), { x: 0, y: -4 });       // push up by 4, not sideways
assert.equal(aabbMtv(floor, { minX: 40, minY: 60, maxX: 60, maxY: 100 }), null);   // touching is not overlapping

// 2) circles
const circleDepth = (a: V, ra: number, b: V, rb: number) => { const d = Math.hypot(b.x - a.x, b.y - a.y); return d < ra + rb ? ra + rb - d : 0; };
assert.equal(circleDepth({ x: 0, y: 0 }, 5, { x: 8, y: 0 }, 4), 1);

// 3) SAT for convex polygons
const box = (cx: number, cy: number, half: number, angDeg: number): V[] => {
  const a = (angDeg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => ({ x: cx + (x * c - y * s) * half, y: cy + (x * s + y * c) * half }));
};
function sat(A: V[], B: V[]): { axis: V; depth: number } | null {
  let best: { axis: V; depth: number } | null = null;
  for (const poly of [A, B]) for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const ex = q.x - p.x, ey = q.y - p.y, len = Math.hypot(ex, ey);
    const axis = { x: -ey / len, y: ex / len };                  // unit edge normal
    const proj = (P: V[]) => { let lo = Infinity, hi = -Infinity; for (const v of P) { const d = v.x * axis.x + v.y * axis.y; lo = Math.min(lo, d); hi = Math.max(hi, d); } return [lo, hi]; };
    const [a0, a1] = proj(A), [b0, b1] = proj(B);
    const o = Math.min(a1, b1) - Math.max(a0, b0);
    if (o <= 0) return null;                                       // separating axis found
    if (!best || o < best.depth) best = { axis, depth: o };
  }
  return best;
}
const A = box(0, 0, 1, 0);
const hit = sat(A, box(2.3, 0, 1, 45));                           // corner pokes in along x
assert.ok(hit && r3(hit.depth) === 0.114 && r3(Math.abs(hit.axis.x)) === 1);
assert.equal(sat(A, box(2.5, 0, 1, 45)), null);                    // corner now 0.086 short

// 4) AABB false positive vs SAT
const B = box(2.1, 2.1, 1, 45);
const bb = { minX: Math.min(...B.map((v) => v.x)), maxX: Math.max(...B.map((v) => v.x)), minY: Math.min(...B.map((v) => v.y)), maxY: Math.max(...B.map((v) => v.y)) };
assert.notEqual(aabbMtv({ minX: -1, minY: -1, maxX: 1, maxY: 1 }, bb), null);   // AABBs overlap...
assert.equal(sat(A, B), null);                                                    // ...but the diagonal separates them
console.log('SAT depth', hit && r3(hit.depth), 'on axis', hit && [r3(hit.axis.x), r3(hit.axis.y)], '| AABB false positive caught by SAT');`,
        },
        production: {
          language: 'c',
          filename: 'sat.cpp',
          explanation: 'Production C++20 (compiled with g++ -Wall -Werror): SAT between oriented boxes using only their 4 unique axes (2 per box) and projected radii instead of looping all vertices, returning a contact normal oriented from A to B and the penetration depth, plus positional correction with slop and percentage as used by Box2D-style solvers.',
          code: raw`#include <cmath>
#include <optional>

struct Vec2 { float x, y; };
inline Vec2 operator-(Vec2 a, Vec2 b) { return {a.x - b.x, a.y - b.y}; }
inline Vec2 operator+(Vec2 a, Vec2 b) { return {a.x + b.x, a.y + b.y}; }
inline Vec2 operator*(Vec2 a, float s) { return {a.x * s, a.y * s}; }
inline float dot(Vec2 a, Vec2 b) { return a.x * b.x + a.y * b.y; }

struct OBB {
  Vec2 center;
  Vec2 axis[2];        // unit local x and y axes (from the rotation)
  float half[2];       // half extents along those axes
};

struct Contact { Vec2 normal; float depth; };   // normal points from A towards B

// Projected "radius" of an OBB onto a unit axis: sum of |half_i * (axis_i . n)|
inline float radiusOn(const OBB& b, Vec2 n) {
  return b.half[0] * std::fabs(dot(b.axis[0], n)) + b.half[1] * std::fabs(dot(b.axis[1], n));
}

std::optional<Contact> satOBB(const OBB& a, const OBB& b) {
  const Vec2 d = b.center - a.center;
  const Vec2 axes[4] = {a.axis[0], a.axis[1], b.axis[0], b.axis[1]};   // boxes: only 4 unique axes
  Contact best{{0.0f, 0.0f}, INFINITY};
  for (const Vec2& n : axes) {
    const float dist = std::fabs(dot(d, n));
    const float overlap = radiusOn(a, n) + radiusOn(b, n) - dist;
    if (overlap <= 0.0f) return std::nullopt;                          // separating axis: early out
    if (overlap < best.depth) {
      best.depth = overlap;
      best.normal = dot(d, n) < 0.0f ? n * -1.0f : n;                   // orient A -> B
    }
  }
  return best;
}

struct Body { Vec2 pos; float invMass; };

// Positional correction (Baumgarte-style): allow a small slop, correct a percentage per step
void correctPositions(Body& a, Body& b, const Contact& c) {
  constexpr float kSlop = 0.01f, kPercent = 0.8f;
  const float wSum = a.invMass + b.invMass;
  if (wSum == 0.0f) return;                                             // two static bodies
  const float mag = std::fmax(c.depth - kSlop, 0.0f) / wSum * kPercent;
  const Vec2 corr = c.normal * mag;
  a.pos = a.pos - corr * a.invMass;
  b.pos = b.pos + corr * b.invMass;
}

int main() {
  const float s = std::sqrt(0.5f);
  OBB a{{0.0f, 0.0f}, {{1.0f, 0.0f}, {0.0f, 1.0f}}, {1.0f, 1.0f}};
  OBB b{{2.3f, 0.0f}, {{s, s}, {-s, s}}, {1.0f, 1.0f}};                 // rotated 45 degrees
  const auto hit = satOBB(a, b);
  return hit && hit->depth > 0.1f && hit->depth < 0.12f ? 0 : 1;
}`,
        },
        bug: {
          explanation:
            'Using an edge normal without normalising it still gives the right yes/no answer (a gap is a gap at any scale), but the overlap values are multiplied by the edge length. The MTV then picks the wrong axis and pushes objects out by many times the real penetration, so characters pop or jitter on rotated platforms. Normalise every axis before projecting.',
          buggy: {
            language: 'ts',
            filename: 'sat.ts',
            code: raw`// ❌ Unnormalised axis: depth is scaled by the edge length, the push-out is wrong
const axis = { x: -(q.y - p.y), y: q.x - p.x };
const overlap = Math.min(a1, b1) - Math.max(a0, b0);   // in units of edge length, not pixels
if (overlap < best.depth) best = { axis, depth: overlap };`,
          },
          fixed: {
            language: 'ts',
            filename: 'sat.ts',
            code: raw`// ✅ Unit-length axis: overlap is a real distance and comparable across axes
const ex = q.x - p.x, ey = q.y - p.y, len = Math.hypot(ex, ey);
const axis = { x: -ey / len, y: ex / len };
const overlap = Math.min(a1, b1) - Math.max(a0, b0);
if (overlap < best.depth) best = { axis, depth: overlap };`,
          },
        },
      },
      takeaways: [
        'AABB overlap is four comparisons; the MTV pushes along the axis of least overlap.',
        'SAT: convex shapes are disjoint if any axis (edge normal) separates their projections.',
        'AABBs of rotated shapes produce false positives; SAT resolves them exactly.',
        'Normalise axes so depths are real distances, and orient the normal from A to B.',
        'Practice drill: extend Tab 1\'s sat() to return the contact normal oriented from A to B, then move B by depth·normal and confirm sat() returns null (or depth ≈ 0).',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'game-ccd-tunneling',
      title: 'Tunneling, Swept Tests & Continuous Collision Detection',
      summary: 'Fast objects can jump straight through thin walls between two fixed steps. Raycasts, swept AABBs (time of impact) and sub-stepping catch the collision in between, and let bullets, dashes and fast cars hit what they should.',
      difficulty: 'Advanced',
      minutes: 22,
      xp: 130,
      labId: 'game-engine',
      labMode: 'physics',
      analogy:
        "Discrete collision is a strobe light at a dance: you only see where people are at each flash. Someone fast enough can cross the whole room between flashes without ever appearing to touch the wall. Continuous collision detection traces the path they took between flashes, so it notices exactly when and where they would have hit.",
      intuition: [
        { title: 'Why tunneling happens', body: "At 1,200 px/s and 60 steps per second, a bullet moves 20 px per step. A 5 px thick wall can sit entirely between two sampled positions (x = 100, then x = 120), so the overlap test never fires." },
        { title: 'Rule of thumb', body: "Tunneling is possible whenever speed · dt exceeds the thickness of the thinnest obstacle plus the object's own size. Making walls thicker or capping velocity helps, but fast gameplay needs a real fix." },
        { title: 'Raycast (segment vs AABB)', body: "Treat the motion this step as a segment from the old to the new position. The slab method intersects it with each axis interval and returns the time of impact t ∈ [0, 1] (0.25 means a quarter of the way through the step)." },
        { title: 'Swept AABB via Minkowski sum', body: "To sweep a box instead of a point, grow the obstacle by the mover's half-extents and cast the centre point against the grown box. Move to the time of impact, then remove the velocity component along the hit normal so the mover slides." },
        { title: 'Sub-stepping and speculative contacts', body: "Alternatively, split fast objects' motion into k sub-steps so each moves less than the thinnest obstacle. Engines like Box2D and PhysX also offer bullet flags, CCD on specific bodies and speculative contacts that predict collisions one step ahead." },
        { title: 'Use CCD selectively', body: "Swept tests cost more than overlap tests. Enable them for bullets, projectiles, dashes and the player; leave slow debris on discrete detection." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Swept move & slide', body: 'One iteration per step, repeated up to 2–3 times for corners.', flow: ['grow obstacles by mover half-size (Minkowski)', 'raycast centre along v·dt → earliest t and normal', 'move to t (minus a tiny epsilon)', 'remove the velocity along the normal (slide)', 'repeat with the remaining time'] },
        { kind: 'warning', title: 'Hitscan is not the same as CCD', body: 'Hitscan weapons are instant rays from the gun; CCD is for physical objects that travel over time. Both use the same raycast maths, but projectiles also need gravity and lifetime.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'tunneling_from_scratch.ts',
          explanation: 'Runnable TypeScript: a 1,200 px/s bullet tunnels through a 5 px wall with discrete checks, then is caught by a slab-method raycast (time of impact 0.25), a swept AABB through the Minkowski-grown wall (t = 0.2), and by sub-stepping. All results asserted.',
          code: raw`//  DISCRETE (60 Hz, 20 px per step)            CONTINUOUS (ray from previous to next)
//    x=100 .      ||       . x=120             x=100 o--------->||-------> x=120
//                 ||  wall 105..110                    t = (105 - 100) / 20 = 0.25  -> HIT
//    both samples outside -> MISS (tunneled)    swept box (half 1): wall grows to 104..111 -> t = 0.2
//  ---- sub-steps needed: ceil(20 / 5) = 4 ----
import assert from 'node:assert/strict';

type Box = { minX: number; minY: number; maxX: number; maxY: number };
const wall: Box = { minX: 105, minY: -50, maxX: 110, maxY: 50 };
const inside = (x: number, y: number, b: Box) => x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;
const SPEED = 1200, DT = 1 / 60, STEP = SPEED * DT;               // 20 px per step

// 1) discrete: sample only the end positions
let x = 0, discreteHit = false;
for (let i = 0; i < 10; i++) { x += STEP; if (inside(x, 0, wall)) discreteHit = true; }
assert.equal(discreteHit, false);                                 // 100 -> 120 skipped the wall entirely

// 2) slab method: segment p + d*t, t in [0, 1]
function raycast(px: number, py: number, dx: number, dy: number, b: Box): { t: number; nx: number; ny: number } | null {
  let tMin = 0, tMax = 1, nx = 0, ny = 0;
  const axes: [number, number, number, number, number][] = [[px, dx, b.minX, b.maxX, 0], [py, dy, b.minY, b.maxY, 1]];
  for (const [p, d, lo, hi, axis] of axes) {
    if (Math.abs(d) < 1e-12) { if (p < lo || p > hi) return null; continue; }
    let t1 = (lo - p) / d, t2 = (hi - p) / d, sign = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; sign = 1; }
    if (t1 > tMin) { tMin = t1; nx = axis === 0 ? sign : 0; ny = axis === 1 ? sign : 0; }
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  return { t: tMin, nx, ny };
}
const hit = raycast(100, 0, STEP, 0, wall);
assert.deepEqual(hit, { t: 0.25, nx: -1, ny: 0 });               // hit the left face a quarter of the way through
assert.equal(raycast(0, 0, STEP, 0, wall), null);                 // 0 -> 20 does not reach it

// 3) swept AABB: bullet is a 2x2 box -> grow the wall by half-size 1 (Minkowski sum)
const grown: Box = { minX: wall.minX - 1, minY: wall.minY - 1, maxX: wall.maxX + 1, maxY: wall.maxY + 1 };
const swept = raycast(100, 0, STEP, 0, grown);
assert.ok(swept !== null && Math.abs(swept.t - 0.2) < 1e-12);
const contactX = 100 + STEP * swept!.t;                           // centre stops at 104 -> right edge touches 105
assert.ok(Math.abs(contactX - 104) < 1e-9);

// 4) sub-stepping: k = ceil(distance / thinnest obstacle)
const k = Math.ceil(STEP / (wall.maxX - wall.minX));
let sx = 100, subHit = false;
for (let s = 0; s < k; s++) { sx += STEP / k; if (inside(sx, 0, wall)) subHit = true; }
assert.equal(k, 4);
assert.equal(subHit, true);                                       // sample at x = 105 lands on the wall
console.log('discrete hit:', discreteHit, '| ray t:', hit && hit.t, '| swept t:', swept && swept.t, '| sub-steps:', k);`,
        },
        production: {
          language: 'ts',
          filename: 'move_and_slide.ts',
          explanation: 'Production engine pattern: a kinematic character controller that sweeps its AABB against nearby solid boxes (Minkowski-grown, slab raycast), moves to the earliest time of impact minus a skin width, removes velocity into the hit normal and repeats with the remaining time up to three times so it slides along walls and into corners without tunneling.',
          code: raw`export interface AABB { minX: number; minY: number; maxX: number; maxY: number }
export interface Mover { x: number; y: number; hw: number; hh: number; vx: number; vy: number; grounded: boolean }

const SKIN = 0.01;                                     // stay a hair away from surfaces
const MAX_ITERATIONS = 3;

function sweep(px: number, py: number, dx: number, dy: number, b: AABB) {
  let tMin = 0, tMax = 1, nx = 0, ny = 0;
  if (Math.abs(dx) < 1e-9) { if (px <= b.minX || px >= b.maxX) return null; }
  else {
    let t1 = (b.minX - px) / dx, t2 = (b.maxX - px) / dx, s = -1;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
    if (t1 > tMin) { tMin = t1; nx = s; ny = 0; }
    tMax = Math.min(tMax, t2);
  }
  if (Math.abs(dy) < 1e-9) { if (py <= b.minY || py >= b.maxY) return null; }
  else {
    let t1 = (b.minY - py) / dy, t2 = (b.maxY - py) / dy, s = -1;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
    if (t1 > tMin) { tMin = t1; nx = 0; ny = s; }
    tMax = Math.min(tMax, t2);
  }
  return tMin <= tMax && tMax > 0 ? { t: tMin, nx, ny } : null;
}

export function moveAndSlide(m: Mover, solids: readonly AABB[], dt: number) {
  m.grounded = false;
  let remaining = 1;
  for (let iter = 0; iter < MAX_ITERATIONS && remaining > 0; iter++) {
    const dx = m.vx * dt * remaining, dy = m.vy * dt * remaining;
    let best: { t: number; nx: number; ny: number } | null = null;
    for (const s of solids) {
      // Minkowski sum: grow the solid by the mover's half extents, cast the centre point
      const hit = sweep(m.x, m.y, dx, dy, { minX: s.minX - m.hw, minY: s.minY - m.hh, maxX: s.maxX + m.hw, maxY: s.maxY + m.hh });
      if (hit && (!best || hit.t < best.t)) best = hit;
    }
    if (!best) { m.x += dx; m.y += dy; return; }      // free path: take the whole move
    const t = Math.max(0, best.t - SKIN / Math.max(1e-6, Math.hypot(dx, dy)));
    m.x += dx * t; m.y += dy * t;
    const into = m.vx * best.nx + m.vy * best.ny;     // remove velocity going into the surface
    m.vx -= into * best.nx; m.vy -= into * best.ny;
    if (best.ny < 0) m.grounded = true;                // hit a floor (y down)
    remaining *= 1 - best.t;
  }
}`,
        },
        bug: {
          explanation:
            'Checking overlap only at the new position works for slow objects but lets anything that moves farther than an obstacle\'s thickness in one step pass straight through it. Fast projectiles, dashes and falling players are the usual victims. Sweep the motion (raycast or swept AABB) from the previous position to the new one and stop at the earliest time of impact.',
          buggy: {
            language: 'ts',
            filename: 'bullet.ts',
            code: raw`// ❌ Discrete check at the end position only: bullets tunnel through thin walls
b.x += b.vx * dt;
b.y += b.vy * dt;
for (const w of walls) if (pointInBox(b.x, b.y, w)) { explode(b); break; }`,
          },
          fixed: {
            language: 'ts',
            filename: 'bullet.ts',
            code: raw`// ✅ Sweep from the old position to the new one and stop at the earliest impact
const dx = b.vx * dt, dy = b.vy * dt;
let first: Hit | null = null;
for (const w of walls) { const h = raycast(b.x, b.y, dx, dy, w); if (h && (!first || h.t < first.t)) first = h; }
if (first) { b.x += dx * first.t; b.y += dy * first.t; explode(b); }
else { b.x += dx; b.y += dy; }`,
          },
        },
      },
      takeaways: [
        'Tunneling happens when an object moves farther per step than the obstacle (plus its own size) is thick.',
        'Raycast the step\'s motion with the slab method to get a time of impact t ∈ [0, 1].',
        'Sweep boxes by Minkowski-growing obstacles; move to the impact, then slide along the normal.',
        'Sub-stepping and engine CCD flags are alternatives; enable CCD only for fast objects.',
        'Practice drill: double the bullet speed in Tab 1 to 2,400 px/s and recompute the time of impact from x = 100 and the number of sub-steps needed (t = 0.125, 8 sub-steps).',
      ],
    },
  ],
};
