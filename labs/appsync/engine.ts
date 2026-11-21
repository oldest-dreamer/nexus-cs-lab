/**
 * Offline-first sync engine (pure reducer) + a simulated backend.
 *
 *   UI ──▶ Local DB ──▶ Outbox (FIFO, idempotency keys) ──▶ network ──▶ API ──▶ Server DB
 *
 * - Optimistic mode: writes hit the local DB instantly; mutations queue in the outbox.
 * - Wait-for-server mode: the UI shows "saving…" and only applies the change after a 2xx.
 * - Server enforces optimistic concurrency: writes carry `baseVersion`; a mismatch → 409.
 * - 503s back off exponentially; lost responses are retried with the SAME idempotency
 *   key, so the server replays its stored result instead of applying twice.
 * Randomness and time are passed in through actions, so the reducer stays pure/testable.
 */

export type Net = 'online' | 'slow3g' | 'offline';
export type UiMode = 'optimistic' | 'pessimistic';

export interface Task {
  id: string;
  title: string;
  done: boolean;
  version: number;
}

export type SyncBadge = 'synced' | 'pending' | 'saving' | 'conflict';
export interface LocalTask extends Task {
  sync: SyncBadge;
}

export type MutType = 'create' | 'update' | 'delete';

export interface Mutation {
  key: string; // idempotency key
  type: MutType;
  taskId: string;
  patch: Partial<Pick<Task, 'title' | 'done'>>;
  snapshot?: Task; // full task for creates
  baseVersion: number;
  attempts: number;
  state: 'queued' | 'inflight' | 'backoff' | 'conflict';
  nextAttemptAt: number;
  blocking: boolean; // wait-for-server: not applied locally until acknowledged
  createdAt: number;
}

export interface HttpEntry {
  id: number;
  at: number;
  method: 'POST' | 'PATCH' | 'DELETE' | 'GET';
  path: string;
  status: number; // 0 = network error
  statusText: string;
  ms: number;
  key?: string;
  req?: unknown;
  res?: unknown;
  note?: string;
}

export interface Conflict {
  key: string;
  taskId: string;
  local: Task | null;
  server: Task | null;
}

export interface SyncEvent {
  id: number;
  at: number;
  tone: 'info' | 'ok' | 'warn' | 'err';
  text: string;
}

export interface SimState {
  local: LocalTask[];
  server: Task[];
  outbox: Mutation[];
  http: HttpEntry[];
  processed: Record<string, { status: number; body: unknown }>;
  conflict: Conflict | null;
  events: SyncEvent[];
  seq: number;
}

export type Action =
  | { type: 'add'; id: string; key: string; title: string; mode: UiMode; now: number }
  | { type: 'edit'; id: string; key: string; title: string; mode: UiMode; now: number }
  | { type: 'toggle'; id: string; key: string; mode: UiMode; now: number }
  | { type: 'delete'; id: string; key: string; mode: UiMode; now: number }
  | { type: 'sendStart'; key: string; now: number }
  | { type: 'response'; key: string; now: number; ms: number; lost: boolean; serverGotIt: boolean; roll503: number; rate503: number }
  | { type: 'resolve'; choice: 'local' | 'server'; now: number }
  | { type: 'remoteEdit'; id: string; now: number }
  | { type: 'pull'; now: number; ms: number }
  | { type: 'reject'; text: string; now: number }
  | { type: 'reset' };

const SEED: Task[] = [
  { id: 't-1', title: 'Review PR #42', done: false, version: 1 },
  { id: 't-2', title: 'Book dentist appointment', done: true, version: 1 },
  { id: 't-3', title: 'Ship Day 3 labs', done: false, version: 1 },
];

export function initialState(): SimState {
  return {
    local: SEED.map((t) => ({ ...t, sync: 'synced' })),
    server: SEED.map((t) => ({ ...t })),
    outbox: [],
    http: [],
    processed: {},
    conflict: null,
    events: [{ id: 1, at: 0, tone: 'info', text: 'Device and server in sync (3 tasks, v1).' }],
    seq: 1,
  };
}

