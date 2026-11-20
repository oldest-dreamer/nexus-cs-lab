import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createRoot } from 'react-dom/client';
import { Heart, Minus, Palette, Plus, RotateCcw } from 'lucide-react';
import { Toggle } from '../shared/controls';

/**
 * React State & Re-Render X-Ray.
 * These are REAL React components. Each one records why it rendered (mount /
 * state change / props changed / parent re-rendered with equal props) and
 * flashes when it commits.
 *
 * The tree is mounted in its own React root WITHOUT <StrictMode>, because
 * StrictMode intentionally double-renders in development, which would double
 * every counter and hide the lesson. Production behaviour is identical.
 */

type NodeName = 'App' | 'Header' | 'CounterCard' | 'HeavyList' | 'MemoizedChild';
const NODES: NodeName[] = ['App', 'Header', 'CounterCard', 'HeavyList', 'MemoizedChild'];

interface Stat {
  renders: number;
  wasted: number;
  wastedMs: number;
  reason: string;
}
interface LogLine {
  id: number;
  name: NodeName;
  reason: string;
  wasted: boolean;
}

class RenderStore {
  stats: Record<NodeName, Stat> = this.fresh();
  log: LogLine[] = [];
  version = 0;
  private seq = 0;
  private listeners = new Set<() => void>();
  private fresh() {
    return Object.fromEntries(NODES.map((n) => [n, { renders: 0, wasted: 0, wastedMs: 0, reason: '—' }])) as Record<NodeName, Stat>;
  }
  record(name: NodeName, reason: string, wasted: boolean, ms = 0) {
    const s = this.stats[name];
    s.renders++;
    s.reason = reason;
    if (wasted) {
      s.wasted++;
      s.wastedMs += ms;
    }
    this.log = [{ id: ++this.seq, name, reason, wasted }, ...this.log].slice(0, 14);
  }
  reset() {
    this.stats = this.fresh();
    this.log = [];
    this.emit();
  }
  emit() {
    this.version++;
    this.listeners.forEach((l) => l());
  }
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getVersion = () => this.version;
}

const StoreCtx = createContext<RenderStore | null>(null);

/** Records why a component rendered and flashes its card after commit. */
function useRenderXRay(name: NodeName, inputs: Record<string, unknown>, kind: 'props' | 'state' = 'props', costMs = 0) {
  const store = useContext(StoreCtx)!;
  const prev = useRef<Record<string, unknown> | null>(null);
  const el = useRef<HTMLDivElement>(null);
  let reason: string;
  let wasted = false;
  if (!prev.current) {
    reason = 'mount';
  } else {
    const changed = Object.keys(inputs).filter((k) => !Object.is(inputs[k], prev.current![k]));
    if (!changed.length) {
      reason = kind === 'state' ? 're-rendered' : 'parent re-rendered, props equal';
      wasted = kind === 'props';
    } else {
      const onlyFns = changed.every((k) => typeof inputs[k] === 'function');
      reason = `${kind} changed: ${changed.map((k) => (typeof inputs[k] === 'function' ? `${k} (new function)` : k)).join(', ')}`;
      wasted = kind === 'props' && onlyFns;
    }
  }
  prev.current = inputs;
  store.record(name, reason, wasted, costMs);
  const stat = store.stats[name];

  useEffect(() => {
    el.current?.animate(
      [
        { boxShadow: `0 0 0 2px ${wasted ? '#F43F5E' : '#06B6D4'}, 0 0 28px 2px ${wasted ? 'rgba(244,63,94,0.55)' : 'rgba(6,182,212,0.55)'}` },
        { boxShadow: '0 0 0 1px rgba(28,36,49,1), 0 0 0 0 rgba(0,0,0,0)' },
      ],
      { duration: 750, easing: 'ease-out' },
    );
    store.emit();
  });
  return { el, stat, reason, wasted };
}

