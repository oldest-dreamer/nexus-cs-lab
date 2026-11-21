import type { Module } from '../../types';

const raw = String.raw;

export const ecsModule: Module = {
  id: 'game-ecs',
  title: 'Entity Component System & Data-Oriented Design',
  level: 'Intermediate',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'game-ecs-architecture',
      title: 'From Inheritance Trees to Entity Component System',
      summary: 'Why deep GameObject class hierarchies collapse under real game design, and how ECS replaces them: entities as integer IDs with generations, components as plain data, systems as functions over queries.',
      difficulty: 'Intermediate',
      minutes: 24,
      xp: 120,
      analogy:
        "Inheritance is like a family tree for game objects: a FlyingEnemy is an Enemy is a Character is a GameObject. Then design asks for a flying chest that shoots, and it fits nowhere in the tree. ECS is more like a spreadsheet: each row is an entity (just a row number), each column is a component (Position, Velocity, Health, Flying). To make anything, you tick the columns you want. Systems are formulas that run down every row that has the right columns ticked.",
      intuition: [
        { title: 'The inheritance collapse', body: "Behaviour gets shared by moving it up the tree, so the base class grows every feature (the \"god object\"). Diamond problems appear (FlyingSwimmingEnemy), and changing a base class risks breaking dozens of subclasses." },
        { title: 'Entities are IDs', body: "An entity is just an integer index, often packed with a generation counter. It owns nothing and has no methods. Destroying an entity bumps its generation, so an old handle to a recycled slot is detected as stale instead of silently pointing at a new entity." },
        { title: 'Components are plain data', body: "Position {x, y}, Velocity {x, y}, Health {hp}. No logic, no references to other objects. Adding a component (Burning) to an entity at runtime changes its behaviour without changing any class." },
        { title: 'Systems are queries plus loops', body: "MovementSystem runs over every entity that has Position and Velocity. RenderSystem runs over Position and Sprite. Each system does one job, in a fixed order every tick, which keeps the frame predictable and easy to profile." },
        { title: 'Storage: sparse sets and archetypes', body: "A sparse set keeps each component in a dense packed array plus an index map, giving O(1) add, remove and lookup and tight iteration. Archetype ECS (Unity DOTS, Bevy, flecs) groups entities that share the exact same component set into tables for even faster queries." },
        { title: 'Structural changes are deferred', body: "Destroying entities or adding components in the middle of iterating a query would reorder the arrays being iterated. Engines queue these into a command buffer and apply it between systems." },
      ],
      callouts: [
        { kind: 'architecture', title: 'One ECS tick', body: 'Systems run in a fixed order over component queries; structural changes wait in a command buffer.', flow: ['input system → writes Intent', 'AI system → writes Velocity', 'movement system: Position += Velocity·dt', 'collision system → emits events', 'apply command buffer (spawn / destroy)', 'render system reads Position + Sprite'] },
        { kind: 'tip', title: 'You do not need a framework to start', body: 'A few typed arrays plus a list of systems is already an ECS. Reach for bitECS, Bevy, flecs or EnTT when you need archetypes, change detection or parallel scheduling.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'ecs_from_scratch.ts',
          explanation: 'Runnable TypeScript: a minimal ECS with generational entity handles, sparse-set component storage with swap-remove, a two-component query, a movement system and a deferred destroy queue. Assertions prove stale handles are rejected, queries match only the right entities, and destroying during iteration skips nothing.',
          code: raw`//  ENTITY = index + generation          COMPONENT STORAGE (sparse set)
//
//   handle = gen << 20 | index           sparse[entity] -> slot   dense[slot] -> entity
//   destroy: gen++  -> old handles stale  data[slot]  = { x, y }   (packed, no holes)
//   query(Position, Velocity): iterate the smaller dense array, check the other
//   remove = swap last into the hole ----> O(1), stays packed
import assert from 'node:assert/strict';

const INDEX_BITS = 20, INDEX_MASK = (1 << INDEX_BITS) - 1;
class World {
  private gens: number[] = [];
  private free: number[] = [];
  create(): number {
    const i = this.free.length ? this.free.pop()! : this.gens.push(0) - 1;
    return (this.gens[i] << INDEX_BITS) | i;
  }
  alive(h: number) { const i = h & INDEX_MASK; return this.gens[i] === h >>> INDEX_BITS; }
  destroy(h: number, stores: Store<unknown>[]) {
    if (!this.alive(h)) return;
    const i = h & INDEX_MASK;
    for (const s of stores) s.remove(i);
    this.gens[i]++;
    this.free.push(i);
  }
}

class Store<T> {
  sparse = new Map<number, number>();   // entity index -> dense slot
  dense: number[] = [];                 // slot -> entity index
  data: T[] = [];
  add(e: number, v: T) { this.sparse.set(e, this.dense.length); this.dense.push(e); this.data.push(v); }
  has(e: number) { return this.sparse.has(e); }
  get(e: number) { return this.data[this.sparse.get(e)!]; }
  remove(e: number) {
    const slot = this.sparse.get(e);
    if (slot === undefined) return;
    const last = this.dense.length - 1;
    this.dense[slot] = this.dense[last]; this.data[slot] = this.data[last];   // swap-remove
    this.sparse.set(this.dense[slot], slot);
    this.dense.pop(); this.data.pop(); this.sparse.delete(e);
  }
}

type Vec = { x: number; y: number };
const world = new World();
const pos = new Store<Vec>(), vel = new Store<Vec>(), hp = new Store<{ hp: number }>();
const all = [pos, vel, hp] as Store<unknown>[];
const idx = (h: number) => h & INDEX_MASK;

const player = world.create(); pos.add(idx(player), { x: 0, y: 0 }); vel.add(idx(player), { x: 10, y: 0 }); hp.add(idx(player), { hp: 100 });
const rock = world.create(); pos.add(idx(rock), { x: 5, y: 5 });                                  // static: no Velocity
const bullets = [1, 2, 3, 4].map((k) => { const b = world.create(); pos.add(idx(b), { x: k, y: 0 }); vel.add(idx(b), { x: 0, y: 100 }); return b; });

function movement(dt: number) {
  for (let s = 0; s < vel.dense.length; s++) {                     // iterate the smaller store
    const e = vel.dense[s];
    if (!pos.has(e)) continue;
    const p = pos.get(e), v = vel.data[s];
    p.x += v.x * dt; p.y += v.y * dt;
  }
}
movement(0.5);
assert.deepEqual(pos.get(idx(player)), { x: 5, y: 0 });
assert.deepEqual(pos.get(idx(rock)), { x: 5, y: 5 });              // not matched by the query

// destroy bullets that left the screen: queue during iteration, apply after
const toDestroy: number[] = [];
for (const b of bullets) if (pos.get(idx(b)).y >= 50) toDestroy.push(b);
for (const b of toDestroy) world.destroy(b, all);
assert.equal(vel.dense.length, 1);                                  // all 4 bullets removed, none skipped
assert.equal(pos.dense.length, 2);

// generational handles: the slot is reused, the old handle is stale
const fresh = world.create();
assert.equal(idx(fresh), idx(bullets[3]));                          // same slot recycled
assert.equal(world.alive(bullets[3]), false);
assert.equal(world.alive(fresh), true);
console.log('entities with Velocity:', vel.dense.length, '| stale handle rejected:', !world.alive(bullets[3]));`,
        },
        production: {
          language: 'ts',
          filename: 'ecs.ts',
          explanation: 'Production engine pattern (bitECS-style): components are typed-array columns indexed by entity ID, each entity has a component bitmask, queries cache matching entities and update on structural change, and destroys go through a command buffer flushed between systems. Iteration is a tight loop over numbers with no objects.',
          code: raw`const MAX = 100_000;
// ---- components as Struct-of-Arrays columns ----
export const Position = { x: new Float32Array(MAX), y: new Float32Array(MAX) };
export const Velocity = { x: new Float32Array(MAX), y: new Float32Array(MAX) };
export const Health = { hp: new Int32Array(MAX) };

export const enum C { Position = 1 << 0, Velocity = 1 << 1, Health = 1 << 2 }
const mask = new Uint32Array(MAX);                     // which components each entity has
const freeList: number[] = [];
let nextId = 0;

// ---- cached queries ----
class Query {
  readonly ids: number[] = [];
  private index = new Int32Array(MAX).fill(-1);
  constructor(readonly all: number) {}
  sync(e: number) {
    const match = (mask[e] & this.all) === this.all;
    if (match && this.index[e] < 0) { this.index[e] = this.ids.length; this.ids.push(e); }
    else if (!match && this.index[e] >= 0) {                     // swap-remove
      const at = this.index[e], last = this.ids.pop()!;
      if (last !== e) { this.ids[at] = last; this.index[last] = at; }
      this.index[e] = -1;
    }
  }
}
const queries: Query[] = [];
export const defineQuery = (all: number) => { const q = new Query(all); queries.push(q); return q; };

export function addEntity(): number { const e = freeList.pop() ?? nextId++; mask[e] = 0; return e; }
export function addComponent(e: number, c: number) { mask[e] |= c; for (const q of queries) q.sync(e); }
export function removeComponent(e: number, c: number) { mask[e] &= ~c; for (const q of queries) q.sync(e); }

// ---- deferred structural changes ----
const pendingDestroy: number[] = [];
export const destroyLater = (e: number) => { pendingDestroy.push(e); };
export function flushCommands() {
  for (const e of pendingDestroy) { mask[e] = 0; for (const q of queries) q.sync(e); freeList.push(e); }
  pendingDestroy.length = 0;
}

// ---- systems ----
const moving = defineQuery(C.Position | C.Velocity);
const living = defineQuery(C.Health);

export function movementSystem(dt: number) {
  const ids = moving.ids, px = Position.x, py = Position.y, vx = Velocity.x, vy = Velocity.y;
  for (let i = 0; i < ids.length; i++) { const e = ids[i]; px[e] += vx[e] * dt; py[e] += vy[e] * dt; }
}
export function deathSystem() {
  for (const e of living.ids) if (Health.hp[e] <= 0) destroyLater(e);   // safe: no mutation mid-loop
}
export function tick(dt: number) { movementSystem(dt); deathSystem(); flushCommands(); }`,
        },
        bug: {
          explanation:
            'Removing elements from an array while iterating it forward shifts the next element into the current index, and the loop then skips it. With swap-remove storage it is worse: the last entity is moved into the hole and may never be visited this tick. Collect structural changes in a command buffer (or iterate backwards for plain arrays) and apply them after the loop.',
          buggy: {
            language: 'ts',
            filename: 'death.ts',
            code: raw`// ❌ Splicing during forward iteration: two adjacent dead enemies, only one is removed
for (let i = 0; i < enemies.length; i++) {
  if (enemies[i].hp <= 0) {
    enemies.splice(i, 1);          // the next enemy slides into index i and is skipped
  }
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'death.ts',
            code: raw`// ✅ Defer structural changes: collect during iteration, apply afterwards
const dead: number[] = [];
for (const e of livingQuery.ids) if (Health.hp[e] <= 0) dead.push(e);
for (const e of dead) destroyEntity(e);   // the query is not being iterated any more`,
          },
        },
      },
      takeaways: [
        'Deep inheritance hierarchies break when designers combine features freely; composition of data scales.',
        'Entities are integer IDs with generations; components are plain data; systems are loops over queries.',
        'Sparse sets and archetypes keep component data packed for fast iteration.',
        'Defer structural changes (spawn, destroy, add/remove component) to a command buffer.',
        'Practice drill: add a Lifetime component and a system that counts it down and calls destroyLater at zero; confirm bullets disappear without any Bullet class.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'game-data-oriented-soa',
      title: 'Data-Oriented Design: SoA vs AoS & Cache Lines',
      summary: 'Why memory layout often matters more than instruction count: CPU caches load 64-byte lines, so Struct-of-Arrays with TypedArrays streams only the fields a system touches while Array-of-Structs and object graphs waste most of every line.',
      difficulty: 'Advanced',
      minutes: 24,
      xp: 130,
      analogy:
        "The CPU fetches memory the way you take books off a shelf: never one page, always a whole box (a 64-byte cache line). If every box contains one page you need and fifteen you don't, you carry boxes all day. Struct-of-Arrays packs all the x-coordinates together in their own boxes, so every box you carry is full of pages you actually read.",
      intuition: [
        { title: 'The memory wall', body: "A cache hit takes a few cycles; a trip to main memory can cost 100+ cycles. For most game update loops the time is dominated by how many cache lines are fetched, not by the arithmetic." },
        { title: 'Cache lines', body: "Memory moves in 64-byte lines. Reading one float pulls in its 15 neighbours. Sequential access also triggers the hardware prefetcher, which loads the next lines before you ask for them." },
        { title: 'AoS vs SoA', body: "Array-of-Structs stores [x y z vx vy vz hp ...][x y z ...]: a movement system that touches only x and y still drags every other field through the cache. Struct-of-Arrays stores x[], y[], vx[] separately: each line is 16 useful floats." },
        { title: 'JavaScript objects are worse', body: "An array of objects is an array of pointers to objects scattered across the heap, each with a header and hidden-class pointer. TypedArrays (Float32Array) are real contiguous memory, which is why bitECS and engine cores use them." },
        { title: 'Iterate in memory order', body: "A 2D grid stored row-major must be looped row by row (y outer, x inner). Looping column-first jumps a whole row per access and misses the cache on nearly every read." },
        { title: 'Hot/cold splitting', body: "Keep data read every frame (position, velocity) apart from rarely used data (name, inventory, debug info). Move the cold fields into a separate table referenced by entity ID." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Lines fetched for 1024 entities (update x, y only)', body: 'Counted exactly by the Tab 1 simulator.', flow: ['AoS, 48-byte struct → 768 lines (one per 64 bytes swept)', 'SoA, Float32 x[] + y[] → 128 lines', '6× fewer lines for the same result', 'contiguous + sequential → prefetcher helps too'] },
        { kind: 'warning', title: 'Measure, do not guess', body: 'Use a profiler (perf, VTune, Chrome Performance panel) and test on target hardware. Data-oriented design is about removing measured bottlenecks, not rewriting everything into arrays on day one.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'soa_cache_lines.ts',
          explanation: 'Runnable TypeScript: a cache-line counter that replays the exact byte addresses an update loop touches, comparing a 48-byte AoS layout with SoA Float32Arrays (768 vs 128 lines for 1024 entities), proving both layouts compute identical results, plus row-major vs column-major grid traversal and memory cost of objects versus TypedArrays.',
          code: raw`//  AoS: [x y z vx vy vz r g b hp ...][x y z ...]   48 bytes each  -> one 64-byte line per ~1.3 entities
//       ^^^ only x,y needed, the rest rides along
//  SoA: x: [x0 x1 x2 ... x15 | x16 ...]   one 64-byte line = 16 useful floats
//       y: [y0 y1 y2 ... y15 | y16 ...]
//  ---- lines fetched = distinct floor(address / 64) touched ----
import assert from 'node:assert/strict';

const LINE = 64, N = 1024;
function linesTouched(addresses: number[]) { return new Set(addresses.map((a) => Math.floor(a / LINE))).size; }

// AoS: 12 floats (48 bytes) per entity, x at offset 0, y at offset 4
const STRIDE = 48;
const aosAddrs: number[] = [];
for (let i = 0; i < N; i++) aosAddrs.push(i * STRIDE + 0, i * STRIDE + 4);
// SoA: x array at 0, y array right after it
const ySoaBase = N * 4;
const soaAddrs: number[] = [];
for (let i = 0; i < N; i++) soaAddrs.push(i * 4, ySoaBase + i * 4);

const aosLines = linesTouched(aosAddrs), soaLines = linesTouched(soaAddrs);
assert.equal(aosLines, 768);                 // 1024 * 48 / 64
assert.equal(soaLines, 128);                 // 2 arrays * 1024 * 4 / 64
assert.equal(aosLines / soaLines, 6);

// same maths, both layouts, identical results
const aos = new Float32Array(N * 12), xs = new Float32Array(N), ys = new Float32Array(N), vxs = new Float32Array(N), vys = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const o = i * 12; aos[o] = xs[i] = i; aos[o + 1] = ys[i] = -i; aos[o + 3] = vxs[i] = 2; aos[o + 4] = vys[i] = 0.5;
}
for (let i = 0; i < N; i++) { const o = i * 12; aos[o] += aos[o + 3] * 0.5; aos[o + 1] += aos[o + 4] * 0.5; }
for (let i = 0; i < N; i++) { xs[i] += vxs[i] * 0.5; ys[i] += vys[i] * 0.5; }
let same = true;
for (let i = 0; i < N; i++) if (aos[i * 12] !== xs[i] || aos[i * 12 + 1] !== ys[i]) same = false;
assert.equal(same, true);

// grid traversal order (row-major Float32 grid 256 x 256, first 16 reads)
const W = 256;
const rowMajor: number[] = [], colMajor: number[] = [];
for (let y = 0; y < 1; y++) for (let x = 0; x < 16; x++) rowMajor.push((y * W + x) * 4);
for (let x = 0; x < 1; x++) for (let y = 0; y < 16; y++) colMajor.push((y * W + x) * 4);
assert.equal(linesTouched(rowMajor), 1);      // 16 reads, 1 line
assert.equal(linesTouched(colMajor), 16);     // 16 reads, 16 lines (a full row apart each time)

// memory: TypedArray bytes are exact and contiguous
assert.equal(new Float32Array(N).byteLength, 4096);
console.log('lines fetched  AoS:', aosLines, ' SoA:', soaLines, ' ratio:', aosLines / soaLines + 'x');`,
        },
        production: {
          language: 'c',
          filename: 'particles_soa.cpp',
          explanation: 'Production C++20 (compiled with g++ -Wall -Werror): a particle system in Struct-of-Arrays form with 64-byte aligned streams, a branch-light update loop the compiler can auto-vectorise, hot/cold data split, and swap-remove kill compaction that keeps the arrays dense.',
          code: raw`#include <cstddef>
#include <cstdint>
#include <memory>
#include <new>
#include <string>
#include <vector>

// 64-byte aligned float stream: starts on a cache-line boundary, friendly to SIMD loads
struct AlignedFloats {
  float* data = nullptr;
  explicit AlignedFloats(std::size_t n)
      : data(static_cast<float*>(::operator new[](n * sizeof(float), std::align_val_t{64}))) {}
  ~AlignedFloats() { ::operator delete[](data, std::align_val_t{64}); }
  AlignedFloats(const AlignedFloats&) = delete;
  AlignedFloats& operator=(const AlignedFloats&) = delete;
  float& operator[](std::size_t i) { return data[i]; }
};

struct ColdParticleInfo { std::string debugName; std::uint32_t spawnerId; };   // rarely touched

class ParticlesSoA {
 public:
  explicit ParticlesSoA(std::size_t capacity)
      : cap_(capacity), x_(capacity), y_(capacity), vx_(capacity), vy_(capacity), life_(capacity) {
    cold_.resize(capacity);
  }

  bool spawn(float x, float y, float vx, float vy, float life) {
    if (count_ == cap_) return false;
    x_[count_] = x; y_[count_] = y; vx_[count_] = vx; vy_[count_] = vy; life_[count_] = life;
    ++count_;
    return true;
  }

  // Hot loop: 5 contiguous streams, no pointers chased, no virtual calls -> auto-vectorisable
  void integrate(float dt, float gravity) {
    float* __restrict x = x_.data; float* __restrict y = y_.data;
    float* __restrict vx = vx_.data; float* __restrict vy = vy_.data; float* __restrict life = life_.data;
    for (std::size_t i = 0; i < count_; ++i) {
      vy[i] += gravity * dt;
      x[i] += vx[i] * dt;
      y[i] += vy[i] * dt;
      life[i] -= dt;
    }
  }

  // Compaction: swap the last live particle into each dead slot (order is not preserved)
  void killExpired() {
    std::size_t i = 0;
    while (i < count_) {
      if (life_[i] <= 0.0f) {
        const std::size_t last = --count_;
        x_[i] = x_[last]; y_[i] = y_[last]; vx_[i] = vx_[last]; vy_[i] = vy_[last]; life_[i] = life_[last];
        cold_[i] = std::move(cold_[last]);
      } else {
        ++i;                                            // only advance when the slot is now live
      }
    }
  }

  std::size_t size() const { return count_; }

 private:
  std::size_t cap_, count_ = 0;
  AlignedFloats x_, y_, vx_, vy_, life_;               // hot streams
  std::vector<ColdParticleInfo> cold_;                  // cold data split away from the hot loop
};

int main() {
  ParticlesSoA p(1024);
  for (int i = 0; i < 1000; ++i) p.spawn(0.0f, 0.0f, 1.0f, 2.0f, static_cast<float>(i % 3));
  p.integrate(1.0f / 60.0f, -9.81f);
  p.killExpired();
  return p.size() > 0 ? 0 : 1;
}`,
        },
        bug: {
          explanation:
            'The grid is stored row-major (index = y·W + x), but the loop walks it column-first, so consecutive reads are a whole row (W·4 bytes) apart and almost every read misses the cache. Swapping the loops so x is the inner index makes the reads sequential: 16 floats per cache line and prefetcher-friendly. The work is identical; only the order changes.',
          buggy: {
            language: 'ts',
            filename: 'heatmap.ts',
            code: raw`// ❌ Column-first walk over a row-major grid: one cache miss per read
for (let x = 0; x < W; x++) {
  for (let y = 0; y < H; y++) {
    heat[y * W + x] *= 0.98;       // jumps W * 4 bytes every iteration
  }
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'heatmap.ts',
            code: raw`// ✅ Row-major walk: sequential addresses, 16 floats per 64-byte line
for (let y = 0; y < H; y++) {
  const row = y * W;
  for (let x = 0; x < W; x++) {
    heat[row + x] *= 0.98;
  }
}`,
          },
        },
      },
      takeaways: [
        'Memory moves in 64-byte cache lines; count lines touched, not just instructions.',
        'SoA with TypedArrays streams only the fields a system needs; AoS and object graphs waste bandwidth.',
        'Iterate in storage order (row-major: y outer, x inner) and keep arrays dense with swap-remove.',
        'Split hot and cold data, and confirm every optimisation with a profiler.',
        'Practice drill: with Tab 1\'s counter, compute lines fetched for a 32-byte AoS struct updating x and y (512) and explain why the ratio to SoA is now 4×.',
      ],
    },
  ],
};
