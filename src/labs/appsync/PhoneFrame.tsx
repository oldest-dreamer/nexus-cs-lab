import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, BatteryFull, Check, CloudOff, Loader2, Pencil, Plane, Plus, RefreshCw, Signal, Trash2, Wifi, X } from 'lucide-react';
import type { LocalTask } from './engine';
import type { SyncSim } from './useSyncSim';

/** A realistic phone frame running a tiny tasks app on top of the sync engine. */
export function PhoneFrame({ sim }: { sim: SyncSim }) {
  const { state, net, mode, actions } = sim;
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [clock, setClock] = useState(() => new Date());
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const iv = setInterval(() => setClock(new Date()), 15_000);
    return () => clearInterval(iv);
  }, []);

  // surface the newest error event as an in-app toast
  const lastErr = state.events.find((e) => e.tone === 'err');
  useEffect(() => {
    if (!lastErr || Date.now() - lastErr.at > 4000) return;
    setToast(lastErr.text);
    const t = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(t);
  }, [lastErr?.id]); // keyed on the event id: show each error once

  const pending = state.outbox.length;
  const savingCreate = mode === 'pessimistic' && state.outbox.some((m) => m.blocking && m.type === 'create');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = draft.trim();
    if (!t) return;
    if (actions.add(t) !== false) setDraft('');
  };

  const saveEdit = (id: string) => {
    const t = editText.trim();
    if (t) actions.edit(id, t);
    setEditing(null);
  };

  const status = state.conflict
    ? { text: 'Conflict', cls: 'bg-nx-crimson/20 text-nx-crimson', icon: <AlertTriangle className="h-3 w-3" /> }
    : net === 'offline'
      ? { text: pending ? `Offline · ${pending} queued` : 'Offline', cls: 'bg-slate-700/60 text-slate-300', icon: <CloudOff className="h-3 w-3" /> }
      : pending
        ? { text: `Syncing ${pending}…`, cls: 'bg-nx-amber/20 text-nx-amber', icon: <RefreshCw className="h-3 w-3 animate-spin" /> }
        : { text: 'All synced', cls: 'bg-emerald-500/15 text-emerald-400', icon: <Check className="h-3 w-3" /> };

  return (
    <div className="mx-auto w-[300px] shrink-0 select-none">
      <div className="relative h-[620px] rounded-[46px] border-[10px] border-[#1b2130] bg-black p-0 shadow-[0_30px_80px_-20px_rgba(6,182,212,0.35),inset_0_0_0_2px_#2a3142]">
        {/* side buttons */}
        <span className="absolute -left-[13px] top-28 h-12 w-[3px] rounded-l bg-[#2a3142]" />
        <span className="absolute -right-[13px] top-36 h-20 w-[3px] rounded-r bg-[#2a3142]" />
        <div className="relative flex h-full flex-col overflow-hidden rounded-[36px] bg-[#0b0f17]">
          {/* status bar */}
          <div className="relative flex h-10 items-center justify-between px-6 pt-1 text-[11px] font-semibold text-white">
            <span>{clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
            <span className="absolute left-1/2 top-2 h-6 w-24 -translate-x-1/2 rounded-full bg-black" />
            <span className="flex items-center gap-1">
              {net === 'offline' ? (
                <Plane className="h-3.5 w-3.5 text-nx-amber" />
              ) : (
                <>
                  <Signal className={`h-3.5 w-3.5 ${net === 'slow3g' ? 'text-nx-amber' : ''}`} />
                  {net === 'slow3g' ? <span className="text-[9px] text-nx-amber">3G</span> : <Wifi className="h-3.5 w-3.5" />}
                </>
              )}
              <BatteryFull className="h-4 w-4" />
            </span>
          </div>

          {/* app header */}
          <div className="flex items-center justify-between px-5 pb-2 pt-2">
            <h3 className="text-xl font-extrabold text-white">Tasks</h3>
            <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.cls}`} data-testid="phone-status">
              {status.icon} {status.text}
            </span>
          </div>

          {net !== 'online' && (
            <div className={`mx-4 mb-2 rounded-lg px-3 py-1.5 text-[11px] ${net === 'offline' ? 'bg-slate-800 text-slate-300' : 'bg-nx-amber/10 text-nx-amber'}`}>
              {net === 'offline'
                ? mode === 'optimistic'
                  ? "You're offline. Changes are saved on this device and will sync later."
                  : "You're offline. Saving is disabled until you reconnect."
                : 'Slow connection: requests may take a few seconds.'}
            </div>
          )}

          {/* add form */}
          <form onSubmit={submit} className="mx-4 mb-2 flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="New task…"
              className="min-w-0 flex-1 rounded-xl border border-line bg-panel px-3 py-2 text-sm text-ink placeholder:text-slate-600 focus:border-nx-cyan/60 focus:outline-none"
              aria-label="New task title"
              disabled={savingCreate}
            />
            <button className="flex h-9 w-9 items-center justify-center rounded-xl bg-nx-cyan text-obsidian disabled:opacity-50" disabled={savingCreate || !draft.trim()} aria-label="Add task">
              {savingCreate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-5 w-5" />}
            </button>
          </form>

          {/* list */}
          <ul className="flex-1 space-y-1.5 overflow-y-auto px-4 pb-4">
            {state.local.map((t) => (
              <Row
                key={t.id}
                t={t}
                editing={editing === t.id}
                editText={editText}
                setEditText={setEditText}
                onStartEdit={() => {
                  setEditing(t.id);
                  setEditText(t.title);
                }}
                onSave={() => saveEdit(t.id)}
                onCancel={() => setEditing(null)}
                onToggle={() => actions.toggle(t.id)}
                onDelete={() => actions.remove(t.id)}
              />
            ))}
            {!state.local.length && <li className="pt-10 text-center text-sm text-slate-600">No tasks. Add one above.</li>}
          </ul>

          {/* toast */}
          {toast && (
            <div className="absolute inset-x-4 bottom-24 animate-toast-in rounded-xl border border-nx-crimson/40 bg-[#1a0b10]/95 px-3 py-2 text-[11px] leading-4 text-rose-200 shadow-xl">
              {toast}
            </div>
          )}

          {/* conflict bottom sheet */}
          {state.conflict && <ConflictSheet sim={sim} />}

          {/* home indicator */}
          <div className="flex h-6 shrink-0 items-center justify-center">
            <span className="h-1 w-28 rounded-full bg-white/70" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  t,
  editing,
  editText,
  setEditText,
  onStartEdit,
  onSave,
  onCancel,
  onToggle,
  onDelete,
}: {
  t: LocalTask;
  editing: boolean;
  editText: string;
  setEditText: (s: string) => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const saving = t.sync === 'saving';
  return (
    <li
      className={`group flex items-center gap-2 rounded-xl border px-2.5 py-2 transition ${
        t.sync === 'conflict' ? 'border-nx-crimson/60 bg-nx-crimson/10' : saving ? 'border-line bg-panel opacity-60' : 'border-line bg-panel'
      }`}
      data-testid={`task-${t.id}`}
    >
      <button
        onClick={onToggle}
        disabled={saving}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${t.done ? 'border-emerald-400 bg-emerald-400 text-obsidian' : 'border-slate-500'}`}
        aria-label={t.done ? 'Mark not done' : 'Mark done'}
      >
        {t.done && <Check className="h-3 w-3" strokeWidth={3} />}
      </button>
      {editing ? (
        <form
          className="flex min-w-0 flex-1 gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
        >
          <input autoFocus value={editText} onChange={(e) => setEditText(e.target.value)} className="min-w-0 flex-1 rounded-md bg-obsidian px-1.5 py-0.5 text-[13px] text-ink outline-none ring-1 ring-nx-cyan/50" aria-label="Edit title" />
          <button className="text-emerald-400" aria-label="Save"><Check className="h-4 w-4" /></button>
          <button type="button" onClick={onCancel} className="text-slate-500" aria-label="Cancel"><X className="h-4 w-4" /></button>
        </form>
      ) : (
        <span onDoubleClick={onStartEdit} className={`min-w-0 flex-1 truncate text-[13px] ${t.done ? 'text-slate-500 line-through' : 'text-slate-100'}`}>
          {t.title}
        </span>
      )}
      {!editing && (
        <>
          <SyncDot sync={t.sync} />
          <button onClick={onStartEdit} disabled={saving} className="text-slate-500 hover:text-nx-cyan" aria-label={`Edit ${t.title}`}><Pencil className="h-3.5 w-3.5" /></button>
          <button onClick={onDelete} disabled={saving} className="text-slate-500 hover:text-nx-crimson" aria-label={`Delete ${t.title}`}><Trash2 className="h-3.5 w-3.5" /></button>
        </>
      )}
    </li>
  );
}

