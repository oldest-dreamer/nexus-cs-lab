import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Eraser, Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import { MLP, makePreset, type Preset, type Sample } from './nn';

const RES = 96; // heatmap resolution (cells per side)
const CYAN: [number, number, number] = [6, 182, 212];
const CRIMSON: [number, number, number] = [244, 63, 94];
const BG: [number, number, number] = [7, 9, 14];
const LRS = [0.01, 0.03, 0.1, 0.3, 1, 3];

export function NetTrainer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offRef = useRef<HTMLCanvasElement | null>(null);
  const dataRef = useRef<Sample[]>(makePreset('xor'));
  const [hidden, setHidden] = useState(8);
  const [layers, setLayers] = useState(1);
  const [lr, setLr] = useState(0.3);
  const [speed, setSpeed] = useState(5);
  const [brush, setBrush] = useState<0 | 1>(1);
  const [running, setRunning] = useState(false);
  const [seed, setSeed] = useState(1);
  const netRef = useRef<MLP>(new MLP([8], 1));
  const lossHist = useRef<number[]>([]);
  const [diverged, setDiverged] = useState(false);
  const [stats, setStats] = useState({ epoch: 0, loss: NaN, acc: 0, n: dataRef.current.length });

  // ---- rendering ----------------------------------------------------------
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const net = netRef.current;
    const W = canvas.width, H = canvas.height;

    // Heatmap into a small offscreen canvas, then upscale with smoothing.
    if (!offRef.current) {
      offRef.current = document.createElement('canvas');
      offRef.current.width = RES;
      offRef.current.height = RES;
    }
    const off = offRef.current;
    const octx = off.getContext('2d')!;
    const img = octx.createImageData(RES, RES);
    for (let j = 0; j < RES; j++) {
      for (let i = 0; i < RES; i++) {
        const x = ((i + 0.5) / RES) * 2 - 1;
        const y = 1 - ((j + 0.5) / RES) * 2;
        const p = net.predict(x, y);
        const target = p >= 0.5 ? CYAN : CRIMSON;
        const k = Math.abs(p - 0.5) * 2 * 0.5;
        const edge = Math.max(0, 1 - Math.abs(p - 0.5) / 0.06) * 0.3; // soft 0.5 contour
        const o = (j * RES + i) * 4;
        for (let c = 0; c < 3; c++) img.data[o + c] = BG[c] + (target[c] - BG[c]) * k + (230 - BG[c]) * edge * 0.5;
        img.data[o + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(off, 0, 0, W, H);

    // Axes grid
    ctx.strokeStyle = 'rgba(138,151,168,0.12)';
    ctx.lineWidth = 1;
    for (let g = 1; g < 8; g++) {
      const px = (g / 8) * W;
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, px); ctx.lineTo(W, px); ctx.stroke();
    }

    // Points
    const r = Math.max(4, W / 90);
    for (const s of dataRef.current) {
      const px = ((s.x + 1) / 2) * W;
      const py = ((1 - s.y) / 2) * H;
      const correct = (net.predict(s.x, s.y) >= 0.5 ? 1 : 0) === s.label;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = s.label ? '#06B6D4' : '#F43F5E';
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, W / 400);
      ctx.strokeStyle = correct ? 'rgba(255,255,255,0.85)' : '#F59E0B';
      ctx.stroke();
    }
  }, []);

  // Resize canvas to its CSS box × devicePixelRatio
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const size = Math.round(canvas.clientWidth * dpr);
      if (size > 0 && canvas.width !== size) {
        canvas.width = size;
        canvas.height = size;
        draw();
      }
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw]);

  // ---- training loop --------------------------------------------------------
  const publish = useCallback((loss: number) => {
    const net = netRef.current;
    setStats({ epoch: net.epoch, loss, acc: net.accuracy(dataRef.current), n: dataRef.current.length });
  }, []);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let lastPublish = 0;
    const tick = (t: number) => {
      const data = dataRef.current;
      let loss = NaN;
      if (data.length) {
        for (let s = 0; s < speed; s++) loss = netRef.current.trainStep(data, lr);
        if (!Number.isFinite(loss)) {
          setRunning(false); // weights blew up (learning rate too high)
          setDiverged(true);
        } else {
          lossHist.current.push(loss);
        }
        if (lossHist.current.length > 240) lossHist.current.shift();
      }
      draw();
      if (t - lastPublish > 90) {
        publish(loss);
        lastPublish = t;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, speed, lr, draw, publish]);

  // ---- actions --------------------------------------------------------------
  const resetNet = useCallback(
    (h = hidden, nl = layers, sd = seed) => {
      netRef.current = new MLP(Array(nl).fill(h), sd);
      lossHist.current = [];
      setDiverged(false);
      setStats({ epoch: 0, loss: NaN, acc: netRef.current.accuracy(dataRef.current), n: dataRef.current.length });
      draw();
    },
    [hidden, layers, seed, draw],
  );

  const loadPreset = (p: Preset) => {
    dataRef.current = makePreset(p);
    // Spirals need more capacity: bump to 2×12 if the current net is too small.
    if (p === 'spiral' && layers === 1) {
      setLayers(2);
      setHidden(12);
      resetNet(12, 2);
    } else {
      resetNet();
    }
  };

  const addPoint = (e: MouseEvent<HTMLCanvasElement>, forceOther = false) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = 1 - ((e.clientY - rect.top) / rect.height) * 2;
    const label = (forceOther || e.shiftKey ? 1 - brush : brush) as 0 | 1;
    dataRef.current = [...dataRef.current, { x, y, label }];
    setStats((s) => ({ ...s, n: dataRef.current.length }));
    draw();
  };

  const step = () => {
    const loss = netRef.current.trainStep(dataRef.current, lr);
    if (Number.isFinite(loss)) lossHist.current.push(loss);
    else setDiverged(true);
    publish(loss);
    draw();
  };

  const net = netRef.current;
  const hist = lossHist.current;
  const finite = hist.filter(Number.isFinite);
  const maxLoss = Math.max(1e-4, ...finite); // auto-scale to the visible window
  const spark = hist.map((l, i) => `${(i / 239) * 100},${30 - (Math.min(l, maxLoss) / maxLoss) * 28}`).join(' ');

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* Canvas */}
      <div className="space-y-2">
        <div className="relative mx-auto w-full max-w-[560px]">
          <canvas
            ref={canvasRef}
            onClick={(e) => addPoint(e)}
            onContextMenu={(e) => { e.preventDefault(); addPoint(e, true); }}
            className="aspect-square w-full cursor-crosshair rounded-lg border border-line"
            aria-label="Neural network decision boundary canvas. Click to add points."
          />
          <div className="pointer-events-none absolute left-2 top-2 rounded bg-obsidian/80 px-2 py-1 font-mono text-[11px] text-slate-300">
            click: <span className={brush ? 'text-nx-cyan' : 'text-nx-crimson'}>{brush ? 'cyan' : 'crimson'}</span> · shift/right-click: other
          </div>
        </div>
        <p className="text-center text-xs text-mute">Background = network's prediction. Amber-ringed points are currently misclassified. The bright seam is the 0.5 decision boundary.</p>
      </div>

      {/* Controls */}
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => setRunning((r) => !r)} className={`col-span-2 ${running ? 'nx-btn-danger' : 'nx-btn-primary'}`}>
            {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {running ? 'Pause' : 'Train'}
          </button>
          <button onClick={step} disabled={running} className="nx-btn-ghost" title="Single step"><SkipForward className="h-4 w-4" /></button>
          <button onClick={() => { setSeed((s) => s + 1); resetNet(hidden, layers, seed + 1); }} className="nx-btn-ghost col-span-2 text-xs"><RotateCcw className="h-4 w-4" /> Re-init weights</button>
          <button onClick={() => { dataRef.current = []; resetNet(); }} className="nx-btn-ghost text-xs" title="Clear points"><Eraser className="h-4 w-4" /></button>
        </div>

        {/* Live readout */}
        <div className="rounded-lg border border-line bg-[#04060a] p-3 font-mono">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Readout label="epoch" value={stats.epoch.toLocaleString()} />
            <Readout label="loss" value={Number.isFinite(stats.loss) ? stats.loss.toFixed(4) : '—'} cls="text-nx-amber" />
            <Readout label="acc" value={stats.n ? `${Math.round(stats.acc * 100)}%` : '—'} cls="text-emerald-400" />
          </div>
          {diverged && <div className="mt-2 rounded border border-nx-crimson/40 bg-nx-crimson/10 px-2 py-1 text-center text-[11px] text-nx-crimson">Diverged: loss became NaN. Lower the learning rate and re-init weights.</div>}
          <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="mt-2 h-12 w-full">
            <polyline points={spark} fill="none" stroke="#F59E0B" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="flex justify-between text-[10px] text-slate-600">
            <span>BCE loss · max {Number.isFinite(maxLoss) ? maxLoss.toFixed(3) : '—'}</span>
            <span>{stats.n} points · {net.paramCount} params</span>
          </div>
        </div>

        {/* Data */}
        <Group label="Dataset">
          <div className="grid grid-cols-4 gap-1">
            {(['xor', 'circle', 'spiral', 'blobs'] as Preset[]).map((p) => (
              <button key={p} onClick={() => loadPreset(p)} className="rounded-md border border-line bg-panel-2 py-1 font-mono text-[11px] capitalize text-slate-300 hover:border-nx-cyan/50 hover:text-nx-cyan">{p}</button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1">
            {([1, 0] as const).map((c) => (
              <button
                key={c}
                onClick={() => setBrush(c)}
                className={`rounded-md border py-1 text-xs font-semibold ${brush === c ? (c ? 'border-nx-cyan bg-nx-cyan/15 text-nx-cyan' : 'border-nx-crimson bg-nx-crimson/15 text-nx-crimson') : 'border-line text-mute'}`}
              >
                ● {c ? 'Cyan (1)' : 'Crimson (0)'}
              </button>
            ))}
          </div>
        </Group>

        {/* Architecture */}
        <Group label={`Architecture: 2 → ${Array(layers).fill(hidden).join(' → ')} → 1`}>
          <Slider label="Neurons / layer" min={1} max={16} value={hidden} onChange={(v) => { setHidden(v); resetNet(v, layers); }} />
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
            <span>Hidden layers</span>
            <div className="flex gap-1">
              {[1, 2, 3].map((n) => (
                <button key={n} onClick={() => { setLayers(n); resetNet(hidden, n); }} className={`h-6 w-7 rounded font-mono ${layers === n ? 'bg-nx-cyan text-obsidian' : 'bg-panel-2 text-slate-300'}`}>{n}</button>
              ))}
            </div>
          </div>
        </Group>

        {/* Optimisation */}
        <Group label="Training">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Learning rate</span>
            <div className="flex flex-wrap justify-end gap-1">
              {LRS.map((v) => (
                <button key={v} onClick={() => setLr(v)} className={`rounded px-1.5 py-0.5 font-mono ${lr === v ? 'bg-nx-amber text-obsidian' : 'bg-panel-2 text-slate-300'}`}>{v}</button>
              ))}
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
            <span>Steps / frame</span>
            <div className="flex gap-1">
              {[1, 5, 20].map((v) => (
                <button key={v} onClick={() => setSpeed(v)} className={`rounded px-2 py-0.5 font-mono ${speed === v ? 'bg-nx-cyan text-obsidian' : 'bg-panel-2 text-slate-300'}`}>{v}×</button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-mute">tanh hidden · sigmoid output · BCE loss · full-batch gradient descent</p>
        </Group>
      </div>
    </div>
  );
}

function Readout({ label, value, cls = 'text-white' }: { label: string; value: string; cls?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-panel-2/40 p-3">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-mute">{label}</div>
      {children}
    </div>
  );
}

function Slider({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block text-xs text-slate-400">
      <div className="mb-1 flex justify-between"><span>{label}</span><span className="font-mono text-nx-cyan">{value}</span></div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-nx-cyan" />
    </label>
  );
}