// ---------------------------------------------------------------------------
// The component tree under test
// ---------------------------------------------------------------------------
function NodeCard({ x, name, memoized, children, sub }: { x: ReturnType<typeof useRenderXRay>; name: NodeName; memoized?: boolean; children?: ReactNode; sub?: string }) {
  return (
    <div ref={x.el} className="relative rounded-lg border border-line bg-panel p-3" data-node={name}>
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-sm font-bold text-white">
            <span className="break-all">&lt;{name} /&gt;</span>
            {memoized && <span className="rounded bg-nx-cyan/15 px-1 py-px text-[9px] font-bold uppercase tracking-wider text-nx-cyan">React.memo</span>}
          </div>
          {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-full bg-nx-cyan px-2 py-0.5 font-mono text-[11px] font-bold text-obsidian" title="render count" data-testid={`renders-${name}`}>
            {x.stat.renders}×
          </span>
          {x.stat.wasted > 0 && (
            <span className="rounded-full bg-nx-crimson/20 px-2 py-0.5 font-mono text-[10px] font-bold text-nx-crimson" title="wasted renders" data-testid={`wasted-${name}`}>
              {x.stat.wasted} wasted
            </span>
          )}
        </div>
      </div>
      <div className={`mb-2 truncate font-mono text-[10px] ${x.wasted ? 'text-nx-crimson' : 'text-slate-400'}`} title={x.reason}>
        ↳ {x.reason}
      </div>
      {children}
    </div>
  );
}

function Header({ title, theme }: { title: string; theme: 'dark' | 'neon' }) {
  const memoized = useContext(MemoCtx);
  const x = useRenderXRay('Header', { title, theme });
  return (
    <NodeCard x={x} name="Header" memoized={memoized} sub="props: title, theme">
      <div className={`rounded-md px-2 py-1.5 text-xs font-semibold ${theme === 'neon' ? 'bg-nx-amber/20 text-nx-amber' : 'bg-panel-2 text-slate-300'}`}>{title}</div>
    </NodeCard>
  );
}

function CounterCard({ count, onIncrement }: { count: number; onIncrement: () => void }) {
  const memoized = useContext(MemoCtx);
  const x = useRenderXRay('CounterCard', { count, onIncrement });
  return (
    <NodeCard x={x} name="CounterCard" memoized={memoized} sub="props: count, onIncrement">
      <div className="flex items-center justify-between rounded-md bg-panel-2 px-2 py-1.5">
        <span className="font-mono text-lg font-bold text-white">{count}</span>
        <button onClick={onIncrement} className="rounded bg-nx-cyan/20 px-2 py-0.5 text-xs font-semibold text-nx-cyan hover:bg-nx-cyan/30">+1</button>
      </div>
    </NodeCard>
  );
}

const HEAVY_MS = 4;
function HeavyList({ items, selected, onSelect }: { items: string[]; selected: number; onSelect: (i: number) => void }) {
  // simulate an expensive render (e.g. a big list or chart)
  const t0 = performance.now();
  while (performance.now() - t0 < HEAVY_MS) {
    /* busy work */
  }
  const memoized = useContext(MemoCtx);
  const x = useRenderXRay('HeavyList', { items, selected, onSelect }, 'props', HEAVY_MS);
  return (
    <NodeCard x={x} name="HeavyList" memoized={memoized} sub={`props: items, selected, onSelect · ~${HEAVY_MS}ms per render`}>
      <ul className="max-h-24 space-y-0.5 overflow-y-auto">
        {items.map((it, i) => (
          <li key={it}>
            <button onClick={() => onSelect(i)} className={`w-full rounded px-1.5 py-0.5 text-left text-[11px] ${i === selected ? 'bg-nx-amber/20 text-nx-amber' : 'text-slate-400 hover:bg-panel-2'}`}>
              {it}
            </button>
          </li>
        ))}
      </ul>
    </NodeCard>
  );
}

function MemoizedChild({ label, onLike }: { label: string; onLike: () => void }) {
  const memoized = useContext(MemoCtx);
  const x = useRenderXRay('MemoizedChild', { label, onLike });
  return (
    <NodeCard x={x} name="MemoizedChild" memoized={memoized} sub="props: label, onLike">
      <button onClick={onLike} className="flex w-full items-center justify-center gap-1.5 rounded-md bg-nx-crimson/15 py-1.5 text-xs font-semibold text-nx-crimson hover:bg-nx-crimson/25">
        <Heart className="h-3.5 w-3.5" /> {label}
      </button>
    </NodeCard>
  );
}

const MemoCtx = createContext(false);

// Both versions exist at module level; App picks one based on the toggle.
const HeaderM = memo(Header);
const CounterCardM = memo(CounterCard);
const HeavyListM = memo(HeavyList);
const MemoizedChildM = memo(MemoizedChild);

function App({ memoOn, useCb }: { memoOn: boolean; useCb: boolean }) {
  const [count, setCount] = useState(0);
  const [theme, setTheme] = useState<'dark' | 'neon'>('dark');
  const [items, setItems] = useState(() => Array.from({ length: 6 }, (_, i) => `row-${i + 1}`));
  const [selected, setSelected] = useState(0);
  const [likes, setLikes] = useState(0);
  const x = useRenderXRay('App', { count, theme, items, selected, likes }, 'state');

  // Hooks are always called; the toggle only decides WHICH handler is passed down.
  const incStable = useCallback(() => setCount((c) => c + 1), []);
  const selectStable = useCallback((i: number) => setSelected(i), []);
  const likeStable = useCallback(() => setLikes((l) => l + 1), []);
  const onIncrement = useCb ? incStable : () => setCount((c) => c + 1);
  const onSelect = useCb ? selectStable : (i: number) => setSelected(i);
  const onLike = useCb ? likeStable : () => setLikes((l) => l + 1);

  const H = memoOn ? HeaderM : Header;
  const C = memoOn ? CounterCardM : CounterCard;
  const L = memoOn ? HeavyListM : HeavyList;
  const M = memoOn ? MemoizedChildM : MemoizedChild;

  return (
    <MemoCtx.Provider value={memoOn}>
      <div className="space-y-3">
        <NodeCard x={x} name="App" sub={`state: count=${count}, theme=${theme}, items=${items.length}, selected=${selected}, likes=${likes}`}>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setCount((c) => c + 1)} className="nx-btn-primary py-1 text-xs" data-testid="increment">
              <Plus className="h-3.5 w-3.5" /> Increment
            </button>
            <button onClick={() => setCount((c) => c - 1)} className="nx-btn-ghost py-1 text-xs"><Minus className="h-3.5 w-3.5" /></button>
            <button onClick={() => setTheme((t) => (t === 'dark' ? 'neon' : 'dark'))} className="nx-btn-ghost py-1 text-xs">
              <Palette className="h-3.5 w-3.5" /> Toggle theme
            </button>
            <button onClick={() => setItems((it) => [...it, `row-${it.length + 1}`])} className="nx-btn-ghost py-1 text-xs">
              <Plus className="h-3.5 w-3.5" /> Add item
            </button>
          </div>
        </NodeCard>
        {/* connector */}
        <div className="relative mx-6 h-4 border-x border-t border-line" aria-hidden />
        <div className="-mt-3 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
          <H title={`NEXUS Shop (${theme})`} theme={theme} />
          <C count={count} onIncrement={onIncrement} />
          <L items={items} selected={selected} onSelect={onSelect} />
          <M label={likes > 0 ? `Liked ${likes}×` : 'Like'} onLike={onLike} />
        </div>
      </div>
    </MemoCtx.Provider>
  );
}