export const backoffMs = (attempts: number) => Math.min(10_000, 1000 * 2 ** Math.max(0, attempts - 1));

export function describe(m: Pick<Mutation, 'type' | 'patch' | 'snapshot'>): string {
  if (m.type === 'create') return `CREATE "${m.snapshot?.title ?? ''}"`;
  if (m.type === 'delete') return 'DELETE';
  const parts: string[] = [];
  if (m.patch.title !== undefined) parts.push(`title → "${m.patch.title}"`);
  if (m.patch.done !== undefined) parts.push(`done → ${m.patch.done}`);
  return `UPDATE ${parts.join(', ')}`;
}

export function request(m: Mutation): { method: HttpEntry['method']; path: string; body: unknown } {
  if (m.type === 'create') return { method: 'POST', path: '/api/tasks', body: { ...m.snapshot, version: undefined } };
  if (m.type === 'delete') return { method: 'DELETE', path: `/api/tasks/${m.taskId}`, body: { baseVersion: m.baseVersion } };
  return { method: 'PATCH', path: `/api/tasks/${m.taskId}`, body: { ...m.patch, baseVersion: m.baseVersion } };
}

// ---------------------------------------------------------------------------
// Simulated backend (optimistic concurrency + idempotency store)
// ---------------------------------------------------------------------------
interface ServerResult {
  status: number;
  body: unknown;
  server: Task[];
}

function serverApply(m: Mutation, server: Task[]): ServerResult {
  const cur = server.find((t) => t.id === m.taskId) ?? null;
  if (m.type === 'create') {
    if (cur) return { status: 200, body: cur, server }; // already exists → idempotent
    const t: Task = { ...m.snapshot!, version: 1 };
    return { status: 201, body: t, server: [...server, t] };
  }
  if (m.type === 'delete') {
    if (!cur) return { status: 204, body: null, server }; // already gone → idempotent delete
    if (cur.version !== m.baseVersion) return { status: 409, body: { error: 'version_mismatch', server: cur }, server };
    return { status: 204, body: null, server: server.filter((t) => t.id !== m.taskId) };
  }
  if (!cur) return { status: 409, body: { error: 'deleted_on_server', server: null }, server };
  if (cur.version !== m.baseVersion) return { status: 409, body: { error: 'version_mismatch', server: cur }, server };
  const next: Task = { ...cur, ...m.patch, version: cur.version + 1 };
  return { status: 200, body: next, server: server.map((t) => (t.id === cur.id ? next : t)) };
}

const STATUS_TEXT: Record<number, string> = {
  0: 'Network error',
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  409: 'Conflict',
  503: 'Service Unavailable',
};

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------
function ev(s: SimState, now: number, tone: SyncEvent['tone'], text: string): SimState {
  const id = s.seq + 1;
  return { ...s, seq: id, events: [{ id, at: now, tone, text }, ...s.events].slice(0, 40) };
}

function http(s: SimState, e: Omit<HttpEntry, 'id'>): SimState {
  const id = s.seq + 1;
  return { ...s, seq: id, http: [{ ...e, id }, ...s.http].slice(0, 60) };
}

function badgeFor(s: SimState, taskId: string): SyncBadge {
  const ms = s.outbox.filter((m) => m.taskId === taskId);
  if (ms.some((m) => m.state === 'conflict')) return 'conflict';
  if (ms.some((m) => m.blocking)) return 'saving';
  return ms.length ? 'pending' : 'synced';
}

function refreshBadges(s: SimState): SimState {
  return { ...s, local: s.local.map((t) => ({ ...t, sync: badgeFor(s, t.id) })) };
}

const newMutation = (a: { key: string; id: string; now: number; mode: UiMode }, type: MutType, patch: Mutation['patch'], baseVersion: number, snapshot?: Task): Mutation => ({
  key: a.key,
  type,
  taskId: a.id,
  patch,
  snapshot,
  baseVersion,
  attempts: 0,
  state: 'queued',
  nextAttemptAt: 0,
  blocking: a.mode === 'pessimistic',
  createdAt: a.now,
});

