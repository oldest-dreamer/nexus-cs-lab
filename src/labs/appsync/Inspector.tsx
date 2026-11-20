import { useState, type ReactNode } from 'react';
import { ArrowRight, Cloud, Database, Download, Inbox, Pencil, Plane, RotateCcw, Server, Smartphone, Wifi, Zap } from 'lucide-react';
import { describe, type HttpEntry, type Mutation, type Net, type UiMode } from './engine';
import { LATENCY, type SyncSim } from './useSyncSim';
import { Slider } from '../shared/controls';

const NETS: { id: Net; label: string; icon: ReactNode }[] = [
  { id: 'online', label: 'Online', icon: <Wifi className="h-3.5 w-3.5" /> },
  { id: 'slow3g', label: 'Slow 3G', icon: <span className="font-mono text-[10px] font-bold">3G</span> },
  { id: 'offline', label: 'Offline', icon: <Plane className="h-3.5 w-3.5" /> },
];

const MODES: { id: UiMode; label: string; desc: string }[] = [
  { id: 'optimistic', label: 'Optimistic UI', desc: 'apply instantly, sync in background' },
  { id: 'pessimistic', label: 'Wait-for-server', desc: 'spinner until the API confirms' },
];

export function statusCls(status: number) {
  if (status === 0) return 'border-slate-500/50 bg-slate-500/15 text-slate-300';
  if (status < 300) return 'border-emerald-500/50 bg-emerald-500/15 text-emerald-400';
  if (status === 409) return 'border-nx-crimson/50 bg-nx-crimson/15 text-nx-crimson';
  return 'border-nx-amber/50 bg-nx-amber/15 text-nx-amber';
}

