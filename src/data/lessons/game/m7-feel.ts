import type { Module } from '../../types';

const raw = String.raw;

export const feelModule: Module = {
  id: 'game-feel',
  title: 'Input, Camera & Game Feel',
  level: 'Intermediate',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'game-input-buffering-coyote',
      title: 'Responsive Controls: Input Buffering, Coyote Time & Variable Jumps',
      summary: 'The invisible forgiveness that makes platformers feel fair: remembering a jump pressed slightly too early (input buffering), allowing a jump slightly after leaving a ledge (coyote time), and cutting the jump short when the button is released (variable jump height), all measured in fixed simulation time.',
      difficulty: 'Intermediate',
      minutes: 22,
      xp: 120,
      labId: 'game-engine',
      labMode: 'physics',
      analogy:
        "A good waiter does not refuse your order because you asked a moment before they reached the table; they remember it and bring it when they arrive (input buffering). Like the cartoon coyote who runs off a cliff and only falls once he looks down, a player who presses jump a few frames after leaving a ledge still gets the jump (coyote time). Holding the button longer is like pushing a swing harder: a quick tap gives a small hop, a long press a full jump.",
      intuition: [
        { title: 'Humans are late and early', body: "Reaction times vary by tens of milliseconds, and at 60 FPS a frame is only 16.7 ms. A rule that requires the press on exactly the right frame feels unfair even though it is technically correct. Good controls convert intent into action over a small window." },
        { title: 'Input buffering', body: "When jump is pressed, store a timer (for example 0.1 s). Each tick, if the timer is still running and the character can jump, perform the jump and clear the timer. In Tab 1 a press 3 ticks before landing is lost without a buffer and becomes a jump on the first grounded tick with one." },
        { title: 'Coyote time', body: "Each tick on the ground refills a coyote timer (for example 0.1 s); it counts down in the air. Jumping is allowed while grounded or while the timer is positive. In Tab 1 a press 4 ticks after running off a ledge falls to its death without coyote time and jumps with it." },
        { title: 'Variable jump height', body: "Give the full upward velocity on press. If the button is released while still rising, multiply the vertical velocity by a factor such as 0.5. Tab 1: a full hold reaches about 120 px, a quick tap about 41 px." },
        { title: 'Count in simulation time', body: "Store windows in seconds and decrement by the fixed dt (or count fixed ticks). Windows measured in rendered frames shrink on 144 Hz monitors and grow on 30 Hz ones." },
        { title: 'More feel tools', body: "Stronger gravity when falling (snappier arcs), a reduced gravity hang at the apex, a terminal fall speed, corner correction (nudge the player around a ceiling corner) and a short lockout after wall jumps. Celeste is the classic reference for how much of this a great platformer hides." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Jump decision each fixed tick', body: 'Input is sampled once per frame and consumed in fixed steps.', flow: ['pressed? → jumpBuffer = 0.1 s', 'grounded? → coyote = 0.1 s', 'jumpBuffer > 0 and (grounded or coyote > 0) → jump, clear both timers', 'released while rising → vy *= 0.5', 'integrate, collide, then timers −= dt'] },
        { kind: 'tip', title: 'Try it in the lab', body: 'In the physics sandbox, compare a fixed jump with a variable one and watch how a tap and a hold produce different arcs. Small windows of 80 to 150 ms are typically invisible to players but remove most "I pressed it!" complaints.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'platformer_feel.ts',
          explanation: 'Runnable TypeScript: a fixed-step (120 Hz) platformer character. The same scripted presses are replayed with and without the forgiveness rules, asserting that a buffered early press jumps on the landing tick, that coyote time turns a late ledge press into a jump instead of a fall, and that releasing early gives a much lower apex.',
          code: raw`//  INPUT BUFFER                         COYOTE TIME                     VARIABLE HEIGHT
//                                                                        hold  ___
//   press  .  .  land -> JUMP          ____ ledge                        tap  _   \__
//   (3 ticks early, buffered)              |  press 4 ticks late         /  \ /     \
//   no buffer: press lost, no jump         | -> still jumps (coyote)    /    v       \
//   ---- fixed dt = 1/120 s, windows = 0.1 s (12 ticks) ----
import assert from 'node:assert/strict';

const DT = 1 / 120, G = -2000, JUMP_V = 700, RUN = 200, LEDGE_X = 100;
type Rules = { buffer: number; coyote: number; variable: boolean };
type State = { x: number; y: number; vy: number; grounded: boolean; buf: number; coy: number; apex: number };

function simulate(rules: Rules, start: Partial<State>, ticks: number, pressAt: number[], releaseAt: number, runRight: boolean) {
  const s: State = { x: 0, y: 0, vy: 0, grounded: true, buf: 0, coy: 0, apex: 0, ...start };
  const log: string[] = [];
  for (let t = 0; t < ticks; t++) {
    const pressed = pressAt.includes(t), held = t < releaseAt;
    if (pressed) s.buf = rules.buffer;                       // remember the intent
    if (s.grounded) s.coy = rules.coyote;                    // refill while on the ground
    const canJump = s.grounded || s.coy > 0;
    if ((pressed || s.buf > 0) && canJump) {
      s.vy = JUMP_V; s.grounded = false; s.coy = 0; s.buf = 0; log.push('jump@' + t);
    }
    if (rules.variable && !held && s.vy > 0) s.vy *= 0.5;    // released while rising: cut
    s.vy += G * DT; s.y += s.vy * DT;                        // semi-implicit Euler
    if (runRight) s.x += RUN * DT;
    const floor = s.x < LEDGE_X ? 0 : -1000;                  // ground ends at x = 100
    if (s.y <= floor) { if (!s.grounded) log.push('land@' + t); s.y = floor; s.vy = 0; s.grounded = true; }
    else s.grounded = false;
    s.apex = Math.max(s.apex, s.y);
    s.buf = Math.max(0, s.buf - DT); s.coy = Math.max(0, s.coy - DT);
  }
  return { s, log };
}
const strict: Rules = { buffer: 0, coyote: 0, variable: false };
const kind: Rules = { buffer: 0.1, coyote: 0.1, variable: true };

// 1) falling from 50 px lands on tick 26; press jump on tick 23 (3 ticks early)
assert.deepEqual(simulate(strict, { y: 50, grounded: false }, 60, [], 999, false).log, ['land@26']);
assert.deepEqual(simulate(strict, { y: 50, grounded: false }, 60, [23], 999, false).log, ['land@26']);             // press lost
assert.deepEqual(simulate(kind, { y: 50, grounded: false }, 60, [23], 999, false).log, ['land@26', 'jump@27']);   // buffered

// 2) running off the ledge (leaves the ground on tick 5), press on tick 9
const fell = simulate(strict, { x: 90 }, 40, [9], 999, true);
assert.ok(fell.log.length === 0 && fell.s.y < -80 && fell.s.vy < 0);             // no jump: falling into the pit
assert.deepEqual(simulate(kind, { x: 90 }, 40, [9], 999, true).log, ['jump@9']);  // coyote jump

// 3) variable height: hold vs tap (released after 7 ticks)
const hold = simulate(kind, {}, 120, [0], 999, false).s.apex;
const tap = simulate(kind, {}, 120, [0], 7, false).s.apex;
assert.ok(Math.abs(hold - 119.58) < 0.01);        // discrete apex; continuous v^2 / 2g would be 122.5
assert.ok(tap < hold * 0.4);
console.log('buffered press -> jump on landing | coyote press -> jump | apex hold', hold.toFixed(1), 'tap', tap.toFixed(1));`,
        },
        production: {
          language: 'ts',
          filename: 'platformer_controller.ts',
          explanation: 'Production engine pattern: a platformer controller run in the fixed step, fed by an input system that latches presses between fixed ticks so a quick tap on a high-refresh frame is never missed. It implements jump buffering, coyote time, variable jump cut, fall-gravity and apex-hang multipliers, terminal velocity and tunable values in one data object designers can edit.',
          code: raw`export interface FeelTuning {
  runSpeed: number; jumpVelocity: number; gravity: number;
  fallGravityMultiplier: number;      // snappier descent
  apexHangThreshold: number;          // |vy| below this near the apex...
  apexGravityMultiplier: number;      // ...uses lighter gravity for a floaty top
  jumpCutMultiplier: number;          // vy *= this on early release
  coyoteTime: number; jumpBufferTime: number; maxFallSpeed: number;
}
export const DEFAULT_FEEL: FeelTuning = {
  runSpeed: 220, jumpVelocity: 720, gravity: 2200, fallGravityMultiplier: 1.6,
  apexHangThreshold: 60, apexGravityMultiplier: 0.5, jumpCutMultiplier: 0.5,
  coyoteTime: 0.1, jumpBufferTime: 0.12, maxFallSpeed: 1100,
};

/** Latches edges between fixed ticks: a press and release inside one render frame still counts. */
export class InputLatch {
  private pressedSinceTick = false; private releasedSinceTick = false; held = false; axisX = 0;
  onKey(down: boolean) {
    if (down && !this.held) this.pressedSinceTick = true;
    if (!down && this.held) this.releasedSinceTick = true;
    this.held = down;
  }
  consume() {
    const r = { pressed: this.pressedSinceTick, released: this.releasedSinceTick, held: this.held, axisX: this.axisX };
    this.pressedSinceTick = this.releasedSinceTick = false;
    return r;
  }
}

export class PlatformerController {
  vx = 0; vy = 0; grounded = false;
  private coyote = 0; private buffer = 0; private jumping = false;
  constructor(public feel: FeelTuning = DEFAULT_FEEL) {}

  /** Call from the fixed-step update with the consumed input for this tick. */
  step(dt: number, input: ReturnType<InputLatch['consume']>) {
    const f = this.feel;
    this.vx = input.axisX * f.runSpeed;

    if (input.pressed) this.buffer = f.jumpBufferTime;
    if (this.grounded) { this.coyote = f.coyoteTime; this.jumping = false; }

    if (this.buffer > 0 && (this.grounded || this.coyote > 0)) {
      this.vy = -f.jumpVelocity;                    // y down: negative is up
      this.buffer = 0; this.coyote = 0; this.grounded = false; this.jumping = true;
    }
    if (this.jumping && !input.held && this.vy < 0) {
      this.vy *= f.jumpCutMultiplier;               // variable jump height
      this.jumping = false;
    }

    let g = f.gravity;
    if (this.vy > 0) g *= f.fallGravityMultiplier;
    else if (Math.abs(this.vy) < f.apexHangThreshold && !this.grounded) g *= f.apexGravityMultiplier;
    this.vy = Math.min(this.vy + g * dt, f.maxFallSpeed);

    this.buffer = Math.max(0, this.buffer - dt);
    this.coyote = Math.max(0, this.coyote - dt);
    // the physics step (move-and-slide from Module 4) moves the body and sets this.grounded
  }
}`,
        },
        bug: {
          explanation:
            'Allowing a jump only while the collision system reports grounded means a press one or two frames after walking off a ledge does nothing, and the player falls even though they "obviously" pressed in time. Refill a coyote timer every grounded tick, let it count down in the air, and allow the jump while it is positive (and clear it on jump so it cannot double-jump).',
          buggy: {
            language: 'ts',
            filename: 'jump.ts',
            code: raw`// ❌ No coyote time: pressing 2 frames after leaving the ledge just falls
function tryJump(p: Player, pressed: boolean) {
  if (pressed && p.grounded) {
    p.vy = -JUMP_VELOCITY;
  }
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'jump.ts',
            code: raw`// ✅ Coyote time in simulation seconds (frame-rate independent)
const COYOTE_TIME = 0.1;
function tryJump(p: Player, pressed: boolean, dt: number) {
  if (p.grounded) p.coyote = COYOTE_TIME;
  if (pressed && (p.grounded || p.coyote > 0)) {
    p.vy = -JUMP_VELOCITY;
    p.coyote = 0;                      // one jump per ledge
  }
  p.coyote = Math.max(0, p.coyote - dt);
}`,
          },
        },
      },
      takeaways: [
        'Input buffering remembers a press for ~0.1 s and fires it when the action becomes possible.',
        'Coyote time allows jumping for ~0.1 s after leaving a ledge.',
        'Variable jump height cuts upward velocity on early release; extra fall gravity makes arcs snappier.',
        'Measure every window in fixed simulation time and latch input edges between ticks.',
        'Practice drill: in Tab 1, find the latest press tick that still coyote-jumps. You will get 17, one tick more than the 12-tick window (ticks 5–16) suggests, because 0.1 minus twelve steps of 1/120 leaves a tiny positive float. Fix it by counting integer ticks.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'game-camera-damping-juice',
      title: 'Camera Damping, Screen Shake & Hitstop',
      summary: 'Frame-rate independent smoothing with 1 − exp(−k·dt) instead of the classic per-frame lerp, trauma-based screen shake, hitstop freezes and camera deadzones: the "juice" that makes impacts feel heavy without breaking determinism.',
      difficulty: 'Intermediate',
      minutes: 22,
      xp: 120,
      labId: 'game-engine',
      labMode: 'physics',
      analogy:
        "A camera following the player is like a dog on a springy leash: it trails behind and catches up smoothly. The classic bug is to tie the leash to the number of steps the dog takes rather than to time, so a dog taking more, smaller steps (a 144 Hz monitor) keeps up much faster. Screen shake is like a drum: hit it and it rattles, then the rattle fades. Hitstop is the moment in a fighting film where everything freezes for a beat at the instant of impact.",
      intuition: [
        { title: 'The per-frame lerp bug', body: "`cam += (target − cam) * 0.1` every frame closes 10% of the gap per frame. After one second that is 60 steps at 60 Hz but 144 steps at 144 Hz, so the camera is stiffer on faster monitors. Tab 1 shows the two disagree measurably after one second." },
        { title: 'Exponential damping', body: "Closing a fraction of the gap continuously is exponential decay: gap(t) = gap₀·e^(−k·t). Per frame, use `cam += (target − cam) * (1 − exp(−k * dt))`. Any number of frames whose dt adds up to one second gives exactly the same result." },
        { title: 'Converting old tuning', body: "A per-frame factor f tuned at 60 Hz corresponds to k = −ln(1 − f)·60. For f = 0.1 that is k ≈ 6.32 per second. Or think in half-lives: k = ln 2 / halfLife." },
        { title: 'Trauma-based screen shake', body: "Hits add trauma (0..1, clamped). Shake offset = maxOffset · trauma² · noise(t), and trauma decays linearly over time. Squaring makes small hits subtle and big hits dramatic. Use smooth noise and a seeded generator; random per-frame jitter looks cheap and is not reproducible." },
        { title: 'Hitstop', body: "Freeze the simulation for 30–100 ms on a heavy impact by skipping fixed steps (while still rendering and reading input). Do it inside the fixed-step loop so that replays and netcode see the same frozen ticks." },
        { title: 'Deadzones and look-ahead', body: "Let the player move inside a central box without moving the camera, then follow. Offset the target in the direction of movement so the player sees more of where they are going." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Camera update (render rate is fine; it is presentation only)', body: 'The camera never feeds back into gameplay, so it can run per rendered frame with real dt.', flow: ['target = player position + look-ahead', 'apply deadzone', 'cam += (target − cam) · (1 − exp(−k·dt))', 'offset = maxShake · trauma² · noise(time)', 'trauma = max(0, trauma − decay·dt)'] },
        { kind: 'warning', title: 'Accessibility', body: 'Always offer an option to reduce or disable screen shake and flashes. Some players experience motion sickness, and photosensitive players can be harmed by intense flashing.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'camera_feel.ts',
          explanation: 'Runnable TypeScript: the per-frame lerp versus exponential damping simulated at 60 Hz, 144 Hz and with jittery frame times. Assertions prove the naive version depends on frame rate while 1 − exp(−k·dt) gives the exact analytic result at every rate, plus the f→k conversion, trauma-squared shake decay and a hitstop that freezes exactly the expected number of fixed ticks.',
          code: raw`//   per-frame lerp: cam += gap * 0.1            exponential: cam += gap * (1 - exp(-k * dt))
//
//   60 Hz  :  ----____  99.82 after 1 s         60 Hz :  99.7521
//   144 Hz :  --______  100.00 after 1 s        144 Hz:  99.7521   (identical: depends on time only)
//   jitter :  ??                                jitter:  99.7521
//   ---- trauma shake: offset = max * trauma^2 * noise, trauma decays 1 per second ----
import assert from 'node:assert/strict';

function follow(frameTimes: number[], step: (cam: number, target: number, dt: number) => number) {
  let cam = 0; for (const dt of frameTimes) cam = step(cam, 100, dt); return cam;
}
const frames = (hz: number) => Array.from({ length: hz }, () => 1 / hz);
const jitter = [0.004, 0.011, 0.015, 0.0069, 0.0131, 0.01];                    // sums to 0.06 s
const jitterSecond = Array.from({ length: 100 }, (_, i) => jitter[i % 6]).slice(0, 100);
const lerp = (cam: number, t: number) => cam + (t - cam) * 0.1;                 // ignores dt
const K = 6;
const damp = (cam: number, t: number, dt: number) => cam + (t - cam) * (1 - Math.exp(-K * dt));

const n60 = follow(frames(60), lerp), n144 = follow(frames(144), lerp);
assert.ok(Math.abs(n60 - n144) > 0.15);                                          // frame-rate dependent
const exact = 100 * (1 - Math.exp(-K * 1));
assert.ok(Math.abs(follow(frames(60), damp) - exact) < 1e-9);
assert.ok(Math.abs(follow(frames(144), damp) - exact) < 1e-9);
const jitterTotal = jitterSecond.reduce((a, b) => a + b, 0);
assert.ok(Math.abs(follow(jitterSecond, damp) - 100 * (1 - Math.exp(-K * jitterTotal))) < 1e-9);

// converting a 60 Hz per-frame factor to a rate
const kFrom = (f: number, hz = 60) => -Math.log(1 - f) * hz;
assert.ok(Math.abs(kFrom(0.1) - 6.3216) < 1e-4);
const dampK = (k: number) => (cam: number, t: number, dt: number) => cam + (t - cam) * (1 - Math.exp(-k * dt));
assert.ok(Math.abs(follow(frames(60), dampK(kFrom(0.1))) - n60) < 1e-9);         // same feel at 60 Hz, now portable

// trauma shake
let trauma = Math.min(1, 0.6 + 0.6);                                              // two hits, clamped
for (let i = 0; i < 30; i++) trauma = Math.max(0, trauma - 1 * (1 / 60));         // 0.5 s of decay
assert.ok(Math.abs(trauma - 0.5) < 1e-9);
assert.ok(Math.abs(trauma * trauma - 0.25) < 1e-9);                               // shake is 25% of max now

// hitstop: freeze 0.05 s of simulation (6 ticks at 120 Hz) starting at tick 10
const STEP = 1 / 120;
let simTicks = 0, freeze = 0;
for (let frame = 0; frame < 30; frame++) {
  if (freeze > 0) { freeze -= STEP; continue; }                                   // render still runs; sim does not
  simTicks++;
  if (simTicks === 10) freeze = 0.05 - 1e-9;
}
assert.equal(simTicks, 24);
console.log('after 1 s  lerp@60', n60.toFixed(4), 'lerp@144', n144.toFixed(4), '| exp damping', exact.toFixed(4), 'at every rate | sim ticks with hitstop', simTicks);`,
        },
        production: {
          language: 'ts',
          filename: 'camera_controller.ts',
          explanation: 'Production engine pattern: a 2D camera controller with a deadzone, velocity look-ahead, exponential damping specified as a half-life, trauma-based shake driven by seeded smooth value noise (deterministic and replayable) and an accessibility scale, plus a Hitstop service the fixed-step loop queries before running each tick.',
          code: raw`const LN2 = Math.log(2);
/** Fraction of the remaining gap to close this frame, for a given half-life in seconds. */
export const dampFactor = (halfLife: number, dt: number) => 1 - Math.exp((-LN2 / halfLife) * dt);

// Seeded 1D value noise: smooth, deterministic, cheap
function hash(n: number) { n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
function noise1(x: number, seed: number) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);           // smoothstep fade
  return (hash(i + seed) * (1 - u) + hash(i + 1 + seed) * u) * 2 - 1;    // -1..1
}

export class Camera2D {
  x = 0; y = 0; shakeX = 0; shakeY = 0; angle = 0;
  private trauma = 0; private time = 0;
  constructor(
    public halfLife = 0.12, public deadzoneW = 60, public deadzoneH = 40, public lookAhead = 0.25,
    public maxShake = 18, public maxAngle = 0.05, public traumaDecay = 1.2, public shakeScale = 1 /* accessibility */,
  ) {}

  addTrauma(amount: number) { this.trauma = Math.min(1, this.trauma + amount); }

  update(dt: number, px: number, py: number, vx: number, vy: number) {
    this.time += dt;
    // look-ahead target
    let tx = px + vx * this.lookAhead, ty = py + vy * this.lookAhead;
    // deadzone: only follow the part of the offset outside the box
    const dx = tx - this.x, dy = ty - this.y, hw = this.deadzoneW / 2, hh = this.deadzoneH / 2;
    tx = Math.abs(dx) <= hw ? this.x : this.x + dx - Math.sign(dx) * hw;
    ty = Math.abs(dy) <= hh ? this.y : this.y + dy - Math.sign(dy) * hh;
    // frame-rate independent damping
    const a = dampFactor(this.halfLife, dt);
    this.x += (tx - this.x) * a; this.y += (ty - this.y) * a;
    // trauma^2 shake with smooth noise (presentation only: never feeds gameplay)
    const s = this.trauma * this.trauma * this.shakeScale, t = this.time * 25;
    this.shakeX = this.maxShake * s * noise1(t, 11);
    this.shakeY = this.maxShake * s * noise1(t, 23);
    this.angle = this.maxAngle * s * noise1(t, 37);
    this.trauma = Math.max(0, this.trauma - this.traumaDecay * dt);
  }
}

/** Queried by the fixed-step loop: while frozen, skip simulation ticks but keep rendering. */
export class Hitstop {
  private remaining = 0;
  trigger(seconds: number) { this.remaining = Math.max(this.remaining, seconds); }
  consumeTick(step: number): boolean {               // true -> skip this simulation tick
    if (this.remaining <= 0) return false;
    this.remaining -= step;
    return true;
  }
}`,
        },
        bug: {
          explanation:
            'A fixed lerp factor per frame closes a fixed fraction of the gap per frame, so the camera (or any smoothed value: UI bars, aim assist, audio fades) is noticeably stiffer at 144 Hz than at 60 Hz and sluggish when the frame rate drops. Use 1 − exp(−k·dt), which depends only on elapsed time; convert an existing factor f with k = −ln(1 − f)·60.',
          buggy: {
            language: 'ts',
            filename: 'camera.ts',
            code: raw`// ❌ Frame-rate dependent smoothing: stiffer on fast monitors, mushier when FPS drops
function updateCamera(cam: Vec2, target: Vec2) {
  cam.x += (target.x - cam.x) * 0.1;
  cam.y += (target.y - cam.y) * 0.1;
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'camera.ts',
            code: raw`// ✅ Exponential damping: identical motion at any frame rate
const K = -Math.log(1 - 0.1) * 60;          // keeps the old 60 Hz feel (about 6.32 per second)
function updateCamera(cam: Vec2, target: Vec2, dt: number) {
  const a = 1 - Math.exp(-K * dt);
  cam.x += (target.x - cam.x) * a;
  cam.y += (target.y - cam.y) * a;
}`,
          },
        },
      },
      takeaways: [
        'Never lerp by a constant factor per frame; use 1 − exp(−k·dt) (or a half-life).',
        'Convert old tuning with k = −ln(1 − f)·refreshRate so the feel is kept but becomes portable.',
        'Screen shake = maxOffset · trauma² · smooth noise, with trauma decaying over time and an accessibility scale.',
        'Hitstop skips fixed simulation ticks (render continues) so it stays deterministic.',
        'Practice drill: pick a camera half-life of 0.1 s, compute k = ln 2 / 0.1 ≈ 6.93, and use Tab 1 to confirm the gap halves after exactly 0.1 s at both 60 Hz (6 frames) and 120 Hz (12 frames).',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'game-event-bus-audio',
      title: 'Event Buses, Observers & Game Audio',
      summary: 'Decoupling gameplay from presentation with typed events (queued and delivered at a safe point in the frame), avoiding listener leaks, and building an audio layer that reacts to those events: voice limits and priorities, pitch variation, distance attenuation and music ducking with the Web Audio API.',
      difficulty: 'Intermediate',
      minutes: 22,
      xp: 110,
      analogy:
        "An event bus is a town noticeboard. The blacksmith does not need to know who cares that a sword is ready; he pins a note, and the knight, the tax collector and the town crier each read it. Audio is the town's band reacting to the notices, with a rule that no more than a few musicians can play the same tune at once, and that everyone plays more quietly when the mayor is speaking.",
      intuition: [
        { title: 'Why decouple', body: "If the combat code calls audio, particles, UI, achievements and analytics directly, every system depends on every other one. Emitting `enemyKilled` and letting other systems subscribe keeps gameplay code small and testable, and new reactions can be added without touching it." },
        { title: 'Immediate vs queued events', body: "Immediate dispatch runs handlers inside the emitter's call stack: a handler that destroys entities or emits more events can corrupt the loop that emitted it. Queuing events and flushing them at a fixed point (for example after the physics step) makes ordering predictable and safe." },
        { title: 'Listener leaks', body: "Every subscription must be removed when its owner is destroyed. Forgotten listeners keep dead objects alive, fire for entities that no longer exist and double up after scene reloads (two explosions sounds per hit). Return a disposer function from `on` and call it in the owner's destroy." },
        { title: 'Voices and priorities', body: "Hardware and mixers have limited voices, and 40 identical gunshots in one frame sound like noise. Limit instances per sound, give important sounds (dialogue, player damage) priority and steal the oldest, least important voice when full." },
        { title: 'Variation and space', body: "Randomise pitch slightly (±5%) and pick among several samples to avoid the machine-gun effect. Attenuate with distance (Web Audio's inverse model: gain = ref / (ref + rolloff·(d − ref))) and pan by position." },
        { title: 'Buses and ducking', body: "Route sounds through gain buses (master → music, sfx, voice). Duck the music bus with a short gain ramp when dialogue plays, and never change gains abruptly or you will hear clicks." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Event flow in a frame', body: 'Gameplay emits; presentation reacts at a safe point.', flow: ['fixed step: combat emits enemyKilled (queued)', 'after the step: bus.flush()', 'audio: play explosion (voice limit, pitch ±5%, distance gain)', 'VFX: spawn particles · UI: +100 score · achievements: count kills', 'dispose listeners when their owners are destroyed'] },
        { kind: 'tip', title: 'Unlock audio on a user gesture', body: 'Browsers start AudioContext suspended. Call `audioContext.resume()` from the first click or key press, typically on the title screen.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'event_bus_audio_from_scratch.ts',
          explanation: 'Runnable TypeScript: a typed event bus with queued delivery and disposers, asserting delivery order (including events emitted by handlers during a flush), that disposed listeners stop firing, then an audio voice pool that limits instances and steals by priority, Web Audio\'s inverse distance model and a seeded pitch variation range. All asserted.',
          code: raw`//  GAMEPLAY ---emit('enemyKilled')---> [ queue ] --flush() after physics--> audio / vfx / ui / achievements
//
//   on() returns a disposer  ->  dispose() on destroy  ->  no leaks, no double sounds after reload
//   VOICE POOL (max 4): full + higher priority -> steal oldest lowest-priority voice
//   ---- inverse distance: gain = ref / (ref + rolloff * (max(d, ref) - ref)) ----
import assert from 'node:assert/strict';

type Events = { enemyKilled: { id: number; x: number }; scoreChanged: { score: number } };
class EventBus<E extends Record<string, unknown>> {
  private handlers: { [K in keyof E]?: Array<(e: E[K]) => void> } = {};
  private queue: Array<{ type: keyof E; payload: unknown }> = [];
  on<K extends keyof E>(type: K, fn: (e: E[K]) => void): () => void {
    (this.handlers[type] ??= []).push(fn);
    return () => { const list = this.handlers[type]!; const i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); };
  }
  emit<K extends keyof E>(type: K, payload: E[K]) { this.queue.push({ type, payload }); }
  flush(maxRounds = 4) {
    for (let round = 0; round < maxRounds && this.queue.length; round++) {
      const batch = this.queue; this.queue = [];                 // events emitted now go to the next round
      for (const ev of batch) for (const fn of [...(this.handlers[ev.type] ?? [])]) (fn as (e: unknown) => void)(ev.payload);
    }
  }
}

const bus = new EventBus<Events>();
const log: string[] = [];
let score = 0;
bus.on('enemyKilled', (e) => { log.push('audio:boom#' + e.id); });
const disposeUi = bus.on('scoreChanged', (e) => { log.push('ui:' + e.score); });
bus.on('enemyKilled', (e) => { score += 100; log.push('score+100#' + e.id); bus.emit('scoreChanged', { score }); });

bus.emit('enemyKilled', { id: 1, x: 10 }); bus.emit('enemyKilled', { id: 2, x: 20 });
assert.deepEqual(log, []);                                        // nothing runs until the safe point
bus.flush();
assert.deepEqual(log, ['audio:boom#1', 'score+100#1', 'audio:boom#2', 'score+100#2', 'ui:100', 'ui:200']);
disposeUi();                                                      // UI screen destroyed
log.length = 0; bus.emit('scoreChanged', { score: 300 }); bus.flush();
assert.deepEqual(log, []);                                        // no leaked listener

// voice pool with priorities
type Voice = { sound: string; priority: number; startedAt: number };
class VoicePool {
  voices: Voice[] = [];
  constructor(readonly max: number, readonly maxPerSound: number) {}
  play(sound: string, priority: number, now: number): boolean {
    if (this.voices.filter((v) => v.sound === sound).length >= this.maxPerSound) return false;   // per-sound cap
    if (this.voices.length >= this.max) {
      const victim = [...this.voices].sort((a, b) => a.priority - b.priority || a.startedAt - b.startedAt)[0];
      if (victim.priority > priority) return false;               // everything playing is more important
      this.voices.splice(this.voices.indexOf(victim), 1);
    }
    this.voices.push({ sound, priority, startedAt: now });
    return true;
  }
}
const pool = new VoicePool(4, 2);
const results = [pool.play('step', 1, 0), pool.play('step', 1, 1), pool.play('step', 1, 2),   // 3rd step: per-sound cap
  pool.play('gun', 2, 3), pool.play('gun', 2, 4), pool.play('dialogue', 9, 5), pool.play('step', 0, 6)];
assert.deepEqual(results, [true, true, false, true, true, true, false]);
assert.deepEqual(pool.voices.map((v) => v.sound), ['step', 'gun', 'gun', 'dialogue']);   // oldest step was stolen

// distance attenuation (Web Audio PannerNode distanceModel 'inverse') and pitch variation
const inverseGain = (d: number, ref = 1, rolloff = 1) => ref / (ref + rolloff * (Math.max(d, ref) - ref));
assert.deepEqual([inverseGain(0.5), inverseGain(1), inverseGain(3), inverseGain(10, 2, 0.5)], [1, 1, 1 / 3, 2 / 6]);
let seed = 99;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const pitches = Array.from({ length: 1000 }, () => 1 + (rnd() * 2 - 1) * 0.05);
assert.ok(Math.min(...pitches) >= 0.95 && Math.max(...pitches) <= 1.05 && new Set(pitches).size > 900);
console.log('event order', log.length === 0 ? 'ok' : log, '| voices', pool.voices.map((v) => v.sound).join(','), '| gain at 3 m', inverseGain(3).toFixed(3));`,
        },
        production: {
          language: 'ts',
          filename: 'audio_manager.ts',
          explanation: 'Production engine pattern (Web Audio API): an AudioManager with master, music, sfx and voice gain buses, decoded buffers cached by name, per-sound voice limits with priority stealing, random sample and pitch variation, positional panners using the inverse distance model, click-free music ducking with gain ramps, unlocking on the first user gesture, and subscription to gameplay events through disposers.',
          code: raw`type SoundDef = { urls: string[]; bus: 'sfx' | 'voice'; maxVoices: number; priority: number; pitchJitter: number };
type ActiveVoice = { name: string; priority: number; started: number; src: AudioBufferSourceNode };

export class AudioManager {
  readonly ctx = new AudioContext();
  private master = this.ctx.createGain();
  private buses = { music: this.ctx.createGain(), sfx: this.ctx.createGain(), voice: this.ctx.createGain() };
  private buffers = new Map<string, AudioBuffer[]>();
  private active: ActiveVoice[] = [];
  private disposers: Array<() => void> = [];

  constructor(private defs: Record<string, SoundDef>, private maxVoices = 32) {
    for (const b of Object.values(this.buses)) b.connect(this.master);
    this.master.connect(this.ctx.destination);
    const unlock = () => { void this.ctx.resume(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
  }

  async load() {
    for (const [name, def] of Object.entries(this.defs)) {
      const decoded = await Promise.all(def.urls.map(async (u) => this.ctx.decodeAudioData(await (await fetch(u)).arrayBuffer())));
      this.buffers.set(name, decoded);
    }
  }

  play(name: string, pos?: { x: number; y: number; listenerX: number; listenerY: number }) {
    const def = this.defs[name], variants = this.buffers.get(name);
    if (!def || !variants) return;
    const now = this.ctx.currentTime;
    this.active = this.active.filter((v) => v.started + (v.src.buffer?.duration ?? 0) > now);   // drop finished voices
    if (this.active.filter((v) => v.name === name).length >= def.maxVoices) return;
    if (this.active.length >= this.maxVoices) {
      const victim = this.active.reduce((a, b) => (b.priority < a.priority || (b.priority === a.priority && b.started < a.started) ? b : a));
      if (victim.priority > def.priority) return;
      victim.src.stop(); this.active.splice(this.active.indexOf(victim), 1);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = variants[Math.floor(Math.random() * variants.length)];          // sample variation
    src.playbackRate.value = 1 + (Math.random() * 2 - 1) * def.pitchJitter;      // pitch variation
    let node: AudioNode = src;
    if (pos) {
      const panner = new PannerNode(this.ctx, { distanceModel: 'inverse', refDistance: 64, rolloffFactor: 1, panningModel: 'equalpower',
        positionX: pos.x - pos.listenerX, positionY: 0, positionZ: pos.y - pos.listenerY });
      node.connect(panner); node = panner;
    }
    node.connect(this.buses[def.bus]);
    src.start();
    this.active.push({ name, priority: def.priority, started: now, src });
  }

  /** Click-free ducking: ramp the music bus down while dialogue plays, then back up. */
  duckMusic(duration: number, level = 0.3, ramp = 0.15) {
    const g = this.buses.music.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(level, t + ramp);
    g.setValueAtTime(level, t + duration);
    g.linearRampToValueAtTime(1, t + duration + ramp);
  }

  /** Subscribe to gameplay events; every subscription is remembered so dispose() removes them all. */
  bind(bus: { on(type: string, fn: (e: any) => void): () => void }) {
    this.disposers.push(
      bus.on('enemyKilled', () => this.play('explosion')),
      bus.on('dialogueStarted', (e: { seconds: number }) => { this.play('dialogueBlip'); this.duckMusic(e.seconds); }),
    );
  }
  dispose() { for (const d of this.disposers) d(); this.disposers.length = 0; void this.ctx.close(); }
}`,
        },
        bug: {
          explanation:
            'The enemy subscribes to a global event when it spawns but never unsubscribes. After it dies, its handler keeps running (touching a destroyed object), it can never be garbage collected, and after a scene reload every handler is registered twice, so each hit plays two sounds. Keep the disposer returned by `on` and call it when the owner is destroyed.',
          buggy: {
            language: 'ts',
            filename: 'enemy.ts',
            code: raw`// ❌ Listener leak: handlers outlive the enemy and pile up on every scene reload
class Enemy {
  constructor(private bus: EventBus<GameEvents>) {
    bus.on('playerShouted', (e) => this.alert(e.x, e.y));
  }
  destroy() { world.remove(this); }
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'enemy.ts',
            code: raw`// ✅ Store disposers and run them in destroy()
class Enemy {
  private subs: Array<() => void> = [];
  constructor(private bus: EventBus<GameEvents>) {
    this.subs.push(bus.on('playerShouted', (e) => this.alert(e.x, e.y)));
  }
  destroy() {
    for (const off of this.subs) off();
    this.subs.length = 0;
    world.remove(this);
  }
}`,
          },
        },
      },
      takeaways: [
        'Emit gameplay events and let presentation systems subscribe: fewer dependencies, easier testing.',
        'Queue events and flush at a known point in the frame; handlers may emit more events safely.',
        'Every on() needs an off(): return disposers and call them on destroy to avoid leaks and doubled reactions.',
        'Audio: per-sound voice caps, priority stealing, pitch/sample variation, distance attenuation and ramped ducking.',
        'Practice drill: add a `bus.once()` helper to Tab 1 that disposes itself after the first call, and assert it fires exactly once across two flushes.',
      ],
    },
  ],
};