/** Merge a local edit into a not-yet-sent mutation for the same task (outbox compaction). */
function tryCompact(s: SimState, taskId: string, patch: Mutation['patch'], mode: UiMode): SimState | null {
  if (mode !== 'optimistic') return null;
  const idx = s.outbox.findIndex((m) => m.taskId === taskId && (m.state === 'queued' || m.state === 'backoff') && !m.blocking && m.type !== 'delete');
  if (idx < 0) return null;
  const m = s.outbox[idx];
  const merged: Mutation = m.type === 'create' ? { ...m, snapshot: { ...m.snapshot!, ...patch } } : { ...m, patch: { ...m.patch, ...patch } };
  const outbox = s.outbox.slice();
  outbox[idx] = merged;
  return { ...s, outbox };
}

export function reducer(state: SimState, a: Action): SimState {
  let s = state;
  switch (a.type) {
    case 'reset':
      return initialState();

    case 'reject':
      return ev(s, a.now, 'err', a.text);

    case 'add': {
      const task: Task = { id: a.id, title: a.title, done: false, version: 0 };
      s = { ...s, local: [{ ...task, sync: a.mode === 'optimistic' ? 'pending' : 'saving' }, ...s.local], outbox: [...s.outbox, newMutation(a, 'create', {}, 0, task)] };
      s = ev(s, a.now, 'info', a.mode === 'optimistic' ? `Saved locally + queued CREATE "${a.title}"` : `Waiting for server to confirm "${a.title}"…`);
      return refreshBadges(s);
    }

    case 'edit':
    case 'toggle': {
      const cur = s.local.find((t) => t.id === a.id);
      if (!cur) return s;
      const patch: Mutation['patch'] = a.type === 'edit' ? { title: a.title } : { done: !cur.done };
      if (a.mode === 'optimistic') s = { ...s, local: s.local.map((t) => (t.id === a.id ? { ...t, ...patch } : t)) };
      const compacted = tryCompact(s, a.id, patch, a.mode);
      if (compacted) {
        s = ev(compacted, a.now, 'info', `Outbox compaction: change merged into the pending mutation for "${cur.title}" (one request instead of two)`);
      } else {
        s = { ...s, outbox: [...s.outbox, newMutation(a, 'update', patch, cur.version)] };
        s = ev(s, a.now, 'info', `${a.mode === 'optimistic' ? 'Applied locally + queued' : 'Sending'} ${describe({ type: 'update', patch })}`);
      }
      return refreshBadges(s);
    }

    case 'delete': {
      const cur = s.local.find((t) => t.id === a.id);
      if (!cur) return s;
      if (a.mode === 'optimistic') {
        const pendingCreate = s.outbox.find((m) => m.taskId === a.id && m.type === 'create' && (m.state === 'queued' || m.state === 'backoff'));
        s = { ...s, local: s.local.filter((t) => t.id !== a.id) };
        if (pendingCreate) {
          s = { ...s, outbox: s.outbox.filter((m) => m.taskId !== a.id || m.state === 'inflight') };
          return ev(s, a.now, 'ok', `Outbox compaction: CREATE + DELETE of "${cur.title}" cancelled out, nothing to send`);
        }
        // queued (unsent) updates are pointless once the task is deleted
        s = { ...s, outbox: [...s.outbox.filter((m) => !(m.taskId === a.id && m.type === 'update' && m.state !== 'inflight')), newMutation(a, 'delete', {}, cur.version)] };
        return ev(s, a.now, 'info', `Removed locally + queued DELETE "${cur.title}"`);
      }
      s = { ...s, outbox: [...s.outbox, newMutation(a, 'delete', {}, cur.version)] };
      return refreshBadges(ev(s, a.now, 'info', `Sending DELETE "${cur.title}"…`));
    }

    case 'sendStart':
      return { ...s, outbox: s.outbox.map((m) => (m.key === a.key ? { ...m, state: 'inflight', attempts: m.attempts + 1 } : m)) };

    case 'response': {
      const m = s.outbox.find((x) => x.key === a.key);
      if (!m) return s;
      const req = request(m);
      const base = { at: a.now, method: req.method, path: req.path, ms: a.ms, key: m.key, req: req.body };

      // 1) server side
      let result: { status: number; body: unknown } | null = null;
      let replay = false;
      if (!(a.lost && !a.serverGotIt)) {
        if (s.processed[m.key]) {
          result = s.processed[m.key];
          replay = true;
        } else if (a.roll503 < a.rate503) {
          result = { status: 503, body: { error: 'overloaded', retryAfter: Math.round(backoffMs(m.attempts) / 1000) } };
        } else {
          const r = serverApply(m, s.server);
          result = { status: r.status, body: r.body };
          s = { ...s, server: r.server };
          if (r.status < 300) s = { ...s, processed: { ...s.processed, [m.key]: result } };
        }
      }

      // 2) response lost on the way back (or never arrived)
      if (a.lost) {
        s = http(s, { ...base, status: 0, statusText: STATUS_TEXT[0], note: a.serverGotIt && result && result.status < 300 ? 'connection dropped AFTER the server committed. Retry will be replayed via the idempotency key' : 'connection dropped before the server saw the request' });
        s = { ...s, outbox: s.outbox.map((x) => (x.key === m.key ? { ...x, state: 'queued' } : x)) };
        return refreshBadges(ev(s, a.now, 'warn', `Network lost during ${describe(m)}, will retry with the same idempotency key`));
      }

      const { status, body } = result!;
      s = http(s, { ...base, status, statusText: STATUS_TEXT[status] ?? '', res: body, note: replay ? 'Idempotent replay: server returned the stored result, no duplicate write' : undefined });

      // 3) client handling
      if (status < 300) {
        const srv = (body as Task | null) ?? null;
        let outbox = s.outbox.filter((x) => x.key !== m.key);
        // rebase later mutations for this task onto the new server version
        if (srv) outbox = outbox.map((x) => (x.taskId === m.taskId && x.type !== 'create' ? { ...x, baseVersion: srv.version } : x));
        s = { ...s, outbox };
        if (m.type === 'delete') {
          s = { ...s, local: s.local.filter((t) => t.id !== m.taskId) };
        } else if (srv) {
          const exists = s.local.some((t) => t.id === m.taskId);
          if (m.blocking) {
            // wait-for-server: only NOW does the UI reflect the change
            s = { ...s, local: exists ? s.local.map((t) => (t.id === m.taskId ? { ...t, ...srv } : t)) : s.local };
          } else {
            s = { ...s, local: s.local.map((t) => (t.id === m.taskId ? { ...t, version: srv.version } : t)) };
          }
        }
        s = ev(s, a.now, 'ok', `${status} ${STATUS_TEXT[status]}: ${describe(m)}${replay ? ' (replayed)' : ''}`);
        return refreshBadges(s);
      }

      if (status === 409) {
        const srv = (body as { server: Task | null }).server;
        const loc = s.local.find((t) => t.id === m.taskId) ?? null;
        if (m.blocking) {
          // pessimistic: the user never saw their change applied → show server truth
          s = { ...s, outbox: s.outbox.filter((x) => x.key !== m.key) };
          s = { ...s, local: srv ? s.local.map((t) => (t.id === m.taskId ? { ...srv, sync: 'synced' } : t)) : s.local.filter((t) => t.id !== m.taskId) };
          return refreshBadges(ev(s, a.now, 'err', `409 Conflict: someone else changed this task. Showing the latest server version.`));
        }
        s = { ...s, outbox: s.outbox.map((x) => (x.key === m.key ? { ...x, state: 'conflict' } : x)), conflict: { key: m.key, taskId: m.taskId, local: loc, server: srv } };
        return refreshBadges(ev(s, a.now, 'err', `409 Conflict on ${describe(m)}: server has v${srv?.version ?? '∅ (deleted)'}, we edited v${m.baseVersion}. Sync paused for resolution.`));
      }

      // 503
      if (m.blocking) {
        s = { ...s, outbox: s.outbox.filter((x) => x.key !== m.key) };
        s = { ...s, local: m.type === 'create' ? s.local.filter((t) => t.id !== m.taskId) : s.local };
        return refreshBadges(ev(s, a.now, 'err', '503 Service Unavailable: change NOT saved. Wait-for-server UIs must show an error and let the user retry.'));
      }
      const wait = backoffMs(m.attempts);
      s = { ...s, outbox: s.outbox.map((x) => (x.key === m.key ? { ...x, state: 'backoff', nextAttemptAt: a.now + wait } : x)) };
      return refreshBadges(ev(s, a.now, 'warn', `503 Retry: backing off ${wait / 1000}s (attempt ${m.attempts}) before retrying ${describe(m)}`));
    }

    case 'resolve': {
      const c = s.conflict;
      if (!c) return s;
      const m = s.outbox.find((x) => x.key === c.key);
      if (!m) return { ...s, conflict: null };
      if (a.choice === 'local') {
        let fixed: Mutation;
        if (!c.server) {
          // deleted on the server → re-create our local copy
          fixed = { ...m, type: 'create', snapshot: c.local ? { id: c.local.id, title: c.local.title, done: c.local.done, version: 0 } : m.snapshot, patch: {}, baseVersion: 0, state: 'queued', nextAttemptAt: 0, key: `${m.key}-r` };
        } else if (m.type === 'update' && c.local) {
          // re-send our FULL local state on top of the server version
          fixed = { ...m, patch: { title: c.local.title, done: c.local.done }, baseVersion: c.server.version, state: 'queued', nextAttemptAt: 0, key: `${m.key}-r` };
        } else {
          fixed = { ...m, baseVersion: c.server.version, state: 'queued', nextAttemptAt: 0, key: `${m.key}-r` };
        }
        s = { ...s, conflict: null, outbox: s.outbox.map((x) => (x.key === m.key ? fixed : x)) };
        return refreshBadges(ev(s, a.now, 'info', 'Conflict resolved: KEEP LOCAL. Re-sending our version on top of the server version (new idempotency key).'));
      }
      s = { ...s, conflict: null, outbox: s.outbox.filter((x) => x.taskId !== c.taskId || x.state === 'inflight') };
      s = {
        ...s,
        local: c.server
          ? s.local.some((t) => t.id === c.taskId)
            ? s.local.map((t) => (t.id === c.taskId ? { ...c.server!, sync: 'synced' } : t))
            : [{ ...c.server, sync: 'synced' }, ...s.local]
          : s.local.filter((t) => t.id !== c.taskId),
      };
      return refreshBadges(ev(s, a.now, 'info', 'Conflict resolved: KEEP SERVER. Local change discarded, device updated to the server version.'));
    }

    case 'remoteEdit': {
      const cur = s.server.find((t) => t.id === a.id);
      if (!cur) return s;
      const title = cur.title.endsWith('(tablet edit)') ? cur.title : `${cur.title} (tablet edit)`;
      const next = { ...cur, title, version: cur.version + 1 };
      s = { ...s, server: s.server.map((t) => (t.id === a.id ? next : t)) };
      return ev(s, a.now, 'warn', `Another device changed "${cur.title}" on the server (v${cur.version} → v${next.version}). This phone doesn't know yet.`);
    }

    case 'pull': {
      const pendingIds = new Set(s.outbox.map((m) => m.taskId));
      const keep = s.local.filter((t) => pendingIds.has(t.id));
      const fromServer = s.server.filter((t) => !pendingIds.has(t.id)).map((t) => ({ ...t, sync: 'synced' as const }));
      // preserve local ordering where possible
      const order = s.local.map((t) => t.id);
      const merged = [...keep, ...fromServer].sort((x, y) => {
        const ix = order.indexOf(x.id), iy = order.indexOf(y.id);
        return (ix < 0 ? -1 : ix) - (iy < 0 ? -1 : iy);
      });
      s = { ...s, local: merged };
      s = http(s, { at: a.now, method: 'GET', path: '/api/tasks', status: 200, statusText: 'OK', ms: a.ms, res: s.server });
      return refreshBadges(ev(s, a.now, 'ok', `Pulled ${s.server.length} tasks from the server (local pending changes kept on top).`));
    }
  }
}
