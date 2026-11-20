import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, Layers, ListOrdered, Pause, Play, RotateCcw, SkipForward, Timer, Zap } from 'lucide-react';
import { PRESETS, simulate, type Phase, type Snapshot } from './eventLoop';
import { tokenize } from '../../components/CodeBlock';
import { Slider } from '../shared/controls';

const TOKEN_CLS: Record<string, string> = {
  com: 'text-slate-500 italic',
  str: 'text-emerald-300',
  num: 'text-nx-amber',
  kw: 'text-nx-crimson',
  fn: 'text-nx-cyan',
  tag: 'text-nx-cyan',
  reg: 'text-violet-300',
  plain: 'text-slate-200',
};

const PHASES: { id: Phase; label: string }[] = [
  { id: 'script', label: 'Run script' },
  { id: 'microtasks', label: 'Drain microtasks' },
  { id: 'timers', label: 'Check Web APIs' },
  { id: 'macrotask', label: 'Run 1 macrotask' },
  { id: 'idle', label: 'Idle / wait' },
];

export function EventLoopSimulator() {
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const preset = PRESETS.find((p) => p.id === presetId)!;
  const snaps = useMemo(() => simulate(preset.program), [preset]);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1.5); // steps per second
  const s: Snapshot = snaps[Math.min(i, snaps.length - 1)];
  const atEnd = i >= snaps.length - 1;

  useEffect(() => {
    setI(0);
    setPlaying(false);
  }, [presetId]);

  useEffect(() => {
    if (!playing) return;
    if (atEnd) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setI((x) => Math.min(x + 1, snaps.length - 1)), 1000 / speed);
    return () => clearTimeout(t);
  }, [playing, i, atEnd, speed, snaps.length]);

  const lines = useMemo(() => preset.code.split('\n').map((l) => tokenize(l, 'js')), [preset.code]);

  return (
    <div className="space-y-4">
      {/* presets */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPresetId(p.id)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${presetId === p.id ? 'border-nx-cyan bg-nx-cyan/15 text-nx-cyan' : 'border-line bg-panel-2 text-slate-300 hover:text-white'}`}
          >
            {p.title}
          </button>
        ))}
      </div>
      <p className="text-sm text-slate-400">{preset.blurb}</p>

      {/* controls */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            if (atEnd) setI(0);
            setPlaying((p) => !p);
          }}
          className={playing ? 'nx-btn-danger py-1.5 text-xs' : 'nx-btn-primary py-1.5 text-xs'}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {playing ? 'Pause' : atEnd ? 'Replay' : 'Play'}
        </button>
        <button onClick={() => { setPlaying(false); setI((x) => Math.max(0, x - 1)); }} disabled={i === 0} className="nx-btn-ghost py-1.5 text-xs" aria-label="Step back">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button onClick={() => { setPlaying(false); setI((x) => Math.min(snaps.length - 1, x + 1)); }} disabled={atEnd} className="nx-btn-ghost py-1.5 text-xs">
          <SkipForward className="h-4 w-4" /> Step forward
        </button>
        <button onClick={() => { setPlaying(false); setI(0); }} className="nx-btn-ghost py-1.5 text-xs">
          <RotateCcw className="h-4 w-4" /> Reset
        </button>
        <div className="ml-auto flex items-center gap-3">
          <span className="font-mono text-xs text-mute">
            step <span className="text-white">{i + 1}</span>/{snaps.length} · clock <span className="text-nx-amber">{s.clock}ms</span>
          </span>
          <div className="w-40">
            <Slider label="Speed" unit="steps/s" min={0.5} max={6} step={0.5} value={speed} onChange={setSpeed} />
          </div>
        </div>
      </div>

      {/* step narration */}
      <div className="flex items-start gap-3 rounded-lg border border-nx-cyan/30 bg-nx-cyan/5 px-3 py-2">
        <Zap className="mt-0.5 h-4 w-4 shrink-0 text-nx-cyan" />
        <p className="text-sm text-slate-200" aria-live="polite">{s.note}</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {/* code */}
        <div className="space-y-3">
          <div className="overflow-hidden rounded-lg border border-line bg-[#05070b]">
            <div className="border-b border-line bg-panel-2/60 px-3 py-1.5 font-mono text-xs text-mute">{preset.id}.js</div>
            <pre className="overflow-x-auto py-2 font-mono text-[13px] leading-6">
              {lines.map((toks, idx) => {
                const active = s.line === idx + 1;
                return (
                  <div key={idx} className={`flex transition-colors ${active ? 'bg-nx-amber/15' : ''}`}>
                    <span className={`w-10 shrink-0 select-none pr-3 text-right ${active ? 'text-nx-amber' : 'text-slate-600'}`}>{active ? '▶' : idx + 1}</span>
                    <code className={`flex-1 pr-4 ${active ? 'border-l-2 border-nx-amber pl-2' : 'border-l-2 border-transparent pl-2'}`}>
                      {toks.map((t, k) => (
                        <span key={k} className={TOKEN_CLS[t.t]}>{t.v}</span>
                      ))}
                      {toks.length === 0 && ' '}
                    </code>
                  </div>
                );
              })}
            </pre>
          </div>

          {/* event loop phase ring */}
          <div className="rounded-lg border border-line bg-panel-2/40 p-3">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-mute">Event loop phase</div>
            <div className="flex flex-wrap items-center gap-1.5">
              {PHASES.map((p, k) => (
                <div key={p.id} className="flex items-center gap-1.5">
                  <span
                    className={`rounded-md border px-2 py-1 font-mono text-[11px] transition ${
                      s.phase === p.id ? 'border-nx-amber bg-nx-amber/20 text-nx-amber shadow-[0_0_14px_-4px_rgba(245,158,11,0.8)]' : 'border-line text-slate-500'
                    }`}
                  >
                    {p.label}
                  </span>
                  {k < PHASES.length - 1 && <span className="text-slate-700">→</span>}
                </div>
              ))}
              {s.phase === 'done' && <span className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-2 py-1 font-mono text-[11px] text-emerald-400">done ✓</span>}
            </div>
          </div>
        </div>

        {/* zones */}
        <div className="grid grid-cols-2 gap-3">
          <Zone title="Call Stack" icon={<Layers className="h-3.5 w-3.5" />} accent="text-nx-cyan" hint="LIFO · one frame runs at a time">
            <div className="flex min-h-[9rem] flex-col-reverse justify-start gap-1.5">
              {s.stack.map((f, k) => (
                <Chip key={`${f}-${k}`} cls={k === s.stack.length - 1 ? 'border-nx-cyan bg-nx-cyan/20 text-nx-cyan' : 'border-nx-cyan/30 bg-nx-cyan/5 text-cyan-200/70'}>
                  {f}
                </Chip>
              ))}
              {!s.stack.length && <Empty>empty</Empty>}
            </div>
          </Zone>

          <Zone title="Web APIs" icon={<Timer className="h-3.5 w-3.5" />} accent="text-violet-300" hint="browser threads: timers, network">
            <div className="flex min-h-[9rem] flex-col gap-1.5">
              {s.webApis.map((a) => (
                <Chip key={a.id} cls={`border-violet-400/50 bg-violet-500/10 text-violet-200 ${s.moved === a.id ? 'animate-toast-in' : ''}`}>
                  <span className="flex w-full items-center justify-between gap-2">
                    <span>{a.kind === 'fetch' ? '🌐 ' : '⏱ '}{a.label}</span>
                    <span className="text-[10px] text-violet-300/70">{a.readyAt <= s.clock ? 'ready' : `@${a.readyAt}ms`}</span>
                  </span>
                </Chip>
              ))}
              {!s.webApis.length && <Empty>no pending work</Empty>}
            </div>
          </Zone>

          <Zone title="Microtask Queue" icon={<ListOrdered className="h-3.5 w-3.5" />} accent="text-emerald-400" hint="Promise.then · await · queueMicrotask">
            <QueueRow items={s.micro} moved={s.moved} cls="border-emerald-500/50 bg-emerald-500/10 text-emerald-200" />
          </Zone>

          <Zone title="Macrotask Queue" icon={<ListOrdered className="h-3.5 w-3.5" />} accent="text-nx-amber" hint="setTimeout · events · I/O">
            <QueueRow items={s.macro} moved={s.moved} cls="border-nx-amber/50 bg-nx-amber/10 text-amber-200" />
          </Zone>
        </div>
      </div>

      {/* console */}
      <div className="overflow-hidden rounded-lg border border-line bg-[#04060a]">
        <div className="flex items-center justify-between border-b border-line bg-panel-2/60 px-3 py-1.5 font-mono text-xs text-mute">
          <span>Console output</span>
          <span>{s.console.length} line{s.console.length === 1 ? '' : 's'}</span>
        </div>
        <div className="flex min-h-[3rem] flex-wrap items-center gap-2 p-3 font-mono text-[13px]">
          {s.console.map((c, k) => (
            <span key={k} className={`rounded border border-line bg-panel-2 px-2 py-0.5 ${k === s.console.length - 1 && snaps[i - 1]?.console.length !== s.console.length ? 'animate-toast-in border-nx-cyan text-nx-cyan' : 'text-slate-200'}`}>
              <span className="mr-1.5 text-slate-600">{k + 1}</span>
              {c}
            </span>
          ))}
          {!s.console.length && <span className="text-slate-600">(nothing logged yet)</span>}
        </div>
      </div>

      {atEnd && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-300">
          <span className="mr-2 font-mono text-xs font-bold">TAKEAWAY</span>
          {preset.takeaway}
        </div>
      )}
    </div>
  );
}

function Zone({ title, icon, accent, hint, children }: { title: string; icon: ReactNode; accent: string; hint: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-[#05070b] p-3">
      <div className={`flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-widest ${accent}`}>
        {icon} {title}
      </div>
      <div className="mb-2 text-[10px] text-slate-600">{hint}</div>
      {children}
    </div>
  );
}

function QueueRow({ items, moved, cls }: { items: { id: number; label: string }[]; moved?: number; cls: string }) {
  return (
    <div className="flex min-h-[9rem] flex-col gap-1.5">
      {items.map((q, k) => (
        <Chip key={q.id} cls={`${cls} ${moved === q.id ? 'animate-toast-in ring-1 ring-white/40' : ''}`}>
          <span className="mr-1.5 text-[10px] opacity-60">{k === 0 ? 'next →' : `#${k + 1}`}</span>
          {q.label}
        </Chip>
      ))}
      {!items.length && <Empty>empty</Empty>}
    </div>
  );
}

function Chip({ cls, children }: { cls: string; children: ReactNode }) {
  return <div className={`rounded-md border px-2 py-1.5 font-mono text-[12px] transition-all ${cls}`}>{children}</div>;
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-dashed border-line px-2 py-1.5 text-center font-mono text-[11px] text-slate-600">{children}</div>;
}