// ---------------------------------------------------------------------------
// Lab shell (lives in the isolated root)
// ---------------------------------------------------------------------------
function StatsPanel({ store }: { store: RenderStore }) {
  useSyncExternalStore(store.subscribe, store.getVersion);
  const total = NODES.reduce((n, k) => n + store.stats[k].renders, 0);
  const wasted = NODES.reduce((n, k) => n + store.stats[k].wasted, 0);
  const wastedMs = NODES.reduce((n, k) => n + store.stats[k].wastedMs, 0);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 font-mono">
        <Metric label="renders" value={String(total)} cls="text-white" />
        <Metric label="wasted" value={String(wasted)} cls={wasted ? 'text-nx-crimson' : 'text-emerald-400'} testId="total-wasted" />
        <Metric label="wasted ms" value={wastedMs.toFixed(0)} cls="text-nx-amber" />
      </div>
      <div className="rounded-lg border border-line bg-[#04060a] p-3">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-mute">Render log (newest first)</div>
        <div className="space-y-0.5 font-mono text-[11px]">
          {store.log.map((l) => (
            <div key={l.id} className="flex gap-2">
              <span className={`w-28 shrink-0 ${l.wasted ? 'text-nx-crimson' : 'text-nx-cyan'}`}>{l.name}</span>
              <span className={`truncate ${l.wasted ? 'text-rose-300/80' : 'text-slate-400'}`} title={l.reason}>{l.reason}</span>
            </div>
          ))}
          {!store.log.length && <div className="text-slate-600">Click Increment.</div>}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, cls, testId }: { label: string; value: string; cls: string; testId?: string }) {
  return (
    <div className="rounded-md border border-line bg-[#04060a] px-2 py-1.5 text-center">
      <div className="text-[9px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className={`text-lg font-bold ${cls}`} data-testid={testId}>{value}</div>
    </div>
  );
}