export function Inspector({ sim }: { sim: SyncSim }) {
  const { state, net, setNet, mode, setMode, rate503, setRate503, inflight, actions } = sim;

  return (
    <div className="min-w-0 space-y-3">
      {/* controls */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Network">
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-obsidian p-1" role="radiogroup" aria-label="Network condition">
            {NETS.map((n) => (
              <button
                key={n.id}
                role="radio"
                aria-checked={net === n.id}
                onClick={() => setNet(n.id)}
                className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold ${
                  net === n.id ? (n.id === 'offline' ? 'bg-slate-600 text-white' : n.id === 'slow3g' ? 'bg-nx-amber/25 text-nx-amber' : 'bg-nx-cyan/25 text-nx-cyan') : 'text-mute hover:text-ink'
                }`}
              >
                {n.icon} {n.label}
              </button>
            ))}
          </div>
          <div className="mt-2 font-mono text-[10px] text-slate-500">
            latency {net === 'offline' ? '∞ (no route)' : `${LATENCY[net][0]}–${LATENCY[net][1]}ms`}
          </div>
          <div className="mt-2">
            <Slider label="Server 503 rate" unit="" min={0} max={0.6} step={0.05} value={rate503} onChange={setRate503} />
          </div>
        </Panel>
        <Panel title="UI strategy">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-obsidian p-1" role="radiogroup" aria-label="UI strategy">
            {MODES.map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={mode === m.id}
                onClick={() => setMode(m.id)}
                className={`rounded-md px-2 py-1.5 text-left ${mode === m.id ? 'bg-panel-2 ring-1 ring-nx-cyan/50' : 'hover:bg-panel-2/50'}`}
              >
                <div className={`text-xs font-semibold ${mode === m.id ? 'text-nx-cyan' : 'text-slate-300'}`}>{m.label}</div>
                <div className="text-[10px] text-slate-500">{m.desc}</div>
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={actions.pull} className="nx-btn-ghost py-1 text-xs"><Download className="h-3.5 w-3.5" /> Pull from server</button>
            <button onClick={actions.reset} className="nx-btn-ghost py-1 text-xs"><RotateCcw className="h-3.5 w-3.5" /> Reset</button>
          </div>
        </Panel>
      </div>

      {/* architecture flow */}
      <Panel title="Architecture: data flow">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <FlowBox icon={<Smartphone className="h-4 w-4" />} label="UI" sub={mode === 'optimistic' ? 'optimistic' : 'awaits ack'} />
          <ArrowRight className="h-4 w-4 shrink-0 text-slate-600" />
          <FlowBox icon={<Database className="h-4 w-4" />} label="Local DB" sub={`${state.local.length} rows`} />
          <ArrowRight className="h-4 w-4 shrink-0 text-slate-600" />
          <FlowBox icon={<Inbox className="h-4 w-4" />} label="Outbox" sub={`${state.outbox.length} queued`} hot={state.outbox.length > 0} />
          {/* wire */}
          <div className="relative mx-1 h-6 min-w-[90px] flex-1">
            <div className={`absolute inset-x-0 top-1/2 border-t-2 ${net === 'offline' ? 'border-dashed border-slate-600' : net === 'slow3g' ? 'border-dotted border-nx-amber/60' : 'border-nx-cyan/50'}`} />
            {net === 'offline' && <span className="absolute left-1/2 top-0 -translate-x-1/2 rounded bg-obsidian px-1 font-mono text-[9px] text-slate-400">✈ no network</span>}
            {inflight && (
              <span
                key={inflight.key}
                className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-nx-cyan shadow-[0_0_12px_2px_rgba(6,182,212,0.8)]"
                style={{ animation: `nx-packet ${inflight.ms}ms linear forwards` }}
                data-testid="packet"
              />
            )}
          </div>
          <FlowBox icon={<Cloud className="h-4 w-4" />} label="API" sub="/api/tasks" />
          <ArrowRight className="h-4 w-4 shrink-0 text-slate-600" />
          <FlowBox icon={<Server className="h-4 w-4" />} label="Server DB" sub={`${state.server.length} rows`} />
        </div>
      </Panel>

      <div className="grid gap-3 2xl:grid-cols-2">
        <OutboxPanel outbox={state.outbox} />
        <DbPanel sim={sim} />
      </div>

      <HttpPanel http={state.http} />

      <Panel title="Sync event timeline">
        <div className="max-h-40 space-y-0.5 overflow-y-auto font-mono text-[11px]">
          {state.events.map((e) => (
            <div key={e.id} className={e.tone === 'err' ? 'text-nx-crimson' : e.tone === 'warn' ? 'text-nx-amber' : e.tone === 'ok' ? 'text-emerald-400' : 'text-slate-400'}>
              <span className="mr-2 text-slate-600">{e.at ? new Date(e.at).toLocaleTimeString([], { hour12: false }) : '--:--:--'}</span>
              {e.text}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
function OutboxPanel({ outbox }: { outbox: Mutation[] }) {
  return (
    <Panel title={`Local storage · outbox sync queue (${outbox.length})`} testId="outbox">
      <div className="min-h-[7rem] space-y-1.5">
        {outbox.map((m, i) => {
          const waitS = m.state === 'backoff' ? Math.max(0, (m.nextAttemptAt - Date.now()) / 1000) : 0;
          const cls =
            m.state === 'inflight'
              ? 'border-nx-cyan/60 bg-nx-cyan/10 animate-pulse'
              : m.state === 'conflict'
                ? 'border-nx-crimson/60 bg-nx-crimson/10'
                : m.state === 'backoff'
                  ? 'border-nx-amber/50 bg-nx-amber/10'
                  : 'border-line bg-obsidian';
          return (
            <div key={m.key} className={`animate-toast-in rounded-md border px-2 py-1.5 font-mono text-[11px] ${cls}`} data-testid="outbox-item">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-slate-200">
                  <span className="mr-1.5 text-slate-600">#{i + 1}</span>
                  <span className={m.type === 'create' ? 'text-emerald-400' : m.type === 'delete' ? 'text-nx-crimson' : 'text-nx-cyan'}>{m.type.toUpperCase()}</span>{' '}
                  {describe(m).replace(/^(CREATE|UPDATE|DELETE)\s*/, '')} <span className="text-slate-500">{m.taskId}</span>
                </span>
                <span className="shrink-0 text-[10px] uppercase text-slate-400">
                  {m.state === 'backoff' ? `retry in ${waitS.toFixed(1)}s` : m.state}
                  {m.blocking && ' · blocking'}
                </span>
              </div>
              <div className="mt-0.5 flex justify-between text-[10px] text-slate-500">
                <span>Idempotency-Key: {m.key}</span>
                <span>base v{m.baseVersion} · attempts {m.attempts}</span>
              </div>
            </div>
          );
        })}
        {!outbox.length && <div className="rounded-md border border-dashed border-line py-6 text-center text-[11px] text-slate-600">Outbox empty: everything is synced.</div>}
      </div>
    </Panel>
  );
}

function DbPanel({ sim }: { sim: SyncSim }) {
  const { state, actions } = sim;
  return (
    <Panel title="Device DB vs server DB">
      <table className="w-full font-mono text-[11px]">
        <thead className="text-[9px] uppercase tracking-widest text-slate-500">
          <tr>
            <th className="pb-1 text-left font-normal">id</th>
            <th className="pb-1 text-left font-normal">device</th>
            <th className="pb-1 text-left font-normal">server</th>
            <th className="pb-1" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line/60">
          {[...new Set([...state.local.map((t) => t.id), ...state.server.map((t) => t.id)])].map((id) => {
            const l = state.local.find((t) => t.id === id);
            const s = state.server.find((t) => t.id === id);
            const diverged = !l || !s || l.title !== s.title || l.done !== s.done || l.version !== s.version;
            return (
              <tr key={id} className={diverged ? 'bg-nx-amber/5' : ''}>
                <td className="py-1 pr-2 text-slate-500">{id.slice(0, 8)}</td>
                <td className="max-w-[9rem] truncate py-1 pr-2 text-slate-300" title={l?.title}>{l ? `${l.done ? '☑' : '☐'} ${l.title} · v${l.version}` : <span className="text-slate-600">—</span>}</td>
                <td className="max-w-[9rem] truncate py-1 pr-2 text-slate-300" title={s?.title}>{s ? `${s.done ? '☑' : '☐'} ${s.title} · v${s.version}` : <span className="text-slate-600">—</span>}</td>
                <td className="py-1 text-right">
                  {s && (
                    <button onClick={() => actions.remoteEdit(id)} className="rounded border border-line p-0.5 text-slate-400 hover:border-nx-amber/50 hover:text-nx-amber" title="Edit this task from another device (creates a server-side change)" aria-label={`Edit ${id} on another device`}>
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-slate-500">
        <Zap className="mr-1 inline h-3 w-3 text-nx-amber" />
        Use ✎ to simulate another device editing a task, then edit the same task on the phone to trigger a <b className="text-nx-crimson">409</b>.
      </p>
    </Panel>
  );
}

function HttpPanel({ http }: { http: HttpEntry[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <Panel title="API inspector (network log)" testId="http-log">
      <div className="max-h-64 overflow-y-auto">
        <table className="w-full font-mono text-[11px]">
          <thead className="sticky top-0 bg-panel-2 text-[9px] uppercase tracking-widest text-slate-500">
            <tr>
              <th className="py-1 pl-1 text-left font-normal">method</th>
              <th className="py-1 text-left font-normal">path</th>
              <th className="py-1 text-left font-normal">status</th>
              <th className="py-1 pr-1 text-right font-normal">time</th>
            </tr>
          </thead>
          <tbody>
            {http.map((h) => (
              <FragmentRow key={h.id} h={h} open={open === h.id} onToggle={() => setOpen(open === h.id ? null : h.id)} />
            ))}
          </tbody>
        </table>
        {!http.length && <div className="py-4 text-center text-[11px] text-slate-600">No requests yet.</div>}
      </div>
    </Panel>
  );
}

function FragmentRow({ h, open, onToggle }: { h: HttpEntry; open: boolean; onToggle: () => void }) {
  return (
    <>
      <tr onClick={onToggle} className="animate-toast-in cursor-pointer border-t border-line/60 hover:bg-panel-2/60" data-testid="http-row">
        <td className={`py-1 pl-1 font-bold ${h.method === 'POST' ? 'text-emerald-400' : h.method === 'DELETE' ? 'text-nx-crimson' : h.method === 'GET' ? 'text-violet-300' : 'text-nx-cyan'}`}>{h.method}</td>
        <td className="max-w-[12rem] truncate py-1 text-slate-300">{h.path}</td>
        <td className="py-1">
          <span className={`rounded border px-1.5 py-px ${statusCls(h.status)}`}>{h.status === 0 ? 'ERR' : h.status} {h.statusText}</span>
          {h.note?.startsWith('Idempotent') && <span className="ml-1 text-[10px] text-violet-300">replay</span>}
        </td>
        <td className="py-1 pr-1 text-right text-slate-500">{h.ms}ms</td>
      </tr>
      {open && (
        <tr className="bg-obsidian/70">
          <td colSpan={4} className="px-2 py-2">
            {h.note && <div className="mb-1 text-[10px] text-nx-amber">ℹ {h.note}</div>}
            {h.key && <div className="text-[10px] text-slate-500">Idempotency-Key: {h.key}</div>}
            <div className="mt-1 grid gap-2 md:grid-cols-2">
              <pre className="overflow-x-auto rounded bg-[#04060a] p-2 text-[10px] text-slate-300">{`→ request\n${JSON.stringify(h.req ?? null, null, 2)}`}</pre>
              <pre className="overflow-x-auto rounded bg-[#04060a] p-2 text-[10px] text-slate-300">{`← response\n${h.status === 0 ? '(no response)' : JSON.stringify(h.res ?? null, null, 2)}`}</pre>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function FlowBox({ icon, label, sub, hot }: { icon: ReactNode; label: string; sub: string; hot?: boolean }) {
  return (
    <div className={`shrink-0 rounded-md border px-2 py-1 text-center ${hot ? 'border-nx-amber/60 bg-nx-amber/10' : 'border-line bg-obsidian'}`}>
      <div className={`flex items-center justify-center gap-1 text-[11px] font-semibold ${hot ? 'text-nx-amber' : 'text-slate-200'}`}>{icon} {label}</div>
      <div className="font-mono text-[9px] text-slate-500">{sub}</div>
    </div>
  );
}

function Panel({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel-2/40 p-3" data-testid={testId}>
      <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-mute">{title}</div>
      {children}
    </div>
  );
}
