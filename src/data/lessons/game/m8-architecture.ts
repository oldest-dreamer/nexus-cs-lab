import type { Module } from '../../types';

const raw = String.raw;

export const architectureModule: Module = {
  id: 'game-architecture',
  title: 'Scenes, Memory & Persistence',
  level: 'Advanced',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'game-scene-stack',
      title: 'Scene Management: The Scene Stack (Menu → Play → Pause)',
      summary: 'Structuring a game into scenes with clear lifecycles: a stack where the top scene receives input and updates, lower scenes can still render (a pause menu over the frozen game), and transitions are requested and applied at a safe point in the frame.',
      difficulty: 'Intermediate',
      minutes: 20,
      xp: 110,
      analogy:
        "A scene stack is a pile of transparent sheets on an overhead projector. The game world is the bottom sheet; pausing lays a semi-transparent menu sheet on top. You can still see the world through it, but you are only drawing on the top sheet. Unpausing lifts the menu sheet off, and the world underneath is exactly as you left it.",
      intuition: [
        { title: 'Scenes and lifecycles', body: "A scene (state, screen, level) owns its entities, UI and assets. Lifecycle hooks make transitions explicit: enter (load, build), exit (dispose), pause (another scene was pushed on top) and resume (it was popped)." },
        { title: 'Stack operations', body: "push(Pause) keeps Play alive underneath; pop() returns to it; replace(Play) swaps the menu for gameplay; clear-and-push restarts from the title. Modals, inventories, dialogue boxes and confirmation dialogs are all natural stack pushes." },
        { title: 'Who updates, who renders', body: "Normally only the top scene updates and gets input. Rendering starts from the lowest scene that is visible: an opaque scene hides everything below it, a transparent overlay (pause, HUD popup) lets the scenes below draw first." },
        { title: 'Deferred transitions', body: "A scene asking to change scenes in the middle of its own update would remove itself while the manager is iterating. Requests are queued and applied after the frame's update, exactly like deferred entity destruction in ECS." },
        { title: 'Loading', body: "A Loading scene can be pushed while assets for the next scene load asynchronously; it shows progress and replaces itself when ready. Fades are just short-lived overlay scenes." },
        { title: 'Pause is a simulation concern', body: "Paused gameplay must stop advancing simulation time: physics, AI, timers and cooldowns. If every scene updates regardless of the stack, enemies keep attacking behind the pause menu." },
      ],
      callouts: [
        { kind: 'architecture', title: 'A typical session', body: 'Each arrow is one queued transition applied at the end of a frame.', flow: ['push Menu', 'replace Menu → Play (Menu exits, Play enters)', 'push Pause (Play pauses but still renders underneath)', 'pop (Pause exits, Play resumes)', 'replace Play → GameOver'] },
        { kind: 'tip', title: 'Keep scene state serialisable', body: 'If a scene can describe its state as plain data, save games, hot reload and "retry level" all become the same operation: dispose and rebuild from data.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'scene_stack.ts',
          explanation: 'Runnable TypeScript: a scene stack with enter/exit/pause/resume hooks and transitions queued during update and applied afterwards. A scripted Menu → Play → Pause → resume session asserts the exact lifecycle log, that Play stops simulating while Pause is on top, and that Pause renders over Play as a transparent overlay.',
          code: raw`//   SCENE STACK                     update: top scene only      render: from lowest visible up
//
//   +-----------+  <- Pause (transparent overlay)   updates, gets input
//   +-----------+  <- Play                          frozen, still drawn underneath
//   ----- push / pop / replace are queued and applied after update -----
import assert from 'node:assert/strict';

const log: string[] = [];
abstract class Scene {
  transparent = false;
  constructor(readonly name: string) {}
  enter() { log.push(this.name + ':enter'); }
  exit() { log.push(this.name + ':exit'); }
  pause() { log.push(this.name + ':pause'); }
  resume() { log.push(this.name + ':resume'); }
  update(_dt: number, _sm: SceneManager) {}
  render(frame: string[]) { frame.push(this.name); }
}

type Op = { kind: 'push'; scene: Scene } | { kind: 'pop' } | { kind: 'replace'; scene: Scene };
class SceneManager {
  stack: Scene[] = []; private pending: Op[] = [];
  push(scene: Scene) { this.pending.push({ kind: 'push', scene }); }
  pop() { this.pending.push({ kind: 'pop' }); }
  replace(scene: Scene) { this.pending.push({ kind: 'replace', scene }); }
  private apply() {
    for (const op of this.pending.splice(0)) {
      const top = this.stack[this.stack.length - 1];
      if (op.kind === 'push') { top?.pause(); this.stack.push(op.scene); op.scene.enter(); }
      else if (op.kind === 'pop') { this.stack.pop()?.exit(); this.stack[this.stack.length - 1]?.resume(); }
      else { this.stack.pop()?.exit(); this.stack.push(op.scene); op.scene.enter(); }
    }
  }
  frame(dt: number): string[] {
    this.stack[this.stack.length - 1]?.update(dt, this);   // only the top scene simulates
    this.apply();                                          // safe point for transitions
    let first = this.stack.length - 1;
    while (first > 0 && this.stack[first].transparent) first--;
    const drawn: string[] = [];
    for (let i = Math.max(0, first); i < this.stack.length; i++) this.stack[i].render(drawn);
    return drawn;
  }
}

class Play extends Scene {
  simTime = 0; private pausedOnce = false;
  constructor() { super('Play'); }
  override update(dt: number, sm: SceneManager) {
    this.simTime += dt;
    if (this.simTime >= 0.03 && !this.pausedOnce) { this.pausedOnce = true; sm.push(new Pause()); }   // "player presses Esc"
  }
}
class Pause extends Scene {
  frames = 0;
  constructor() { super('Pause'); this.transparent = true; }
  override update(_dt: number, sm: SceneManager) { if (++this.frames === 3) sm.pop(); }
}
class Menu extends Scene {
  constructor() { super('Menu'); }
  override update(_dt: number, sm: SceneManager) { sm.replace(play); }   // "press start"
}

const play = new Play(), sm = new SceneManager();
sm.push(new Menu());
const frames: string[][] = [];
for (let i = 0; i < 8; i++) frames.push(sm.frame(0.01));

assert.deepEqual(log, ['Menu:enter', 'Menu:exit', 'Play:enter', 'Play:pause', 'Pause:enter', 'Pause:exit', 'Play:resume']);
assert.deepEqual(frames[0], ['Menu']);                       // queued push applied at the end of frame 0
assert.deepEqual(frames[7], ['Play']);                       // popped back after 3 paused frames
assert.deepEqual(frames[1], ['Play']);
assert.deepEqual(frames[4], ['Play', 'Pause']);              // overlay: Play drawn underneath
assert.ok(Math.abs(play.simTime - 0.03) < 1e-12);            // 3 Play updates (frames 2-4); the 3 paused frames did not count
console.log(log.join(' > '), '| frame 4 draws', frames[4].join(' + '), '| play sim time', play.simTime.toFixed(2));`,
        },
        production: {
          language: 'ts',
          filename: 'scene_manager.ts',
          explanation: 'Production engine pattern: an async-aware SceneManager. Scenes declare the assets they need; replace() pushes a Loading overlay, awaits loading with progress, then swaps scenes at the next safe point. Input is routed from the top scene down until one consumes it, blocksUpdate/blocksRender flags control what runs beneath, and a fade overlay scene animates transitions.',
          code: raw`export interface SceneInput { type: 'key' | 'pointer'; code: string; consumed: boolean }

export abstract class Scene {
  /** If true, scenes below this one do not update (pause menus, modal dialogs). */
  blocksUpdate = true;
  /** If true, scenes below this one are not rendered (full-screen scenes). */
  blocksRender = true;
  readonly assets: string[] = [];
  async load(_progress: (p: number) => void): Promise<void> {}
  enter(): void {} exit(): void {} pause(): void {} resume(): void {}
  update(_dt: number): void {}
  render(_ctx: CanvasRenderingContext2D, _alpha: number): void {}
  handleInput(_e: SceneInput): void {}
}

class LoadingScene extends Scene {
  progress = 0;
  constructor() { super(); this.blocksRender = true; }
  override render(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = '#e11d48'; ctx.fillRect(40, ctx.canvas.height - 60, (ctx.canvas.width - 80) * this.progress, 8);
  }
}

export class SceneManager {
  private stack: Scene[] = [];
  private queue: Array<() => void> = [];
  private loading = false;

  get top() { return this.stack[this.stack.length - 1]; }

  push(s: Scene) { this.queue.push(() => { this.top?.pause(); this.stack.push(s); s.enter(); }); }
  pop() { this.queue.push(() => { this.stack.pop()?.exit(); this.top?.resume(); }); }

  /** Replace the top scene after loading its assets behind a loading overlay. */
  replace(next: Scene) {
    if (this.loading) return;                          // ignore double-clicks on "Start"
    this.loading = true;
    const overlay = new LoadingScene();
    this.push(overlay);
    void next.load((p) => { overlay.progress = p; }).then(() => {
      this.queue.push(() => {
        this.stack.pop()?.exit();                      // the loading overlay
        this.stack.pop()?.exit();                      // the scene being replaced
        this.stack.push(next); next.enter();
        this.loading = false;
      });
    });
  }

  dispatchInput(e: SceneInput) {
    for (let i = this.stack.length - 1; i >= 0 && !e.consumed; i--) {
      this.stack[i].handleInput(e);
      if (this.stack[i].blocksUpdate) break;           // modal scenes swallow input
    }
  }

  /** Called from the fixed-step loop. */
  update(dt: number) {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      this.stack[i].update(dt);
      if (this.stack[i].blocksUpdate) break;
    }
    for (const op of this.queue.splice(0)) op();       // transitions at a safe point
  }

  render(ctx: CanvasRenderingContext2D, alpha: number) {
    let first = this.stack.length - 1;
    while (first > 0 && !this.stack[first].blocksRender) first--;
    for (let i = Math.max(0, first); i < this.stack.length; i++) this.stack[i].render(ctx, alpha);
  }
}`,
        },
        bug: {
          explanation:
            'Updating every scene in the stack means the gameplay scene keeps simulating behind the pause menu: enemies attack, timers expire and the player can die while "paused". Update from the top down and stop at the first scene that blocks updates; render can still include the scenes below for the overlay look.',
          buggy: {
            language: 'ts',
            filename: 'scenes.ts',
            code: raw`// ❌ Every scene updates: gameplay continues behind the pause menu
function updateScenes(stack: Scene[], dt: number) {
  for (const scene of stack) scene.update(dt);
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'scenes.ts',
            code: raw`// ✅ Top-down until a scene blocks updates (Pause blocks; a HUD toast would not)
function updateScenes(stack: Scene[], dt: number) {
  for (let i = stack.length - 1; i >= 0; i--) {
    stack[i].update(dt);
    if (stack[i].blocksUpdate) break;
  }
}`,
          },
        },
      },
      takeaways: [
        'Organise the game into scenes with explicit enter, exit, pause and resume hooks.',
        'A stack gives pause menus, modals and dialogue overlays for free: push to open, pop to return.',
        'Only the top (or non-blocked) scenes update and receive input; render from the lowest visible scene upward.',
        'Queue transitions and apply them at a safe point; load assets behind a loading overlay.',
        'Practice drill: add an Inventory scene that Pause can push, and predict the lifecycle log when the player opens and closes it (Pause:pause, Inventory:enter, Inventory:exit, Pause:resume).',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'game-object-pooling',
      title: 'Object Pooling & Avoiding Garbage-Collection Hitches',
      summary: 'Allocating bullets, particles and temporary vectors every frame creates garbage that the collector must eventually clean up, causing frame hitches. Pools recycle objects (or slots in typed arrays) so steady-state gameplay allocates nothing.',
      difficulty: 'Intermediate',
      minutes: 20,
      xp: 110,
      analogy:
        "Throwing away paper cups after every sip means someone eventually has to stop everything and empty the overflowing bins. A pool is a stack of reusable mugs: you take one, use it, rinse it and put it back. Nobody has to stop to take out the rubbish, because there isn't any.",
      intuition: [
        { title: 'Why GC hitches happen', body: "JavaScript (and C#, Java, Go) reclaim unused objects with a garbage collector. Allocation is fast, but collection work grows with allocation rate; a major collection can take several milliseconds, enough to miss a 16.7 ms (or 6.9 ms at 144 Hz) frame." },
        { title: 'Where garbage comes from', body: "`new` objects per entity per frame (vectors, bullets, events), array helpers that return new arrays (`filter`, `map`, `slice`, spread), closures created in hot loops, string concatenation for keys and temporary objects returned from math helpers." },
        { title: 'Object pools', body: "Pre-create N objects. acquire() pops a free one and resets it; release() pushes it back. Steady-state gameplay then allocates nothing: Tab 1 spawns 10,000 bullets but constructs only about 1,000, the most that were ever alive at once; after that warm-up it allocates nothing." },
        { title: 'Reset and stale handles', body: "A recycled object must be fully reset or it inherits the previous owner's state (velocity, target, owner ID). Code holding a reference after release now controls someone else's bullet: generation counters (as in ECS handles) detect this." },
        { title: 'Pools of slots, not objects', body: "In data-oriented code the pool is simply the dense SoA arrays from Module 3: spawning writes the next slot, killing swap-removes. There are no objects to collect at all." },
        { title: 'Measure first', body: "Use the browser's Performance and Memory panels (allocation sampling) to find who allocates in the hot path. Pool the few types that dominate; pooling everything adds complexity and bugs." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Pool lifecycle', body: 'Allocation happens only at load time (and on rare growth).', flow: ['load: prewarm N objects into the free list', 'spawn: acquire() → reset → generation++ → activate', 'update: iterate the active list only', 'despawn: release() → back to the free list', 'empty free list: grow (log it) or refuse / recycle the oldest'] },
        { kind: 'tip', title: 'Scratch objects', body: 'For temporary maths, keep module-level scratch vectors and write into them (out parameters), as in Module 2\'s production tab. Zero allocations, no pool bookkeeping.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'pooling_from_scratch.ts',
          explanation: 'Runnable TypeScript: a weapon firing 10,000 bullets over a fixed-step simulation, implemented with fresh allocations and with a pool. Assertions count constructor calls (10,000 vs the peak number alive), check that recycled bullets are fully reset, that generation counters reject a stale handle to a recycled bullet, and that in-place compaction keeps the active list without allocating new arrays.',
          code: raw`//  NAIVE: new Bullet() x 10,000 -> garbage -> GC pause (hitch)
//
//  POOL:   free list [b][b][b][b]  --acquire-->  active [b][b]  --release-->  back to free list
//          constructor calls = peak alive (~1,000), not 10,000
//  ---- handle = { index, generation }: a released + reused slot invalidates old handles ----
import assert from 'node:assert/strict';

let constructed = 0;
class Bullet {
  x = 0; y = 0; vx = 0; vy = 0; life = 0; owner = -1; generation = 0; active = false;
  constructor() { constructed++; }
  reset(x: number, y: number, vx: number, vy: number, owner: number) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.life = 1.0; this.owner = owner; this.active = true;
  }
}

class Pool {
  private free: Bullet[] = []; readonly all: Bullet[] = [];
  constructor(prewarm: number) { for (let i = 0; i < prewarm; i++) { const b = new Bullet(); this.all.push(b); this.free.push(b); } }
  acquire(): Bullet { let b = this.free.pop(); if (!b) { b = new Bullet(); this.all.push(b); } b.generation++; return b; }
  release(b: Bullet) { b.active = false; this.free.push(b); }
}

const DT = 1 / 60, SECONDS = 10, FIRE_PER_TICK = 1000 / 60;   // 1,000 bullets per second, 1 s lifetime

// naive: allocate every bullet, drop dead ones with filter (a new array every tick, too)
constructed = 0;
let alive: Bullet[] = [], peak = 0, fired = 0, owed = 0;
for (let t = 0; t < SECONDS * 60; t++) {
  for (owed += FIRE_PER_TICK; owed >= 1; owed--) { const b = new Bullet(); b.reset(0, 0, 500, 0, 1); alive.push(b); fired++; }
  for (const b of alive) { b.x += b.vx * DT; b.life -= DT; }
  alive = alive.filter((b) => b.life > 1e-9);
  peak = Math.max(peak, alive.length);
}
const naiveConstructed = constructed;
assert.ok(Math.abs(fired - 10_000) <= 1 && naiveConstructed === fired);

// pooled: prewarm, recycle, compact in place
constructed = 0;
const pool = new Pool(100);
const active: Bullet[] = []; owed = 0; let peakPooled = 0;
for (let t = 0; t < SECONDS * 60; t++) {
  for (owed += FIRE_PER_TICK; owed >= 1; owed--) { const b = pool.acquire(); b.reset(0, 0, 500, 0, 1); active.push(b); }
  peakPooled = Math.max(peakPooled, active.length);             // most bullets alive at once
  let w = 0;
  for (let r = 0; r < active.length; r++) {                     // in-place compaction: no new arrays
    const b = active[r]; b.x += b.vx * DT; b.life -= DT;
    if (b.life > 1e-9) active[w++] = b; else pool.release(b);
  }
  active.length = w;
}
assert.ok(constructed <= peakPooled && constructed * 9 < naiveConstructed);       // ~10% of the allocations, then zero
assert.equal(pool.all.length, constructed);

// recycled objects are fully reset
const old = pool.acquire(); old.reset(5, 5, 1, 1, 42); old.life = 0.1; pool.release(old);
const reused = pool.acquire(); reused.reset(0, 0, 0, 0, 7);
assert.equal(reused, old);                                       // same object, recycled
assert.deepEqual([reused.owner, reused.life, reused.vx], [7, 1, 0]);

// stale handle detection with generations
const handle = { obj: reused, gen: reused.generation };
pool.release(reused); const someoneElse = pool.acquire();
assert.equal(someoneElse, reused);
assert.notEqual(handle.gen, handle.obj.generation);              // old handle is now detectably stale
console.log('bullets fired', fired, '| constructors naive', naiveConstructed, 'pooled', constructed, '| peak alive', peak);`,
        },
        production: {
          language: 'ts',
          filename: 'pool.ts',
          explanation: 'Production engine pattern: a generic typed pool with a factory and reset callback, prewarming, an explicit growth policy with a warning hook, double-release detection, generation-checked handles packed into a single number, and an allocation-free iteration over active items via a dense index array with swap-remove.',
          code: raw`export interface PoolOptions<T> {
  create: () => T;
  reset: (item: T) => void;               // must clear EVERY field a previous user could have set
  prewarm: number;
  maxSize: number;                        // hard cap: refuse (or recycle) instead of growing forever
  onGrow?: (newSize: number) => void;     // log growth: it means prewarm is too small
}

/** Handle = (generation << 20) | index : a released + reacquired slot invalidates old handles. */
export class Pool<T> {
  private items: T[] = []; private gen: number[] = []; private live: Uint8Array;
  private free: number[] = [];
  private dense: Int32Array; private denseOf: Int32Array; private count = 0;

  constructor(private o: PoolOptions<T>) {
    this.live = new Uint8Array(o.maxSize);
    this.dense = new Int32Array(o.maxSize); this.denseOf = new Int32Array(o.maxSize).fill(-1);
    for (let i = 0; i < o.prewarm; i++) this.grow();
  }
  private grow(): number {
    const i = this.items.length;
    this.items.push(this.o.create()); this.gen.push(0); this.free.push(i);
    return i;
  }

  acquire(): number {
    if (this.free.length === 0) {
      if (this.items.length >= this.o.maxSize) return -1;   // caller decides: skip the effect
      this.grow(); this.o.onGrow?.(this.items.length);
    }
    const i = this.free.pop()!;
    this.o.reset(this.items[i]);
    this.live[i] = 1;
    this.dense[this.count] = i; this.denseOf[i] = this.count++;
    return ((this.gen[i] & 0x7ff) << 20) | i;
  }

  get(handle: number): T | undefined {
    const i = handle & 0xfffff;
    return this.live[i] && (this.gen[i] & 0x7ff) === handle >>> 20 ? this.items[i] : undefined;
  }

  release(handle: number) {
    const i = handle & 0xfffff;
    if (!this.get(handle)) throw new Error('Pool: double release or stale handle ' + handle);
    this.live[i] = 0; this.gen[i]++;
    const at = this.denseOf[i], last = this.dense[--this.count];   // swap-remove from the active list
    this.dense[at] = last; this.denseOf[last] = at; this.denseOf[i] = -1;
    this.free.push(i);
  }

  /** Iterate active items without allocating. Releasing inside fn is not allowed: collect handles first. */
  forEachActive(fn: (item: T, index: number) => void) {
    for (let k = 0; k < this.count; k++) fn(this.items[this.dense[k]], this.dense[k]);
  }
  get activeCount() { return this.count; }
}`,
        },
        bug: {
          explanation:
            'This update allocates three new objects per enemy per frame (two vectors from helpers and one array from filter). At 500 enemies and 60 FPS that is 90,000 short-lived objects per second, and the garbage collector periodically stops the game to reclaim them, causing visible stutter. Reuse scratch vectors with out-parameters and compact arrays in place.',
          buggy: {
            language: 'ts',
            filename: 'enemies.ts',
            code: raw`// ❌ Per-frame allocation: new vectors and a new array every tick -> GC stutter
function updateEnemies(enemies: Enemy[], player: Vec2, dt: number): Enemy[] {
  for (const e of enemies) {
    const toPlayer = sub(player, e.pos);              // allocates a Vec2
    const step = scale(normalize(toPlayer), e.speed * dt);   // allocates two more
    e.pos = add(e.pos, step);                         // and another
  }
  return enemies.filter((e) => e.hp > 0);             // a new array every frame
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'enemies.ts',
            code: raw`// ✅ Zero allocations: scratch vectors, in-place maths, in-place compaction
const tmp = { x: 0, y: 0 };
function updateEnemies(enemies: Enemy[], player: Vec2, dt: number): void {
  let w = 0;
  for (let r = 0; r < enemies.length; r++) {
    const e = enemies[r];
    tmp.x = player.x - e.pos.x; tmp.y = player.y - e.pos.y;
    const len = Math.hypot(tmp.x, tmp.y) || 1;
    e.pos.x += (tmp.x / len) * e.speed * dt;
    e.pos.y += (tmp.y / len) * e.speed * dt;
    if (e.hp > 0) enemies[w++] = e; else enemyPool.release(e);
  }
  enemies.length = w;
}`,
          },
        },
      },
      takeaways: [
        'Allocation in hot loops creates garbage; collection pauses cause frame hitches.',
        'Pools recycle objects: steady-state gameplay allocates nothing after prewarming.',
        'Reset every field on acquire and use generation-checked handles to catch stale references.',
        'Prefer scratch objects, out-parameters, in-place compaction and SoA slots; measure allocations with a profiler.',
        'Practice drill: change Tab 1\'s fire rate to 3,000 bullets per second and predict the pooled constructor count (about the peak alive, ~3,000) versus naive (30,000).',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'game-save-narrative',
      title: 'Save/Load Serialization & Flag-Driven Branching Dialogue',
      summary: 'Persisting game state safely (plain data, stable IDs instead of object references, versioned saves with migrations, checksums and crash-safe writes) and building branching dialogue and visual-novel stories as data-driven state machines whose conditions and effects read and write story flags.',
      difficulty: 'Advanced',
      minutes: 26,
      xp: 140,
      analogy:
        "A save file is a photograph of the game, not the game itself. You do not photograph the actors' brains; you write down where everyone stands, what they hold and which scenes have happened, so the stage crew can rebuild the scene exactly. A branching story is a choose-your-own-adventure book whose pages check a notebook of facts (\"did you spare the guard?\") before deciding which paragraphs and choices to show you.",
      intuition: [
        { title: 'Save data, not objects', body: "Runtime objects have methods, caches, cyclic references, Maps and GPU handles. A save is a plain data structure (a DTO) containing only what is needed to rebuild: positions, inventories, quest states and flags. JSON.stringify silently turns a Map into {} and throws on cycles." },
        { title: 'Stable IDs', body: "Refer to other things by ID (entity 'chest_17', item 'potion'), never by object reference or array index. On load, rebuild objects first, then resolve IDs to references." },
        { title: 'Versions and migrations', body: "Every save has a version number. When the format changes, write a migration from v(n) to v(n+1) and run them in order on load. Players' old saves keep working through every update." },
        { title: 'Integrity and crash safety', body: "Store a checksum to detect corruption. Write to a temporary slot and swap only after the write succeeded (or alternate two slots), so a crash or a closed tab mid-save never destroys the last good save." },
        { title: 'Dialogue as a graph', body: "Nodes hold a speaker, a line and choices. Choices have conditions (flags.metGuard && gold >= 10) and effects (set flags, change affinity, give items), and point to the next node. The runtime is a small state machine: current node plus flags." },
        { title: 'Save mid-conversation', body: "Because dialogue state is just a node ID and flags, it saves and loads like everything else, and writers can edit the story as data (Ink, Yarn Spinner and Ren'Py work on the same principle)." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Save and load pipeline', body: 'Serialization is a translation between runtime objects and plain versioned data.', flow: ['world → toSaveData() (plain JSON, stable IDs)', 'add version + checksum', 'write temp slot → verify → swap with main slot', 'load: verify checksum → run migrations v1 → vN', 'rebuild objects → resolve IDs → resume dialogue node'] },
        { kind: 'security', title: 'Never trust a save file', body: 'Players edit saves and share them. Validate every field (types, ranges, known IDs) on load, never eval content from it, and keep anything that matters for fairness (online currencies, rankings) on the server.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'save_and_dialogue.ts',
          explanation: 'Runnable TypeScript: a save system that converts runtime state (with a Map inventory and object references) into plain data with stable IDs, adds a version and FNV-1a checksum, migrates a v1 save to v3 and detects tampering. Then a flag-driven dialogue graph is played along two branches, saved mid-conversation, reloaded and continued to the same ending. All asserted.',
          code: raw`//  SAVE                                         DIALOGUE GRAPH (conditions read flags, effects write them)
//
//   runtime objects --toSave()--> { version, data, checksum }      [gate] --pay 10 gold (gold>=10)--> [inside]
//   load: checksum ok? -> migrate v1 -> v2 -> v3 -> rebuild        [gate] --"I'm the captain's friend"
//   refs saved as IDs ('chest_1'), Map saved as [key, value][]          (flags.metCaptain)--> [inside]
//   ---- dialogue state = { node, flags }: saves like any other data ----
import assert from 'node:assert/strict';

const fnv1a = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };

// ---------- runtime state (not directly serialisable) ----------
type Chest = { id: string; opened: boolean };
const chest: Chest = { id: 'chest_1', opened: true };
const player = { name: 'Ada', gold: 25, inventory: new Map([['potion', 3], ['key', 1]]), lastOpened: chest as Chest | null };
assert.equal(JSON.stringify({ inv: player.inventory }), '{"inv":{}}');        // the silent Map trap

// ---------- save / load ----------
type SaveV3 = { version: 3; name: string; gold: number; inventory: [string, number][]; lastOpenedId: string | null; flags: Record<string, boolean>; dialogue: string | null };
function toSave(flags: Record<string, boolean>, dialogue: string | null): string {
  const data: SaveV3 = { version: 3, name: player.name, gold: player.gold, inventory: [...player.inventory].sort(),
    lastOpenedId: player.lastOpened?.id ?? null, flags, dialogue };
  const body = JSON.stringify(data);
  return JSON.stringify({ body, checksum: fnv1a(body) });
}
const migrations: Record<number, (d: any) => any> = {
  1: (d) => ({ ...d, version: 2, inventory: Object.entries(d.items ?? {}), items: undefined }),   // v1 stored items as an object
  2: (d) => ({ ...d, version: 3, flags: d.flags ?? {}, dialogue: null }),                         // v3 added story state
};
function load(file: string): SaveV3 {
  const { body, checksum } = JSON.parse(file);
  if (fnv1a(body) !== checksum) throw new Error('corrupt save');
  let d = JSON.parse(body);
  while (d.version < 3) d = migrations[d.version](d);
  if (typeof d.gold !== 'number' || d.gold < 0) throw new Error('invalid gold');
  return d as SaveV3;
}

const saved = load(toSave({}, null));
assert.deepEqual(saved.inventory, [['key', 1], ['potion', 3]]);
assert.equal(saved.lastOpenedId, 'chest_1');                                    // reference saved as a stable ID
const v1Body = JSON.stringify({ version: 1, name: 'Old', gold: 5, items: { sword: 1 }, lastOpenedId: null });
const migrated = load(JSON.stringify({ body: v1Body, checksum: fnv1a(v1Body) }));
assert.deepEqual([migrated.version, migrated.inventory, migrated.flags, migrated.dialogue], [3, [['sword', 1]], {}, null]);
const tampered = JSON.parse(toSave({}, null)); tampered.body = tampered.body.replace('"gold":25', '"gold":99999');
assert.throws(() => load(JSON.stringify(tampered)), /corrupt/);

// ---------- dialogue graph ----------
type State = { gold: number; flags: Record<string, boolean> };
type Choice = { text: string; to: string; if?: (s: State) => boolean; do?: (s: State) => void };
const story: Record<string, { line: string; choices: Choice[] }> = {
  gate: { line: 'Guard: Halt. Ten gold, or turn back.', choices: [
    { text: 'Pay 10 gold', to: 'inside', if: (s) => s.gold >= 10, do: (s) => { s.gold -= 10; s.flags.paidGuard = true; } },
    { text: "I'm the captain's friend.", to: 'inside', if: (s) => !!s.flags.metCaptain, do: (s) => { s.flags.bluffed = true; } },
    { text: 'Leave', to: 'road' } ] },
  inside: { line: 'You step into the city.', choices: [{ text: 'Find the tavern', to: 'tavern' }] },
  tavern: { line: '', choices: [] },
  road: { line: 'You walk back down the road.', choices: [] },
};
const options = (node: string, s: State) => story[node].choices.filter((c) => !c.if || c.if(s)).map((c) => c.text);
function choose(node: string, s: State, text: string) { const c = story[node].choices.find((x) => x.text === text && (!x.if || x.if(s)))!; c.do?.(s); return c.to; }

const poor: State = { gold: 5, flags: { metCaptain: true } };
assert.deepEqual(options('gate', poor), ["I'm the captain's friend.", 'Leave']);   // cannot pay, can bluff
const rich: State = { gold: 25, flags: {} };
assert.deepEqual(options('gate', rich), ['Pay 10 gold', 'Leave']);

// play, save mid-conversation, reload, continue
let node = choose('gate', rich, 'Pay 10 gold');
player.gold = rich.gold;
const file = toSave(rich.flags, node);
const restored = load(file);
const resumed: State = { gold: restored.gold, flags: restored.flags };
node = choose(restored.dialogue!, resumed, 'Find the tavern');
assert.deepEqual([node, resumed.gold, resumed.flags.paidGuard], ['tavern', 15, true]);
console.log('save bytes', file.length, '| migrated v1 ->', migrated.version, '| poor player options', options('gate', poor).join(' / '), '| resumed at', node);`,
        },
        production: {
          language: 'ts',
          filename: 'save_manager.ts',
          explanation: 'Production engine pattern for browser games: an async SaveManager storing slots in IndexedDB with a two-phase write (write the new save under a temp key, read it back and verify its checksum, then promote it), a SHA-256 checksum via Web Crypto, an ordered migration chain, schema validation hooks and an autosave throttle that never saves during unsafe moments such as mid-combat.',
          code: raw`export interface SaveEnvelope { version: number; savedAt: string; checksum: string; body: string }
type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

const DB = 'nexus-saves', STORE = 'slots';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode), req = run(t.objectStore(STORE));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
  });
}
async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export class SaveManager<T extends Record<string, unknown>> {
  private lastAutosave = 0;
  constructor(
    readonly currentVersion: number,
    private migrations: Record<number, Migration>,          // migrations[n] upgrades n -> n + 1
    private validate: (data: unknown) => data is T,
  ) {}

  async save(slot: string, data: T): Promise<void> {
    const db = await openDb();
    const body = JSON.stringify(data);
    const env: SaveEnvelope = { version: this.currentVersion, savedAt: new Date().toISOString(), checksum: await sha256(body), body };
    await tx(db, 'readwrite', (s) => s.put(env, slot + ':tmp'));          // phase 1: temp key
    const check = await tx<SaveEnvelope>(db, 'readonly', (s) => s.get(slot + ':tmp'));
    if (!check || (await sha256(check.body)) !== env.checksum) throw new Error('save verification failed');
    await tx(db, 'readwrite', (s) => s.put(check, slot));                 // phase 2: promote
    db.close();
  }

  async load(slot: string): Promise<T | null> {
    const db = await openDb();
    const env = await tx<SaveEnvelope | undefined>(db, 'readonly', (s) => s.get(slot));
    db.close();
    if (!env) return null;
    if ((await sha256(env.body)) !== env.checksum) throw new Error('save is corrupt');
    if (env.version > this.currentVersion) throw new Error('save is from a newer game version');
    let data = JSON.parse(env.body) as Record<string, unknown>;
    for (let v = env.version; v < this.currentVersion; v++) {
      const m = this.migrations[v];
      if (!m) throw new Error('no migration from v' + v);
      data = m(data);
    }
    if (!this.validate(data)) throw new Error('save failed validation');
    return data;
  }

  /** Autosave at most every intervalMs, and only when the game says it is a safe moment. */
  async maybeAutosave(nowMs: number, isSafeMoment: boolean, snapshot: () => T, intervalMs = 60_000) {
    if (!isSafeMoment || nowMs - this.lastAutosave < intervalMs) return false;
    this.lastAutosave = nowMs;
    await this.save('autosave', snapshot());
    return true;
  }
}`,
        },
        bug: {
          explanation:
            'Serialising runtime objects directly looks fine but silently loses data: JSON.stringify turns a Map into {} and a Set into {}, drops class identity, and throws on cyclic references (a quest that points at the player who points back at the quest). Map runtime state to a plain, versioned DTO that uses arrays and stable IDs.',
          buggy: {
            language: 'ts',
            filename: 'save.ts',
            code: raw`// ❌ Raw objects: the Map inventory saves as {}, and player <-> quest cycles throw
function saveGame(player: Player) {
  localStorage.setItem('save', JSON.stringify(player));   // inventory: Map, activeQuest.owner === player
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'save.ts',
            code: raw`// ✅ Explicit, versioned DTO: arrays instead of Maps, IDs instead of references
function saveGame(player: Player) {
  const dto = {
    version: 3,
    name: player.name,
    inventory: [...player.inventory.entries()],            // Map -> [key, value][]
    activeQuestId: player.activeQuest?.id ?? null,         // reference -> stable ID
    flags: { ...player.flags },
  };
  localStorage.setItem('save', JSON.stringify(dto));
}`,
          },
        },
      },
      takeaways: [
        'Save plain data (DTOs) with stable IDs; never serialise live objects, Maps or cycles directly.',
        'Version every save and migrate step by step on load; validate fields and verify a checksum.',
        'Write saves crash-safely (temp slot, verify, promote) and autosave only at safe moments.',
        'Branching dialogue is a graph whose choices have conditions and effects on flags; its state saves like any other data.',
        'Practice drill: add a v3 → v4 migration to Tab 1 that renames the flag paidGuard to guardBribed, and assert an old save loads with the new flag name.',
      ],
    },
  ],
};