function XRayRoot() {
  const [store] = useState(() => new RenderStore());
  const [memoOn, setMemoOn] = useState(false);
  const [useCb, setUseCb] = useState(false);
  const [epoch, setEpoch] = useState(0);

  // Configuration changes remount the tree with fresh counters.
  const reconfigure = (fn: () => void) => {
    store.reset();
    fn();
    setEpoch((e) => e + 1);
  };

  const verdict = !memoOn
    ? 'Without React.memo, every child re-renders whenever App re-renders, even when its props are identical.'
    : !useCb
      ? 'React.memo skips Header (primitive props), but HeavyList and MemoizedChild still re-render: they receive a NEW function on every App render, so the shallow prop comparison fails.'
      : 'memo + useCallback: handler identities are stable, so only components whose data actually changed re-render.';

  return (
    <StoreCtx.Provider value={store}>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <App key={epoch} memoOn={memoOn} useCb={useCb} />
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-nx-cyan" /> necessary render (data changed)</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-nx-crimson" /> wasted render (same props / only new functions)</span>
          </div>
        </div>
        <div className="space-y-3">
          <div className="rounded-lg border border-line bg-panel-2/40 p-3">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-mute">Optimisations</div>
            <Toggle label="Wrap children in React.memo" on={memoOn} set={(v) => reconfigure(() => setMemoOn(v))} />
            <Toggle label="Stabilise handlers with useCallback" on={useCb} set={(v) => reconfigure(() => setUseCb(v))} />
            <button onClick={() => reconfigure(() => undefined)} className="mt-2 flex items-center gap-1 text-[11px] text-mute hover:text-ink">
              <RotateCcw className="h-3 w-3" /> reset counters
            </button>
            <p className={`mt-2 rounded-md px-2 py-1.5 text-[11px] leading-4 ${memoOn && useCb ? 'bg-emerald-500/10 text-emerald-300' : 'bg-nx-amber/10 text-amber-200'}`}>{verdict}</p>
          </div>
          <StatsPanel store={store} />
          <pre className="overflow-x-auto rounded-lg border border-line bg-[#05070b] p-3 font-mono text-[11px] leading-5 text-slate-300">
{`${memoOn ? 'const HeavyList = memo(function HeavyList(p) {…});' : 'function HeavyList(p) {…}'}

// inside App
${useCb ? 'const onSelect = useCallback(\n  (i) => setSelected(i), []);' : 'const onSelect = (i) => setSelected(i);\n// ↑ new function every render'}`}
          </pre>
        </div>
      </div>
    </StoreCtx.Provider>
  );
}

/** Mounts XRayRoot in an isolated React root (no StrictMode double renders). */
export function RenderXRay() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = document.createElement('div');
    host.current!.appendChild(container);
    const root = createRoot(container);
    root.render(<XRayRoot />);
    return () => {
      // defer: React warns when unmounting a root during another root's commit
      setTimeout(() => {
        root.unmount();
        container.remove();
      }, 0);
    };
  }, []);
  return <div ref={host} data-testid="render-xray-host" />;
}
