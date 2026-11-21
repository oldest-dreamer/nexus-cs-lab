/**
 * Tiny 2D platformer physics: AABB vs AABB, axis-separated collision
 * resolution, fixed timestep. Pure functions + plain objects, no React.
 * Coordinates: world units (px), origin top-left, +y points DOWN.
 */

export const WORLD = { w: 960, h: 540 };
export const FIXED_DT = 1 / 120; // physics runs at 120 Hz regardless of display rate
export const MAX_FRAME = 0.25; // clamp after tab-switch stalls (spiral of death)

export interface AABB {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Platform extends AABB {
  id: string;
  /** Optional horizontal oscillation: x = baseX + sin(t·speed)·range */
  move?: { baseX: number; range: number; speed: number };
}

export interface Coin {
  x: number;
  y: number;
  r: number;
  taken: boolean;
}

export interface PhysicsParams {
  gravity: number; // px/s²
  jumpForce: number; // initial jump velocity, px/s
  friction: number; // 0..0.6: fraction of vx lost per 1/60 s on the ground with no input
  maxSpeed: number; // px/s
  moveAccel: number; // px/s²
  airControl: number; // 0..1 multiplier on accel while airborne
}

export const PRESETS: Record<string, PhysicsParams> = {
  Earth: { gravity: 1800, jumpForce: 700, friction: 0.2, maxSpeed: 320, moveAccel: 2600, airControl: 0.6 },
  Moon: { gravity: 420, jumpForce: 420, friction: 0.12, maxSpeed: 260, moveAccel: 1800, airControl: 0.8 },
  Ice: { gravity: 1800, jumpForce: 700, friction: 0.01, maxSpeed: 380, moveAccel: 900, airControl: 0.4 },
  Arcade: { gravity: 2600, jumpForce: 900, friction: 0.45, maxSpeed: 360, moveAccel: 5200, airControl: 1 },
};

export interface Player extends AABB {
  vx: number;
  vy: number;
  onGround: boolean;
  groundId: string | null;
  coyote: number; // seconds left where a jump is still allowed after leaving a ledge
  jumpBuffer: number; // seconds left where an early jump press is remembered
  facing: 1 | -1;
}

export interface InputState {
  left: boolean;
  right: boolean;
  jumpHeld: boolean;
  jumpPressed: boolean; // edge-triggered, consumed by step()
}

export type ContactSide = 'left' | 'right' | 'top' | 'bottom';
export interface Contact {
  side: ContactSide; // side of the PLAYER that touched
  platformId: string;
}

export const SPAWN = { x: 60, y: 380 };
export const COYOTE_TIME = 0.1;
export const JUMP_BUFFER = 0.12;
export const TERMINAL_VY = 1500;

export function makePlayer(): Player {
  return { x: SPAWN.x, y: SPAWN.y, w: 28, h: 40, vx: 0, vy: 0, onGround: false, groundId: null, coyote: 0, jumpBuffer: 0, facing: 1 };
}

export function makeLevel(): { platforms: Platform[]; coins: Coin[] } {
  const platforms: Platform[] = [
    { id: 'ground-a', x: 0, y: 500, w: 420, h: 40 },
    { id: 'ground-b', x: 520, y: 500, w: 440, h: 40 },
    { id: 'step-1', x: 170, y: 420, w: 110, h: 18 },
    { id: 'ledge-l', x: 40, y: 330, w: 130, h: 18 },
    { id: 'mover', x: 330, y: 360, w: 120, h: 18, move: { baseX: 330, range: 110, speed: 1.1 } },
    { id: 'mid', x: 560, y: 290, w: 150, h: 18 },
    { id: 'high-r', x: 780, y: 200, w: 140, h: 18 },
    { id: 'high-l', x: 140, y: 215, w: 160, h: 18 },
    { id: 'pillar', x: 740, y: 400, w: 34, h: 100 },
    { id: 'wall-l', x: -40, y: 0, w: 40, h: WORLD.h },
    { id: 'wall-r', x: WORLD.w, y: 0, w: 40, h: WORLD.h },
  ];
  const coins: Coin[] = [
    { x: 225, y: 390, r: 9, taken: false },
    { x: 100, y: 300, r: 9, taken: false },
    { x: 635, y: 260, r: 9, taken: false },
    { x: 850, y: 170, r: 9, taken: false },
    { x: 220, y: 185, r: 9, taken: false },
    { x: 470, y: 470, r: 9, taken: false },
  ];
  return { platforms, coins };
}

export const overlaps = (a: AABB, b: AABB) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Move platforms to their position at time t; returns per-platform dx for this step. */
export function updatePlatforms(platforms: Platform[], t: number): Map<string, number> {
  const dx = new Map<string, number>();
  for (const p of platforms) {
    if (!p.move) continue;
    const nx = p.move.baseX + Math.sin(t * p.move.speed) * p.move.range;
    dx.set(p.id, nx - p.x);
    p.x = nx;
  }
  return dx;
}

/**
 * Advance the player by one fixed step. Mutates `p`.
 * Order: input → forces → move X & resolve → move Y & resolve.
 */
export function stepPlayer(p: Player, input: InputState, params: PhysicsParams, dt: number, platforms: Platform[], platformDx: Map<string, number>): Contact[] {
  const contacts: Contact[] = [];

  // Ride moving platforms: carry the player by the platform's motion this step.
  if (p.onGround && p.groundId && platformDx.has(p.groundId)) p.x += platformDx.get(p.groundId)!;

  // --- timers (coyote time + jump buffering make controls feel fair)
  p.coyote = p.onGround ? COYOTE_TIME : Math.max(0, p.coyote - dt);
  if (input.jumpPressed) p.jumpBuffer = JUMP_BUFFER;
  else p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
  input.jumpPressed = false;

  // --- horizontal: accelerate with input, otherwise apply friction
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (dir !== 0) {
    p.facing = dir as 1 | -1;
    const accel = params.moveAccel * (p.onGround ? 1 : params.airControl);
    p.vx += dir * accel * dt;
    if (Math.sign(p.vx) !== dir && p.onGround) p.vx *= Math.pow(1 - Math.min(0.9, params.friction * 2), dt * 60); // skid on turn
    p.vx = Math.max(-params.maxSpeed, Math.min(params.maxSpeed, p.vx));
  } else {
    const k = p.onGround ? params.friction : 0.015; // a little air drag
    p.vx *= Math.pow(1 - k, dt * 60); // frame-rate independent decay
    if (Math.abs(p.vx) < 2) p.vx = 0;
  }

  // --- jump (buffered + coyote)
  if (p.jumpBuffer > 0 && p.coyote > 0) {
    p.vy = -params.jumpForce;
    p.jumpBuffer = 0;
    p.coyote = 0;
    p.onGround = false;
    p.groundId = null;
  }

  // --- gravity, with a stronger pull when jump is released early (variable jump height)
  const jumpCut = p.vy < 0 && !input.jumpHeld ? 2.2 : 1;
  p.vy = Math.min(TERMINAL_VY, p.vy + params.gravity * jumpCut * dt);

  // --- move X, resolve
  p.x += p.vx * dt;
  for (const plat of platforms) {
    if (!overlaps(p, plat)) continue;
    if (p.vx > 0 || (p.vx === 0 && p.x + p.w / 2 < plat.x + plat.w / 2)) {
      p.x = plat.x - p.w;
      contacts.push({ side: 'right', platformId: plat.id });
    } else {
      p.x = plat.x + plat.w;
      contacts.push({ side: 'left', platformId: plat.id });
    }
    p.vx = 0;
  }

  // --- move Y, resolve
  p.y += p.vy * dt;
  p.onGround = false;
  p.groundId = null;
  for (const plat of platforms) {
    if (!overlaps(p, plat)) continue;
    if (p.vy > 0) {
      p.y = plat.y - p.h;
      p.onGround = true;
      p.groundId = plat.id;
      contacts.push({ side: 'bottom', platformId: plat.id });
    } else {
      p.y = plat.y + plat.h;
      contacts.push({ side: 'top', platformId: plat.id });
    }
    p.vy = 0;
  }

  // --- fell out of the world → respawn
  if (p.y > WORLD.h + 200) {
    Object.assign(p, makePlayer());
  }
  return contacts;
}

/** Peak jump height from v² = 2·g·h (ignores jump-cut). */
export const maxJumpHeight = (params: PhysicsParams) => (params.jumpForce * params.jumpForce) / (2 * params.gravity);

export function collectCoins(p: Player, coins: Coin[]): number {
  let n = 0;
  for (const c of coins) {
    if (c.taken) continue;
    const cx = Math.max(p.x, Math.min(c.x, p.x + p.w));
    const cy = Math.max(p.y, Math.min(c.y, p.y + p.h));
    if ((cx - c.x) ** 2 + (cy - c.y) ** 2 <= c.r * c.r) {
      c.taken = true;
      n++;
    }
  }
  return n;
}
