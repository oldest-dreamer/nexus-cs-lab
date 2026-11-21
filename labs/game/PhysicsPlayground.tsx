import { useCallback, useEffect, useRef, useState } from 'react';
import { Panel, Slider, Toggle } from '../shared/controls';
import { Keyboard, Pause, Play, RotateCcw } from 'lucide-react';
import {
  FIXED_DT,
  MAX_FRAME,
  PRESETS,
  WORLD,
  collectCoins,
  makeLevel,
  makePlayer,
  maxJumpHeight,
  stepPlayer,
  updatePlatforms,
  type Contact,
  type InputState,
  type PhysicsParams,
} from './physics';

const KEYS_LEFT = new Set(['ArrowLeft', 'KeyA']);
const KEYS_RIGHT = new Set(['ArrowRight', 'KeyD']);
const KEYS_JUMP = new Set(['Space', 'ArrowUp', 'KeyW']);
const TRAIL_LEN = 90;

interface Hud {
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
  fps: number;
  steps: number;
  coins: number;
  totalCoins: number;
}

export function PhysicsPlayground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [params, setParams] = useState<PhysicsParams>(PRESETS.Earth);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const [showHitboxes, setShowHitboxes] = useState(true);
  const [showVectors, setShowVectors] = useState(true);
  const [showTrail, setShowTrail] = useState(false);
  const [slowMo, setSlowMo] = useState(false);
  const [paused, setPaused] = useState(false);
  const [focused, setFocused] = useState(false);
  const flags = useRef({ showHitboxes, showVectors, showTrail, slowMo, paused });
  flags.current = { showHitboxes, showVectors, showTrail, slowMo, paused };

  const world = useRef({ ...makeLevel(), player: makePlayer(), t: 0, contacts: [] as Contact[], trail: [] as { x: number; y: number }[] });
  const input = useRef<InputState>({ left: false, right: false, jumpHeld: false, jumpPressed: false });
  const [hud, setHud] = useState<Hud>({ x: 0, y: 0, vx: 0, vy: 0, onGround: false, fps: 0, steps: 0, coins: 0, totalCoins: 6 });

  const reset = useCallback(() => {
    world.current = { ...makeLevel(), player: makePlayer(), t: 0, contacts: [], trail: [] };
  }, []);

  // ---- keyboard (only while the canvas has focus, so the page can still scroll) ----
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const down = (e: KeyboardEvent) => {
      const i = input.current;
      if (KEYS_LEFT.has(e.code)) i.left = true;
      else if (KEYS_RIGHT.has(e.code)) i.right = true;
      else if (KEYS_JUMP.has(e.code)) {
        if (!i.jumpHeld) i.jumpPressed = true; // edge, ignore key auto-repeat
        i.jumpHeld = true;
      } else if (e.code === 'KeyR') reset();
      else if (e.code === 'KeyP') setPaused((p) => !p);
      else return;
      e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      const i = input.current;
      if (KEYS_LEFT.has(e.code)) i.left = false;
      else if (KEYS_RIGHT.has(e.code)) i.right = false;
      else if (KEYS_JUMP.has(e.code)) i.jumpHeld = false;
    };
    const blur = () => {
      Object.assign(input.current, { left: false, right: false, jumpHeld: false, jumpPressed: false });
      setFocused(false);
    };
    const focus = () => setFocused(true);
    el.addEventListener('keydown', down);
    el.addEventListener('keyup', up);
    el.addEventListener('blur', blur);
    el.addEventListener('focus', focus);
    return () => {
      el.removeEventListener('keydown', down);
      el.removeEventListener('keyup', up);
      el.removeEventListener('blur', blur);
      el.removeEventListener('focus', focus);
    };
  }, [reset]);

  // ---- canvas sizing ----
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ro = new ResizeObserver(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.round(c.clientWidth * dpr);
      c.height = Math.round(c.clientWidth * dpr * (WORLD.h / WORLD.w));
    });
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  // ---- main loop: fixed-timestep physics, render every display frame ----
  useEffect(() => {
    let raf = 0;
    let last = performance.now() / 1000;
    let acc = 0;
    let frames = 0;
    let fpsT = last;
    let fps = 0;
    let lastHud = 0;

    const loop = (nowMs: number) => {
      const now = nowMs / 1000;
      const frame = Math.min(now - last, MAX_FRAME);
      last = now;
      const w = world.current;
      const f = flags.current;
      let steps = 0;

      if (!f.paused) {
        acc += frame * (f.slowMo ? 0.25 : 1);
        while (acc >= FIXED_DT) {
          const dx = updatePlatforms(w.platforms, w.t);
          w.contacts = stepPlayer(w.player, input.current, paramsRef.current, FIXED_DT, w.platforms, dx);
          collectCoins(w.player, w.coins);
          w.t += FIXED_DT;
          acc -= FIXED_DT;
          steps++;
        }
        w.trail.push({ x: w.player.x + w.player.w / 2, y: w.player.y + w.player.h });
        if (w.trail.length > TRAIL_LEN) w.trail.shift();
      }

      draw(canvasRef.current, w, f, paramsRef.current);

      frames++;
      if (now - fpsT >= 0.5) {
        fps = frames / (now - fpsT);
        frames = 0;
        fpsT = now;
      }
      if (nowMs - lastHud > 100) {
        lastHud = nowMs;
        const p = w.player;
        setHud({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, onGround: p.onGround, fps, steps, coins: w.coins.filter((c) => c.taken).length, totalCoins: w.coins.length });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const set = (k: keyof PhysicsParams) => (v: number) => setParams((p) => ({ ...p, [k]: v }));

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-2">
        <div
          ref={wrapRef}
          tabIndex={0}
          aria-label="Platformer game. Focus and use arrow keys or WASD to move, Space to jump."
          className={`relative overflow-hidden rounded-lg border outline-none ${focused ? 'border-nx-cyan/60' : 'border-line'}`}
          onMouseDown={() => wrapRef.current?.focus()}
        >
          <canvas ref={canvasRef} className="block aspect-[16/9] w-full" />
          {!focused && (
            <div className="absolute inset-0 hidden cursor-pointer items-center justify-center bg-obsidian/55 backdrop-blur-[1px] md:flex">
              <div className="flex items-center gap-2 rounded-lg border border-nx-cyan/40 bg-panel/90 px-4 py-2 text-sm font-semibold text-nx-cyan">
                <Keyboard className="h-4 w-4" /> Click to play · WASD / ← → · Space to jump
              </div>
            </div>
          )}
          {hud.coins === hud.totalCoins && (
            <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-md bg-nx-amber px-3 py-1 text-xs font-bold text-obsidian">All coins collected! Press R to reset</div>
          )}
        </div>
        {/* Touch controls (small screens) */}
        <div className="flex items-center justify-between gap-2 md:hidden">
          <div className="flex gap-2">
            <TouchKey label="◀" onChange={(d) => (input.current.left = d)} />
            <TouchKey label="▶" onChange={(d) => (input.current.right = d)} />
          </div>
          <TouchKey
            label="JUMP"
            wide
            onChange={(d) => {
              if (d && !input.current.jumpHeld) input.current.jumpPressed = true;
              input.current.jumpHeld = d;
            }}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 font-mono text-[11px] sm:grid-cols-5">
          <Stat k="pos" v={`${hud.x.toFixed(0)}, ${hud.y.toFixed(0)}`} />
          <Stat k="vel" v={`${hud.vx.toFixed(0)}, ${hud.vy.toFixed(0)}`} cls="text-nx-amber" />
          <Stat k="grounded" v={hud.onGround ? 'yes' : 'no'} cls={hud.onGround ? 'text-emerald-400' : 'text-nx-crimson'} />
          <Stat k="fps · steps" v={`${hud.fps.toFixed(0)} · ${hud.steps}`} />
          <Stat k="coins" v={`${hud.coins} / ${hud.totalCoins}`} cls="text-nx-amber" />
        </div>
        <p className="text-xs text-mute">
          Physics runs at a fixed {Math.round(1 / FIXED_DT)} Hz using an accumulator, so a 144 Hz and a 60 Hz screen behave identically. "steps" is how many physics updates ran this frame.
          Keys: R reset · P pause.
        </p>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setPaused((p) => !p)} className={paused ? 'nx-btn-primary' : 'nx-btn-ghost'}>
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />} {paused ? 'Resume' : 'Pause'}
          </button>
          <button onClick={reset} className="nx-btn-ghost"><RotateCcw className="h-4 w-4" /> Reset</button>
        </div>

        <Panel label="Presets">
          <div className="grid grid-cols-4 gap-1">
            {Object.keys(PRESETS).map((name) => (
              <button key={name} onClick={() => setParams(PRESETS[name])} className="rounded-md border border-line bg-panel-2 py-1 text-[11px] text-slate-300 hover:border-nx-amber/50 hover:text-nx-amber">
                {name}
              </button>
            ))}
          </div>
        </Panel>

        <Panel label="Forces">
          <Slider label="Gravity" unit="px/s²" min={100} max={3500} step={50} value={params.gravity} onChange={set('gravity')} />
          <Slider label="Jump force" unit="px/s" min={150} max={1300} step={10} value={params.jumpForce} onChange={set('jumpForce')} />
          <Slider label="Friction" unit="/frame" min={0} max={0.6} step={0.01} value={params.friction} onChange={set('friction')} />
          <Slider label="Max speed" unit="px/s" min={80} max={700} step={10} value={params.maxSpeed} onChange={set('maxSpeed')} />
          <div className="mt-2 rounded-md bg-obsidian px-2 py-1.5 font-mono text-[11px] text-slate-400">
            peak jump h = v²/2g = <span className="text-nx-amber">{maxJumpHeight(params).toFixed(0)} px</span>
          </div>
        </Panel>

        <Panel label="Debug overlays">
          <Toggle label="AABB hitboxes + contacts" on={showHitboxes} set={setShowHitboxes} />
          <Toggle label="Velocity vectors" on={showVectors} set={setShowVectors} />
          <Toggle label="Motion trail" on={showTrail} set={setShowTrail} />
          <Toggle label="Slow motion (0.25×)" on={slowMo} set={setSlowMo} />
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rendering (plain canvas 2D)
// ---------------------------------------------------------------------------
type World = { platforms: ReturnType<typeof makeLevel>['platforms']; coins: ReturnType<typeof makeLevel>['coins']; player: ReturnType<typeof makePlayer>; t: number; contacts: Contact[]; trail: { x: number; y: number }[] };

function draw(
  canvas: HTMLCanvasElement | null,
  w: World,
  f: { showHitboxes: boolean; showVectors: boolean; showTrail: boolean },
  params: PhysicsParams,
) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx || canvas.width === 0) return;
  const s = canvas.width / WORLD.w;
  ctx.setTransform(s, 0, 0, s, 0, 0);

  // background
  const g = ctx.createLinearGradient(0, 0, 0, WORLD.h);
  g.addColorStop(0, '#0b1220');
  g.addColorStop(1, '#07090e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  ctx.strokeStyle = 'rgba(138,151,168,0.07)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= WORLD.w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.h); ctx.stroke(); }
  for (let y = 0; y <= WORLD.h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.w, y); ctx.stroke(); }

  // platforms
  for (const p of w.platforms) {
    if (p.x >= WORLD.w || p.x + p.w <= 0) continue;
    ctx.fillStyle = p.move ? '#1e293b' : '#151c28';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = p.move ? '#06B6D4' : '#F59E0B';
    ctx.fillRect(p.x, p.y, p.w, 3);
  }

  // coins
  for (const c of w.coins) {
    if (c.taken) continue;
    const bob = Math.sin(w.t * 4 + c.x) * 2;
    ctx.beginPath();
    ctx.arc(c.x, c.y + bob, c.r, 0, Math.PI * 2);
    ctx.fillStyle = '#F59E0B';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fde68a';
    ctx.stroke();
  }

  // trail
  if (f.showTrail && w.trail.length > 1) {
    w.trail.forEach((pt, i) => {
      ctx.fillStyle = `rgba(6,182,212,${(i / w.trail.length) * 0.6})`;
      ctx.fillRect(pt.x - 1.5, pt.y - 1.5, 3, 3);
    });
  }

  // player
  const p = w.player;
  ctx.fillStyle = '#06B6D4';
  roundRect(ctx, p.x, p.y, p.w, p.h, 6);
  ctx.fill();
  ctx.fillStyle = '#07090e';
  const eyeX = p.x + p.w / 2 + p.facing * 6;
  ctx.fillRect(eyeX - 5, p.y + 11, 4, 6);
  ctx.fillRect(eyeX + 2, p.y + 11, 4, 6);

  if (f.showHitboxes) {
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = 'rgba(244,63,94,0.8)';
    for (const pl of w.platforms) ctx.strokeRect(pl.x + 0.5, pl.y + 0.5, pl.w - 1, pl.h - 1);
    ctx.strokeStyle = '#a5f3fc';
    ctx.strokeRect(p.x, p.y, p.w, p.h);
    ctx.setLineDash([]);
    // contact sides
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#F59E0B';
    for (const c of w.contacts) {
      ctx.beginPath();
      if (c.side === 'bottom') { ctx.moveTo(p.x, p.y + p.h); ctx.lineTo(p.x + p.w, p.y + p.h); }
      if (c.side === 'top') { ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.w, p.y); }
      if (c.side === 'left') { ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y + p.h); }
      if (c.side === 'right') { ctx.moveTo(p.x + p.w, p.y); ctx.lineTo(p.x + p.w, p.y + p.h); }
      ctx.stroke();
    }
    // peak jump height marker
    if (p.onGround) {
      const peak = p.y - maxJumpHeight(params);
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(245,158,11,0.6)';
      ctx.beginPath(); ctx.moveTo(p.x - 30, peak); ctx.lineTo(p.x + p.w + 30, peak); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(245,158,11,0.85)';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.fillText('max jump', p.x + p.w + 34, peak + 4);
    }
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#a5f3fc';
    ctx.fillText(`AABB ${p.w}×${p.h}`, p.x - 4, p.y - 6);
  }

  if (f.showVectors) {
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    const k = 0.18;
    arrow(ctx, cx, cy, cx + p.vx * k, cy, '#F59E0B');
    arrow(ctx, cx, cy, cx, cy + p.vy * k, '#F43F5E');
    arrow(ctx, cx, cy, cx + p.vx * k, cy + p.vy * k, '#ffffff');
  }
}

function arrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 3) return;
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - 8 * Math.cos(a - 0.45), y1 - 8 * Math.sin(a - 0.45));
  ctx.lineTo(x1 - 8 * Math.cos(a + 0.45), y1 - 8 * Math.sin(a + 0.45));
  ctx.closePath();
  ctx.fill();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
function TouchKey({ label, wide, onChange }: { label: string; wide?: boolean; onChange: (down: boolean) => void }) {
  return (
    <button
      type="button"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onChange(true); }}
      onPointerUp={() => onChange(false)}
      onPointerCancel={() => onChange(false)}
      onContextMenu={(e) => e.preventDefault()}
      className={`touch-none select-none rounded-lg border border-nx-cyan/40 bg-nx-cyan/10 py-3 font-mono text-sm font-bold text-nx-cyan active:bg-nx-cyan/30 ${wide ? 'w-28' : 'w-14'}`}
    >
      {label}
    </button>
  );
}

function Stat({ k, v, cls = 'text-white' }: { k: string; v: string; cls?: string }) {
  return (
    <div className="rounded-md border border-line bg-[#04060a] px-2 py-1">
      <div className="text-[9px] uppercase tracking-widest text-slate-500">{k}</div>
      <div className={`tabular-nums ${cls}`}>{v}</div>
    </div>
  );
}