function SyncDot({ sync }: { sync: LocalTask['sync'] }) {
  if (sync === 'synced') return <span title="synced" className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />;
  if (sync === 'pending') return <span title="pending sync" className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-nx-amber" />;
  if (sync === 'saving') return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-nx-cyan" aria-label="saving" />;
  return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-nx-crimson" aria-label="conflict" />;
}

function ConflictSheet({ sim }: { sim: SyncSim }) {
  const c = sim.state.conflict!;
  const field = (label: string, a: string, b: string) => (
    <div className="grid grid-cols-[52px_1fr_1fr] gap-1.5 text-[11px]">
      <span className="text-slate-500">{label}</span>
      <span className={`truncate rounded bg-nx-cyan/10 px-1.5 py-0.5 ${a !== b ? 'text-nx-cyan' : 'text-slate-400'}`} title={a}>{a}</span>
      <span className={`truncate rounded bg-nx-amber/10 px-1.5 py-0.5 ${a !== b ? 'text-nx-amber' : 'text-slate-400'}`} title={b}>{b}</span>
    </div>
  );
  const L = c.local, S = c.server;
  return (
    <div className="absolute inset-0 z-10 flex items-end bg-black/50 backdrop-blur-[2px]">
      <div className="w-full animate-toast-in rounded-t-3xl border-t border-nx-crimson/40 bg-[#111622] p-4 pb-8" role="dialog" aria-label="Sync conflict">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-600" />
        <div className="mb-1 flex items-center gap-1.5 text-sm font-bold text-nx-crimson">
          <AlertTriangle className="h-4 w-4" /> Sync conflict (409)
        </div>
        <p className="mb-3 text-[11px] leading-4 text-slate-400">
          {S ? `This task was changed on another device (server v${S.version}) after you edited v${L?.version ?? '?'}.` : 'This task was deleted on another device while you edited it.'}
        </p>
        <div className="mb-3 space-y-1">
          <div className="grid grid-cols-[52px_1fr_1fr] gap-1.5 text-[10px] font-bold uppercase tracking-widest">
            <span />
            <span className="text-nx-cyan">This phone</span>
            <span className="text-nx-amber">Server</span>
          </div>
          {field('title', L?.title ?? '(deleted)', S?.title ?? '(deleted)')}
          {field('done', String(L?.done ?? '—'), String(S?.done ?? '—'))}
          {field('version', String(L?.version ?? '—'), String(S?.version ?? '—'))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => sim.actions.resolve('local')} className="rounded-xl bg-nx-cyan py-2 text-xs font-bold text-obsidian">Keep Local</button>
          <button onClick={() => sim.actions.resolve('server')} className="rounded-xl border border-nx-amber/50 bg-nx-amber/10 py-2 text-xs font-bold text-nx-amber">Keep Server</button>
        </div>
      </div>
    </div>
  );
}
