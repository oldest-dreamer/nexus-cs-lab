import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { Eraser, Grid3x3, Pause, Play, RotateCcw, Shuffle, SkipForward, Zap } from 'lucide-react';
import { AStarSearch, generateMaze, scatterWalls, type Heuristic } from './astar';
import { Panel, Slider, Toggle } from '../shared/controls';

const COLS = 33;
const ROWS = 19;
const DEFAULT_START = 9 * COLS + 5;
const DEFAULT_GOAL = 9 * COLS + 27;

type Drag = null | 'start' | 'goal' | 'draw' | 'erase';

const HEURISTICS: { id: Heuristic; label: string }[] = [
  { id: 'manhattan', label: 'Manhattan' },
  { id: 'octile', label: 'Octile' },
  { id: 'euclidean', label: 'Euclidean' },
  { id: 'dijkstra', label: 'Dijkstra (h=0)' },
];

function defaultWalls() {
  const w = new Uint8Array(COLS * ROWS);
  for (let y = 3; y <= 15; y++) w[y * COLS + 16] = 1; // a vertical wall between start and goal
  return w;
}

export function PathfindingVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [walls, setWalls] = useState<Uint8Array>(defaultWalls);
  const [start, setStart] = useState(DEFAULT_START);
  const [goal, setGoal] = useState(DEFAULT_GOAL);
  const [heuristic, setHeuristic] = useState<Heuristic>('manhattan');
  const [diagonal, setDiagonal] = useState(false);
  const [weight, setWeight] = useState(1);
  const [speed, setSpeed] = useState(20); // expansions per second
  const [showCosts, setShowCosts] = useState(true);
  const [running, setRunning] = useState(false);
  const [autoSolve, setAutoSolve] = useState(false); // after a finished run, edits re-solve instantly
  const searchRef = useRef<AStarSearch | null>(null);
  const [, setTick] = useState(0);
  const drag = useRef<Drag>(null);
  const seed = useRef(1);

  const rerender = () => setTick((t) => t + 1);

  const newSearch = useCallback(
    () => new AStarSearch({ cols: COLS, rows: ROWS, walls }, start, goal, { diagonal, heuristic, weight }),
    [walls, start, goal, diagonal, heuristic, weight],
  );

  // Any change to the problem resets (or instantly re-solves) the search.
  useEffect(() => {
    const s = newSearch();
    if (autoSolve) s.runToEnd();
    searchRef.current = s;
    rerender();
    // autoSolve is intentionally not a dependency: toggling it must not reset the search.
  }, [newSearch]);

  // Animation loop
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    let budget = 0;
    const tick = (now: number) => {
      budget += ((now - last) / 1000) * speed;
      last = now;
      const s = searchRef.current;
      let alive = true;
      while (s && budget >= 1 && alive) {
        alive = s.step();
        budget -= 1;
      }
      rerender();
      if (!s || s.status !== 'running') {
        setRunning(false);
        setAutoSolve(true);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, speed]);

  // Canvas sizing + draw on every render
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const wPx = Math.round(c.clientWidth * dpr);
    const hPx = Math.round(wPx * (ROWS / COLS));
    if (c.width !== wPx || c.height !== hPx) {
      c.width = wPx;
      c.height = hPx;
    }
    drawGrid(c, walls, start, goal, searchRef.current, showCosts, c.clientWidth / COLS);
  });

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ro = new ResizeObserver(() => rerender());
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  // ---- pointer editing ----
  const cellAt = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * COLS);
    const y = Math.floor(((e.clientY - r.top) / r.height) * ROWS);
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return -1;
    return y * COLS + x;
  };

  const apply = (i: number) => {
    if (i < 0) return;
    const mode = drag.current;
    if (mode === 'start') {
      if (!walls[i] && i !== goal) setStart(i);
    } else if (mode === 'goal') {
      if (!walls[i] && i !== start) setGoal(i);
    } else if ((mode === 'draw' || mode === 'erase') && i !== start && i !== goal) {
      const v = mode === 'draw' ? 1 : 0;
      if (walls[i] !== v) {
        setWalls((w) => {
          const n = w.slice();
          n[i] = v;
          return n;
        });
      }
    }
  };

  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const i = cellAt(e);
    if (i < 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setRunning(false);
    drag.current = i === start ? 'start' : i === goal ? 'goal' : walls[i] ? 'erase' : 'draw';
    apply(i);
  };
  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (drag.current) apply(cellAt(e));
  };
  const onUp = () => {
    drag.current = null;
  };

  // ---- controls ----
  const play = () => {
    const s = searchRef.current;
    if (!s || s.status !== 'running') {
      searchRef.current = newSearch();
    }
    setAutoSolve(false);
    setRunning((r) => !r);
  };
  const stepOnce = () => {
    setRunning(false);
    if (!searchRef.current || searchRef.current.status !== 'running') searchRef.current = newSearch();
    searchRef.current.step();
    if (searchRef.current.status !== 'running') setAutoSolve(true);
    rerender();
  };
  const instant = () => {
    setRunning(false);
    const s = newSearch();
    s.runToEnd();
    searchRef.current = s;
    setAutoSolve(true);
    rerender();
  };
  const resetSearch = () => {
    setRunning(false);
    setAutoSolve(false);
    searchRef.current = newSearch();
    rerender();
  };
  const loadMaze = () => {
    setRunning(false);
    setAutoSolve(false);
    seed.current++;
    setStart(1 * COLS + 1);
    setGoal((ROWS - 2) * COLS + (COLS - 2));
    setWalls(generateMaze(COLS, ROWS, seed.current));
  };
  const scatter = () => {
    setRunning(false);
    setAutoSolve(false);
    seed.current++;
    setWalls(scatterWalls(COLS, ROWS, 0.28, seed.current, [start, goal]));
  };

  const s = searchRef.current;
  const status = s?.status ?? 'running';
  const pathCost = s?.pathCost;
  const cur = s && s.current >= 0 ? s.current : -1;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={play} className={running ? 'nx-btn-danger py-1.5 text-xs' : 'nx-btn-primary py-1.5 text-xs'}>
          {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {running ? 'Pause' : status === 'running' && (s?.expanded ?? 0) > 0 ? 'Resume' : 'Play A*'}
        </button>
        <button onClick={stepOnce} className="nx-btn-ghost py-1.5 text-xs"><SkipForward className="h-4 w-4" /> Step</button>
        <button onClick={instant} className="nx-btn-ghost py-1.5 text-xs"><Zap className="h-4 w-4" /> Instant</button>
        <button onClick={resetSearch} className="nx-btn-ghost py-1.5 text-xs"><RotateCcw className="h-4 w-4" /> Reset search</button>
        <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
        <button onClick={loadMaze} className="nx-btn-ghost py-1.5 text-xs"><Grid3x3 className="h-4 w-4" /> Maze</button>
        <button onClick={scatter} className="nx-btn-ghost py-1.5 text-xs"><Shuffle className="h-4 w-4" /> Scatter</button>
        <button onClick={() => { setRunning(false); setWalls(new Uint8Array(COLS * ROWS)); }} className="nx-btn-ghost py-1.5 text-xs"><Eraser className="h-4 w-4" /> Clear walls</button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-2">
          <canvas
            ref={canvasRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            className="block w-full touch-none cursor-crosshair rounded-lg border border-line"
            style={{ aspectRatio: `${COLS} / ${ROWS}` }}
            aria-label="A* grid. Drag on empty cells to draw walls, on walls to erase, and drag the start or goal nodes to move them."
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-mute">
            <Legend cls="bg-nx-cyan" label="Start (drag)" />
            <Legend cls="bg-nx-crimson" label="Goal (drag)" />
            <Legend cls="bg-slate-600" label="Wall (draw / erase)" />
            <Legend cls="bg-emerald-500/40 ring-1 ring-emerald-400" label="Open set (frontier)" />
            <Legend cls="bg-indigo-500/30" label="Closed set (expanded)" />
            <Legend cls="bg-nx-amber" label="Current / path" />
            {showCosts && <span className="font-mono">cell: <span className="text-emerald-300">g</span> · <span className="text-sky-300">h</span> · <span className="text-white">f</span></span>}
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-line bg-[#04060a] p-3 font-mono text-[12px]">
            <div className="mb-2 text-[10px] uppercase tracking-widest text-mute">Search state</div>
            <Row k="status" v={status === 'found' ? 'PATH FOUND' : status === 'no-path' ? 'NO PATH' : running ? 'searching…' : 'ready'} cls={status === 'found' ? 'text-emerald-400' : status === 'no-path' ? 'text-nx-crimson' : 'text-nx-cyan'} />
            <Row k="expanded (closed)" v={String(s?.expanded ?? 0)} />
            <Row k="open set size" v={String(s?.openSize ?? 0)} />
            <Row k="path steps" v={status === 'found' ? String((s?.path.length ?? 1) - 1) : '—'} />
            <Row k="path cost g(goal)" v={pathCost !== undefined && Number.isFinite(pathCost) ? pathCost.toFixed(2) : '—'} cls="text-nx-amber" />
            {cur >= 0 && s && status === 'running' && (
              <div className="mt-2 border-t border-line pt-2 text-slate-400">
                current ({cur % COLS},{Math.floor(cur / COLS)}): g={s.g[cur].toFixed(1)} h={s.h[cur].toFixed(1)} <span className="text-white">f={s.f(cur).toFixed(1)}</span>
              </div>
            )}
          </div>

          <Panel label="Algorithm">
            <div className="grid grid-cols-2 gap-1">
              {HEURISTICS.map((h) => (
                <button
                  key={h.id}
                  onClick={() => setHeuristic(h.id)}
                  className={`rounded-md border py-1 text-[11px] ${heuristic === h.id ? 'border-nx-amber bg-nx-amber/15 text-nx-amber' : 'border-line bg-panel-2 text-slate-300'}`}
                >
                  {h.label}
                </button>
              ))}
            </div>
            <div className="mt-2">
              <Toggle label="Diagonal moves (cost √2, no corner cutting)" on={diagonal} set={setDiagonal} />
              <Toggle label="Show g / h / f costs" on={showCosts} set={setShowCosts} />
            </div>
            <div className="mt-2">
              <Slider label="Heuristic weight w" unit={weight > 1 ? '(inadmissible)' : '(admissible)'} min={1} max={5} step={0.25} value={weight} onChange={setWeight} />
            </div>
            {heuristic === 'manhattan' && diagonal && <p className="text-[11px] text-nx-amber">Manhattan overestimates when diagonals are allowed, so paths may not be optimal. Try Octile.</p>}
          </Panel>

          <Panel label="Playback">
            <Slider label="Speed" unit="nodes/s" min={1} max={240} step={1} value={speed} onChange={setSpeed} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function drawGrid(c: HTMLCanvasElement, walls: Uint8Array, start: number, goal: number, s: AStarSearch | null, showCosts: boolean, cssCell: number) {
  const ctx = c.getContext('2d');
  if (!ctx || c.width === 0) return;
  const cw = c.width / COLS;
  const ch = c.height / ROWS;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#07090e';
  ctx.fillRect(0, 0, c.width, c.height);

  const pathSet = new Set(s?.status === 'found' ? s.path : []);
  for (let i = 0; i < COLS * ROWS; i++) {
    const x = (i % COLS) * cw;
    const y = Math.floor(i / COLS) * ch;
    if (walls[i]) {
      ctx.fillStyle = '#334155';
      ctx.fillRect(x, y, cw, ch);
      ctx.fillStyle = '#475569';
      ctx.fillRect(x, y, cw, 2);
      continue;
    }
    const st = s?.state[i] ?? 0;
    if (st === 2) {
      ctx.fillStyle = 'rgba(99,102,241,0.22)';
      ctx.fillRect(x, y, cw, ch);
    } else if (st === 1) {
      ctx.fillStyle = 'rgba(16,185,129,0.2)';
      ctx.fillRect(x, y, cw, ch);
      ctx.strokeStyle = 'rgba(52,211,153,0.7)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 1.5, y + 1.5, cw - 3, ch - 3);
    }
    if (pathSet.has(i) && i !== start && i !== goal) {
      ctx.fillStyle = 'rgba(245,158,11,0.35)';
      ctx.fillRect(x, y, cw, ch);
    }
  }

  // grid lines
  ctx.strokeStyle = 'rgba(138,151,168,0.12)';
  ctx.lineWidth = 1;
  for (let gx = 0; gx <= COLS; gx++) { ctx.beginPath(); ctx.moveTo(gx * cw, 0); ctx.lineTo(gx * cw, c.height); ctx.stroke(); }
  for (let gy = 0; gy <= ROWS; gy++) { ctx.beginPath(); ctx.moveTo(0, gy * ch); ctx.lineTo(c.width, gy * ch); ctx.stroke(); }

  // path polyline
  if (s?.status === 'found' && s.path.length > 1) {
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = Math.max(2, cw * 0.14);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(245,158,11,0.7)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    s.path.forEach((i, k) => {
      const px = (i % COLS + 0.5) * cw;
      const py = (Math.floor(i / COLS) + 0.5) * ch;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // current node
  if (s && s.current >= 0 && s.status === 'running') {
    const x = (s.current % COLS) * cw, y = Math.floor(s.current / COLS) * ch;
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = Math.max(2, cw * 0.1);
    ctx.strokeRect(x + 2, y + 2, cw - 4, ch - 4);
  }

  // start / goal
  for (const [i, color, label] of [[start, '#06B6D4', 'S'], [goal, '#F43F5E', 'G']] as const) {
    const x = (i % COLS) * cw, y = Math.floor(i / COLS) * ch;
    ctx.fillStyle = color;
    ctx.fillRect(x + 2, y + 2, cw - 4, ch - 4);
    ctx.fillStyle = '#07090e';
    ctx.font = `bold ${Math.floor(ch * 0.5)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + cw / 2, y + ch / 2 + 1);
  }

  // cost overlays (only when cells are big enough to read)
  if (showCosts && s && cssCell >= 22) {
    ctx.textBaseline = 'alphabetic';
    for (let i = 0; i < COLS * ROWS; i++) {
      if (!s.state[i] || i === start || i === goal) continue;
      const x = (i % COLS) * cw, y = Math.floor(i / COLS) * ch;
      const small = Math.max(7, Math.floor(ch * 0.24));
      ctx.font = `${small}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(110,231,183,0.9)';
      ctx.fillText(fmt(s.g[i]), x + 2, y + small + 1);
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(125,211,252,0.9)';
      ctx.fillText(fmt(s.h[i]), x + cw - 2, y + small + 1);
      ctx.textAlign = 'center';
      ctx.font = `bold ${Math.max(8, Math.floor(ch * 0.32))}px "JetBrains Mono", monospace`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(fmt(s.f(i)), x + cw / 2, y + ch * 0.82);
    }
  }
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function Row({ k, v, cls = 'text-white' }: { k: string; v: string; cls?: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-slate-500">{k}</span>
      <span className={cls}>{v}</span>
    </div>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded-sm ${cls}`} />
      {label}
    </span>
  );
}
