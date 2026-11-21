import type { Module } from '../../types';

const raw = String.raw;

export const gameLoopModule: Module = {
  id: 'game-core',
  title: 'The Game Loop & Fixed Timestep',
  level: 'Scratch',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'game-loop-variable-dt',
      title: 'Anatomy of a Game Loop & Why Variable dt Breaks Physics',
      summary: 'Every game is a loop: read input, update the world, draw it. Learn why scaling updates by a variable frame time makes physics depend on the display\'s refresh rate and explode on lag spikes.',
      difficulty: 'Scratch',
      minutes: 18,
      xp: 80,
      analogy:
        "A game loop is a flip-book animator. For every page (frame) they look at what the player is pressing, move every character a little, and draw the page. If the animator moves characters by \"one step per page\", a fast flipper (144 Hz) sees everything run 2.4× faster than a slow one (60 Hz). If they instead move characters \"by how long the last page took\", a page that took half a second (a lag spike) makes a character jump straight through the floor.",
      intuition: [
        { title: 'The loop', body: "`while (running) { input(); update(dt); render(); }`. In browsers the loop is driven by `requestAnimationFrame`, which calls you once per display refresh (60, 120, 144 Hz …) with a high-resolution timestamp." },
        { title: 'Frame-based movement is refresh-rate dependent', body: "`x += 5` per frame moves 300 px/s at 60 Hz and 720 px/s at 144 Hz. The first fix everyone reaches for is multiplying by the elapsed time: `x += speed * dt`." },
        { title: 'Variable dt is still not enough', body: "Integrating physics with whatever dt the frame happened to take gives different results at different rates: a jump apex at 60 Hz differs from 144 Hz because each step's discrete approximation differs. Players on faster displays literally jump differently." },
        { title: 'Lag spikes break collisions', body: "A 500 ms hitch (tab switch, GC pause, loading) turns into one gigantic step: an object falling at 800 px/s moves 400 px at once and passes straight through a 20 px platform without ever overlapping it." },
        { title: 'Separate update from render', body: "Rendering should happen once per display frame; simulation should advance in predictable steps. That separation is exactly what the fixed-timestep accumulator (next chapter) provides." },
        { title: 'Pause when hidden', body: "Browsers throttle or stop rAF in background tabs. When the page becomes visible again the first dt can be many seconds long, so always clamp dt and handle `visibilitychange`." },
      ],
      callouts: [
        { kind: 'architecture', title: 'One iteration of the loop', body: 'The same three phases run every frame; only how far the world advances varies.', flow: ['requestAnimationFrame(t)', 'dt = t − lastT (clamped)', 'read input state', 'update(dt): move, collide, animate', 'render(): draw current state', 'schedule next frame'] },
        { kind: 'tip', title: 'Use the lab', body: 'The 2D Engine Sandbox below (Physics & Hitboxes) runs physics at a fixed 120 Hz and shows how many physics "steps" ran each frame. Turn on Slow motion (0.25×) and the motion trail, then jump: the arc is identical no matter how fast your display refreshes.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'variable_dt_problems.ts',
          explanation: 'Runnable TypeScript: frame-based movement at 60 vs 144 Hz, a jump integrated with variable dt producing different apex heights per refresh rate, and a 500 ms lag spike that makes a falling body tunnel through a thin platform. Every number is asserted.',
          code: raw`//  SAME 1-SECOND JUMP, DIFFERENT DISPLAYS
//
//   60 Hz : |----|----|----|----|        apex A60
//   144 Hz: |-|-|-|-|-|-|-|-|-|-|        apex A144  (A60 != A144)
//   lag   : |-------------- 0.5 s --------------|   y jumps 400 px: through a 20 px floor
import assert from 'node:assert/strict';

// 1) frame-based movement: speed depends on the refresh rate
const pxPerSecondFrameBased = (hz: number) => 5 * hz;          // x += 5 every frame
assert.deepEqual([60, 144].map(pxPerSecondFrameBased), [300, 720]);

// 2) a jump integrated with semi-implicit Euler using the frame's dt
const GRAVITY = 1800, JUMP_V = 700;                          // px/s^2, px/s
function jumpApex(hz: number): number {
  const dt = 1 / hz;
  let y = 0, vy = JUMP_V, apex = 0;
  for (let i = 0; i < hz; i++) {                            // one second of frames
    vy -= GRAVITY * dt;
    y += vy * dt;
    apex = Math.max(apex, y);
  }
  return apex;
}
const exact = (JUMP_V * JUMP_V) / (2 * GRAVITY);              // v^2 / 2g = 136.11 px
const a60 = jumpApex(60), a144 = jumpApex(144);
assert.ok(Math.abs(exact - 136.111) < 0.001);
assert.ok(Math.abs(a60 - a144) > 3, 'apex differs by refresh rate: ' + a60.toFixed(2) + ' vs ' + a144.toFixed(2));
assert.ok(a60 < a144 && a144 < exact);                       // each rate is wrong by a different amount

// 3) tunnelling on a lag spike: a 20 px thick platform at y in [100, 120]
function fallsThrough(dt: number): boolean {
  let y = 0, vy = 800;                                        // falling down (y grows downward)
  const top = 100, bottom = 120;
  for (let t = 0; t < 1; t += dt) {
    const next = y + vy * dt;
    if (next >= top && next <= bottom) return false;          // landed: overlap detected this step
    if (y < top && next > bottom) return true;                // jumped over the platform entirely
    y = next;
  }
  return false;
}
assert.equal(fallsThrough(1 / 60), false);                    // 13.3 px per step: caught
assert.equal(fallsThrough(0.5), true);                        // 400 px in one step: tunnels
console.log('apex 60 Hz', a60.toFixed(2), '| 144 Hz', a144.toFixed(2), '| exact', exact.toFixed(2));`,
        },
        production: {
          language: 'ts',
          filename: 'loop.ts',
          explanation: 'Production browser game loop: requestAnimationFrame scheduling, high-resolution timestamps, a clamped dt, separate update and render phases, pausing on visibilitychange, and a clean stop function. The next chapter replaces update(dt) with a fixed-timestep accumulator.',
          code: raw`export interface Game {
  update(dt: number): void;          // advance the world by dt seconds
  render(): void;                    // draw the current state
}

const MAX_DT = 0.1;                  // never simulate more than 100 ms in one go

export function startLoop(game: Game): () => void {
  let last = performance.now();
  let rafId = 0;
  let running = true;

  const frame = (now: DOMHighResTimeStamp) => {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, MAX_DT);   // clamp: hitches can't explode the world
    last = now;
    game.update(dt);
    game.render();
    rafId = requestAnimationFrame(frame);
  };

  // background tabs throttle rAF; resume without a giant first dt
  const onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(rafId);
    } else {
      last = performance.now();
      rafId = requestAnimationFrame(frame);
    }
  };
  document.addEventListener('visibilitychange', onVisibility);
  rafId = requestAnimationFrame(frame);

  return () => {                     // stop: e.g. when leaving the game screen
    running = false;
    cancelAnimationFrame(rafId);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}`,
        },
        bug: {
          explanation:
            'Moving a fixed number of pixels per frame ties gameplay speed to the refresh rate: the same level is 2.4× faster on a 144 Hz monitor than on 60 Hz, and slows down whenever the frame rate drops. Scale motion by elapsed time (and, for physics, use a fixed timestep).',
          buggy: {
            language: 'ts',
            filename: 'player.ts',
            code: raw`// ❌ Pixels per frame: 300 px/s at 60 Hz, 720 px/s at 144 Hz
function update(input: Input) {
  if (input.right) player.x += 5;
  if (input.left) player.x -= 5;
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'player.ts',
            code: raw`// ✅ Pixels per second, scaled by the elapsed time
const SPEED = 300;                   // px/s, identical on every display
function update(input: Input, dt: number) {
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  player.x += dir * SPEED * dt;
}`,
          },
        },
      },
      takeaways: [
        'A game loop reads input, updates the world and renders, once per display frame.',
        'Per-frame movement depends on refresh rate; multiply by dt to fix speed.',
        'Variable-dt physics still differs between 60 Hz and 144 Hz and tunnels through thin objects on lag spikes.',
        'Clamp dt, pause on hidden tabs, and separate simulation steps from rendering.',
        'Practice drill: compute how far an object at 800 px/s moves in a 250 ms hitch (200 px) and the thickest platform it could tunnel through without collision checks between positions (just under 200 px).',
      ],
      labId: 'game-engine',
      labMode: 'physics',
    },

    // ------------------------------------------------------------------------
    {
      id: 'game-fixed-timestep',
      title: 'The Fixed Timestep Accumulator, Spiral-of-Death Clamping & Render Interpolation',
      summary: 'Run physics in constant steps no matter how fast or slow frames arrive, cap the catch-up work so the game never death-spirals, and interpolate between physics states for smooth rendering at any refresh rate.',
      difficulty: 'Beginner',
      minutes: 22,
      xp: 110,
      analogy:
        "The accumulator is a piggy bank of time. Each frame you drop in however much real time passed. Physics can only spend it in exact coins of 1/120 s: while you can afford a coin, you take a step. Leftover change stays in the bank for next frame. If someone drops in a whole week at once (a huge hitch), you refuse to spend more than a few coins, otherwise you'd spend so long counting coins that even more time piles up: the spiral of death.",
      intuition: [
        { title: 'Decouple simulation rate from display rate', body: "Pick a fixed step (for example 1/120 s). Each frame, add the elapsed time to an accumulator and run `while (acc >= STEP) { step(STEP); acc -= STEP; }`. Physics always sees exactly the same dt, so results are identical at 60, 120 or 144 Hz." },
        { title: 'Steps per frame vary', body: "At 60 Hz with a 120 Hz simulation, each frame runs 2 steps. At 144 Hz, most frames run 1 step and some run 0. That is fine: rendering shows the latest state, interpolated." },
        { title: 'The spiral of death', body: "If one simulation step costs more real time than it simulates (or a long hitch adds seconds to the accumulator), the next frame has even more catching up to do, which takes even longer… until the game freezes. Clamp the frame time (e.g. 250 ms) and cap steps per frame; drop the excess time." },
        { title: 'Render interpolation', body: "After stepping, `alpha = acc / STEP` (0–1) says how far we are between the previous and current physics states. Render `lerp(previous, current, alpha)`. Without it, a 144 Hz display shows motion that judders because physics positions only change at 120 Hz." },
        { title: 'Store previous state', body: "Before each step, copy the current position (and rotation) into a previous slot. Interpolation is cheap: one lerp per rendered object per frame." },
        { title: 'Choose the step deliberately', body: "60 Hz is common for gameplay logic, 120–240 Hz for tight platformers and stable stacking physics. The lab below uses 120 Hz. A smaller step is more accurate but costs more CPU per second." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Accumulator frame', body: 'Physics consumes time in fixed coins; rendering blends the last two states.', flow: ['frameTime = min(now − last, 0.25 s)', 'acc += frameTime', 'while acc ≥ STEP (max N): prev = curr; step(STEP); acc −= STEP', 'alpha = acc / STEP', 'render lerp(prev, curr, alpha)'] },
        { kind: 'tip', title: 'Use the lab', body: 'In the Physics & Hitboxes sandbox below, watch the "steps" counter: on a 60 Hz screen it shows 2 most frames, on 144 Hz mostly 1. Switch presets (Earth, Moon, Ice, Arcade) and enable the motion trail to see a perfectly repeatable arc.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'accumulator_from_scratch.ts',
          explanation: 'Runnable TypeScript: the same 2-second jump simulated through an accumulator at 60 Hz, 144 Hz and with irregular frame times produces bit-identical physics; a frame-time clamp and step cap keep an expensive frame from spiralling; and render interpolation produces the exact in-between position. All asserted.',
          code: raw`//  FIXED STEP 1/120 s, DISPLAY FRAMES OF ANY LENGTH
//
//   frame (16.7 ms @60Hz):  acc += 16.7  -> step step        (acc ~ 0)
//   frame ( 6.9 ms @144Hz): acc +=  6.9  -> (no step) / step  (acc carries over)
//   render: alpha = acc / STEP  ->  draw lerp(prev, curr, alpha)
//   hitch of 3 s: clamp to 0.25 s and at most 8 steps -> no spiral of death
//   same 240 steps at 60 Hz, 144 Hz or jittery frames -> identical state
import assert from 'node:assert/strict';

const STEP = 1 / 120, MAX_FRAME = 0.25, MAX_STEPS = 8;
type Body = { y: number; vy: number };
const step = (b: Body) => { b.vy -= 1800 * STEP; b.y = Math.max(0, b.y + b.vy * STEP); };

function simulate(frameTimes: number[], stopAfterSteps = Infinity) {
  const curr: Body = { y: 0, vy: 700 }, prev: Body = { ...curr };
  let acc = 0, steps = 0;
  for (const ft of frameTimes) {
    acc += Math.min(ft, MAX_FRAME);
    let n = 0;
    while (acc >= STEP && n < MAX_STEPS && steps < stopAfterSteps) { Object.assign(prev, curr); step(curr); acc -= STEP; n++; steps++; }
    if (n === MAX_STEPS) acc = 0;                       // drop time we could not afford
  }
  return { curr, prev, acc, steps };
}

// 2.1 s of frames at 60 Hz, 144 Hz and irregular frame times; compare the state after exactly 240 steps
const frames = (hz: number) => Array.from({ length: Math.round(hz * 2.1) }, () => 1 / hz);
const jitter = Array.from({ length: 300 }, (_, i) => [0.004, 0.011, 0.015, 0.0069][i % 4]);
const at60 = simulate(frames(60), 240), at144 = simulate(frames(144), 240), jittery = simulate(jitter, 240);
assert.deepEqual([at60.steps, at144.steps, jittery.steps], [240, 240, 240]);
assert.deepEqual(at60.curr, at144.curr);               // bit-identical physics on any display
assert.deepEqual(at60.curr, jittery.curr);
assert.equal(simulate(frames(60)).steps, 252);         // 2.1 s at 120 Hz = 252 steps
assert.ok(Math.abs(simulate(frames(144)).steps - 252) <= 1);   // float rounding may leave one step pending

// spiral of death: a 3-second hitch is clamped to 0.25 s and capped at 8 steps
const hitch = simulate([3.0]);
assert.equal(hitch.steps, MAX_STEPS);
assert.equal(hitch.acc, 0);

// render interpolation
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const prevY = 100, currY = 110, acc = STEP * 0.25;
assert.equal(lerp(prevY, currY, acc / STEP), 102.5);   // drawn a quarter of the way to the newest state
console.log('steps 60Hz/144Hz/jitter:', at60.steps, at144.steps, jittery.steps, '| hitch steps', hitch.steps);`,
        },
        production: {
          language: 'ts',
          filename: 'fixedLoop.ts',
          explanation: 'Production fixed-timestep loop: frame-time clamp, step cap with dropped remainder, previous/current state stored in Float32Arrays for cache-friendly interpolation of thousands of bodies, an alpha-based render, and debug counters for steps per frame.',
          code: raw`export interface FixedGame {
  count: number;                                   // number of bodies
  prevX: Float32Array; prevY: Float32Array;        // state before the last step
  currX: Float32Array; currY: Float32Array;        // state after the last step
  step(dt: number): void;                          // advances curr*, deterministic
  draw(x: Float32Array, y: Float32Array): void;    // renders interpolated positions
}

const STEP = 1 / 120;
const MAX_FRAME = 0.25;                            // clamp long hitches
const MAX_STEPS = 8;                               // spiral-of-death guard

export function runFixed(game: FixedGame, onStats?: (steps: number, alpha: number) => void) {
  const drawX = new Float32Array(game.count), drawY = new Float32Array(game.count);   // allocated once
  let last = performance.now(), acc = 0, raf = 0;

  const frame = (now: number) => {
    acc += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;

    let steps = 0;
    while (acc >= STEP && steps < MAX_STEPS) {
      game.prevX.set(game.currX);                  // fast memcpy of the whole array
      game.prevY.set(game.currY);
      game.step(STEP);
      acc -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS) acc = 0;              // too far behind: drop the debt instead of spiralling

    const alpha = acc / STEP;                      // 0..1 between prev and curr
    for (let i = 0; i < game.count; i++) {
      drawX[i] = game.prevX[i] + (game.currX[i] - game.prevX[i]) * alpha;
      drawY[i] = game.prevY[i] + (game.currY[i] - game.prevY[i]) * alpha;
    }
    game.draw(drawX, drawY);
    onStats?.(steps, alpha);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}`,
        },
        bug: {
          explanation:
            'Without a frame-time clamp or a step cap, returning from a background tab adds several seconds to the accumulator, so the next frame tries to run hundreds of physics steps; if that frame takes longer than the time it simulates, every following frame is even further behind and the game freezes (the spiral of death). Clamp the frame time and cap steps per frame.',
          buggy: {
            language: 'ts',
            filename: 'fixedLoop.ts',
            code: raw`// ❌ Unbounded catch-up: a 5 s pause = 600 steps in one frame, then worse
function frame(now: number) {
  acc += (now - last) / 1000;
  last = now;
  while (acc >= STEP) {           // no clamp, no cap
    world.step(STEP);
    acc -= STEP;
  }
  render(world);                  // and no interpolation: judder at 144 Hz
  requestAnimationFrame(frame);
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'fixedLoop.ts',
            code: raw`// ✅ Clamp, cap, drop the excess, interpolate
function frame(now: number) {
  acc += Math.min((now - last) / 1000, 0.25);
  last = now;
  let steps = 0;
  while (acc >= STEP && steps < 8) {
    world.savePrevious();
    world.step(STEP);
    acc -= STEP;
    steps++;
  }
  if (steps === 8) acc = 0;
  render(world, acc / STEP);      // alpha blends previous and current states
  requestAnimationFrame(frame);
}`,
          },
        },
      },
      takeaways: [
        'Accumulate real time and spend it in fixed steps: physics becomes identical at every refresh rate.',
        'Clamp frame time and cap steps per frame to prevent the spiral of death.',
        'Interpolate between previous and current states with alpha = acc / STEP for smooth rendering.',
        'Store previous/current state in typed arrays so copying and blending stay cheap.',
        'Practice drill: at a 60 Hz simulation on a 144 Hz display, how many physics steps run in one second (60) and in how many of the 144 frames does at least one step run (60)?',
      ],
      labId: 'game-engine',
      labMode: 'physics',
    },

    // ------------------------------------------------------------------------
    {
      id: 'game-determinism',
      title: 'Deterministic Simulation: Tick Counters, Seeded RNG & Replays',
      summary: 'Make the same inputs always produce the same game: count time in integer ticks instead of accumulating floats, use seeded random generators, fix iteration order, and verify with state checksums and replays.',
      difficulty: 'Intermediate',
      minutes: 20,
      xp: 110,
      analogy:
        "A deterministic simulation is a recipe that always produces the identical cake if you follow the same steps with the same ingredients. Accumulating time as a float is measuring flour with a slightly wrong cup and adding cup after cup: after thousands of cups the cake is different. A seeded random generator is a deck shuffled in a recorded order: replay the order and you get the same hands every time.",
      intuition: [
        { title: 'Why determinism matters', body: "Replays, ghost races, bug reproduction from input logs, lockstep and rollback multiplayer (Module 9) and automated tests all need the same inputs to produce bit-identical states." },
        { title: 'Count ticks, not seconds', body: "`elapsed += dt` accumulates rounding error: 0.1 added ten times is 0.9999999999999999, so an \"after 1 second\" check fires one step late, and 600 steps of 1/60 give 10.000000000000076. Keep an integer `tick` counter and derive time as `tick * STEP`; schedule events on tick numbers." },
        { title: 'Seed your randomness', body: "`Math.random()` cannot be seeded or replayed. Use a small seeded PRNG (mulberry32, xorshift, PCG) per simulation, store the seed, and never call it from rendering code, which runs a variable number of times." },
        { title: 'Order matters with floats', body: "Floating-point addition is not associative: `(a + b) + c` can differ from `a + (b + c)`. Iterate entities in a stable order (by id), and avoid summing in parallel or in hash-map order inside the simulation." },
        { title: 'Inputs are the only external data', body: "Record per-tick inputs (not timestamps); everything else must be derived from the initial state, the seed and those inputs. Rendering, audio and analytics must never write back into simulation state." },
        { title: 'Checksums catch divergence', body: "Hash the simulation state every N ticks (positions, velocities, RNG state). Replays and multiplayer peers compare checksums; the first mismatching tick pinpoints the bug." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Deterministic replay', body: 'Same seed + same per-tick inputs = same checksums.', flow: ['initial state + seed', 'tick n: read recorded input[n]', 'step(STEP) with seeded RNG, stable order', 'tick++ (integer)', 'checksum every 60 ticks', 'replay → compare checksums'] },
        { kind: 'tip', title: 'Use the lab', body: 'The sandbox below steps physics on a fixed 120 Hz tick. Jump from the same spot twice with the same timing and the motion-trail arcs overlap exactly, which is the visible face of a deterministic step function.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'determinism_from_scratch.ts',
          explanation: 'Runnable TypeScript: float time drift (an "after 1 s" timer firing a step late) versus an integer tick counter, a seeded mulberry32 PRNG reproducing exactly, non-associative float addition, and a record/replay of a small simulation verified with an FNV-1a checksum over its Float64Array state (and broken by Math.random). All asserted.',
          code: raw`//  TIME AS FLOATS vs TICKS
//
//   float: t += 1/60 (x 600) -> 10.000000000000076   (t === 10 never true)
//          t += 0.1  (x 10)  ->  0.9999999999999999  ("every 1 s" timer fires a tick late)
//   ticks: tick += 1 (x 600) -> 600 exactly           wave fires on tick 600
//   replay: seed 42 + inputs[0..599] --> checksum 0x....  (must match bit for bit)
import assert from 'node:assert/strict';

// 1) float accumulation drift
let t = 0;
for (let i = 0; i < 600; i++) t += 1 / 60;
assert.equal(t, 10.000000000000076);                 // not 10: equality checks on time fail
let s = 0, firedAtStep = -1;
for (let i = 1; i <= 20 && firedAtStep < 0; i++) { s += 0.1; if (s >= 1) firedAtStep = i; }
assert.equal(firedAtStep, 11);                        // "after 1 second" fires on step 11, not 10
let tick = 0;
for (let i = 0; i < 600; i++) tick++;
assert.equal(tick * (1 / 60) * 60, 600);
assert.equal(tick % 600, 0);                         // schedule on tick numbers instead
assert.notEqual((0.1 + 0.2) + 0.3, 0.1 + (0.2 + 0.3)); // float addition is not associative

// 2) seeded PRNG (mulberry32)
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const r1 = mulberry32(42), r2 = mulberry32(42);
const seq1 = Array.from({ length: 5 }, r1), seq2 = Array.from({ length: 5 }, r2);
assert.deepEqual(seq1, seq2);
assert.ok(seq1.every((x) => x >= 0 && x < 1));

// 3) record + replay with a state checksum
function fnv1a(state: Float64Array) {
  let h = 0x811c9dc5;
  for (const byte of new Uint8Array(state.buffer)) { h ^= byte; h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}
type Input = { left: boolean; right: boolean };
function run(seed: number, inputs: Input[], rand: () => number = mulberry32(seed)) {
  const s = new Float64Array(4);                     // x, vx, enemyX, score
  s[2] = 500;
  for (const inp of inputs) {                        // one input per tick
    s[1] = ((inp.right ? 1 : 0) - (inp.left ? 1 : 0)) * 300;
    s[0] += s[1] / 120;
    s[2] += (rand() - 0.5) * 4;                      // enemy wanders using the SEEDED rng
    if (Math.abs(s[0] - s[2]) < 10) s[3] += 1;
  }
  return fnv1a(s);
}
const inputs: Input[] = Array.from({ length: 600 }, (_, i) => ({ left: i % 50 < 10, right: i % 7 === 0 }));
assert.equal(run(42, inputs), run(42, inputs));       // replay reproduces bit-identical state
assert.notEqual(run(42, inputs), run(43, inputs));    // different seed, different game
assert.notEqual(run(42, inputs, Math.random), run(42, inputs, Math.random));   // unseeded = not replayable
console.log('float time after 600 frames', t, '| checksum', run(42, inputs).toString(16));`,
        },
        production: {
          language: 'ts',
          filename: 'deterministicSim.ts',
          explanation: 'Production deterministic simulation core: integer tick counter, tick-scheduled events, a seeded PRNG whose state is part of the saved state, entities updated in stable id order from typed arrays, per-tick input recording, and periodic checksums for replays and desync detection.',
          code: raw`export type TickInput = number;                     // bitmask: 1=left 2=right 4=jump 8=fire
export const STEP = 1 / 60;

export class Sim {
  tick = 0;
  private rngState: number;
  readonly x = new Float64Array(1024);
  readonly vx = new Float64Array(1024);
  count = 0;
  readonly inputLog: TickInput[] = [];               // replay = initial seed + this log
  readonly checksums = new Map<number, number>();

  constructor(readonly seed: number) { this.rngState = seed >>> 0; }

  random(): number {                                 // mulberry32, state saved with the game
    let a = (this.rngState = (this.rngState + 0x6d2b79f5) >>> 0);
    a = Math.imul(a ^ (a >>> 15), 1 | a);
    a = (a + Math.imul(a ^ (a >>> 7), 61 | a)) ^ a;
    return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
  }

  step(input: TickInput) {
    this.inputLog.push(input);
    const dir = ((input >> 1) & 1) - (input & 1);
    this.vx[0] = dir * 300;
    for (let i = 0; i < this.count; i++) {           // stable order: index = entity id
      if (i > 0) this.vx[i] += (this.random() - 0.5) * 10;
      this.x[i] += this.vx[i] * STEP;
    }
    if (this.tick % 600 === 0 && this.tick > 0) this.spawnWave();   // every 10 s, exactly
    this.tick++;
    if (this.tick % 60 === 0) this.checksums.set(this.tick, this.checksum());
  }

  private spawnWave() { for (let k = 0; k < 4 && this.count < 1024; k++) this.x[this.count++] = 800 + this.random() * 100; }

  checksum(): number {                               // FNV-1a over the live part of the state
    let h = 0x811c9dc5 ^ this.tick ^ this.rngState;
    const bytes = new Uint8Array(this.x.buffer, 0, this.count * 8);
    for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
}

// replay test: a recorded session must reproduce every checksum
export function verifyReplay(seed: number, log: TickInput[], expected: Map<number, number>) {
  const sim = new Sim(seed);
  sim.count = 1;
  for (const input of log) sim.step(input);
  for (const [t, sum] of expected) if (sim.checksums.get(t) !== sum) return { ok: false, firstBadTick: t };
  return { ok: true as const };
}`,
        },
        bug: {
          explanation:
            'The wave timer accumulates float seconds and enemies use Math.random(). Accumulated float time is never exact (600 × 1/60 = 10.000000000000076; 10 × 0.1 = 0.9999999999999999), so timers fire a tick early or late depending on the step and history, and the unseeded random movement makes replays and multiplayer peers diverge. Count integer ticks and use a seeded RNG stored in the simulation state.',
          buggy: {
            language: 'ts',
            filename: 'waves.ts',
            code: raw`// ❌ Float time drift + unseeded randomness: replays diverge
let elapsed = 0;
function step(dt: number) {
  elapsed += dt;
  if (elapsed >= 10) { spawnWave(); elapsed -= 10; }     // fires a tick late after rounding drift
  for (const e of enemies) e.x += (Math.random() - 0.5) * 10;   // different on every run
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'waves.ts',
            code: raw`// ✅ Integer ticks + seeded RNG that is part of the saved/replayed state
const WAVE_EVERY = 600;                                  // ticks (10 s at 60 Hz)
function step(sim: Sim) {
  if (sim.tick > 0 && sim.tick % WAVE_EVERY === 0) spawnWave(sim);
  for (const e of sim.enemiesById()) e.x += (sim.random() - 0.5) * 10;   // stable order, seeded
  sim.tick++;
}`,
          },
        },
      },
      takeaways: [
        'Determinism enables replays, rollback/lockstep netcode, reproducible bugs and tests.',
        'Count integer ticks and schedule on tick numbers; never accumulate float seconds for gameplay timing.',
        'Use a seeded PRNG stored in the simulation state; keep iteration order stable.',
        'Record per-tick inputs and compare state checksums to find the first diverging tick.',
        'Practice drill: in Tab 1, add up 1/120 for 1,200 iterations and check whether the result equals 10 (it does not), then rewrite the check with an integer tick counter.',
      ],
      labId: 'game-engine',
      labMode: 'physics',
    },
  ],
};
