import type { Module } from '../../types';

const raw = String.raw;

export const offlineSyncModule: Module = {
  id: 'app-offline',
  title: 'Offline-First Sync Engines & Conflict Resolution',
  level: 'Advanced',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'app-offline-outbox',
      title: 'Offline-First Sync with a Persistent Outbox Queue (and Coalescing)',
      summary: 'Make the local database the source of truth for the UI, record every change in a durable outbox in the same transaction, compact redundant offline edits, and drain the queue in order when the network returns.',
      difficulty: 'Intermediate',
      minutes: 25,
      xp: 140,
      analogy:
        "An outbox is the tray on a busy office desk labelled \"to post\". You write the letter, file a copy in your own cabinet (local database) and drop the envelope in the tray in one motion. When the courier arrives (connectivity), envelopes leave in the order they were written and are only thrown away once the recipient signs for them. If you write three corrections to the same letter before the courier comes, you staple them into one envelope (coalescing).",
      intuition: [
        { title: 'Local first', body: "The UI reads and writes the local database (SQLite) immediately; the network is never on the critical path of a tap. Screens subscribe to local queries, so a write shows up everywhere instantly, online or offline." },
        { title: 'Write + enqueue atomically', body: "Each user change does two things in one SQLite transaction: update the local rows and insert a mutation `{ id, entity, op, payload, created_at }` into the outbox table. If the app is killed between them, both or neither happened." },
        { title: 'Coalesce while offline', body: "Before enqueuing, merge with pending mutations for the same entity: create + update → one create with merged fields; update + update → one merged update; create + delete → nothing at all (the server never needs to know); update + delete → just the delete. Fewer requests, fewer conflicts." },
        { title: 'Drain in order, one at a time', body: "A single sync worker (never two at once) sends mutations FIFO, and deletes each outbox row only after the server confirms it. Ordering matters: an update must not reach the server before the create it depends on." },
        { title: 'Classify failures', body: "Network errors and 5xx: keep the mutation and retry later with backoff. 4xx validation errors: the mutation will never succeed, so move it to a dead-letter table, roll back the local change and tell the user. 409: resolve the conflict (later in this module)." },
        { title: 'Pull after push', body: "After the outbox is empty, pull server changes since the last sync cursor and apply them locally (skipping entities that have pending local mutations). This keeps the device converging with other devices." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Sync engine', body: 'The outbox lives in SQLite, so it survives process death.', flow: ['tap → BEGIN: update local row + coalesce/enqueue mutation → COMMIT', 'UI re-renders from local DB', 'online? sync worker (single flight)', 'send oldest mutation (Idempotency-Key = mutation id)', '2xx → delete row; 5xx/offline → backoff; 4xx → dead-letter + rollback', 'outbox empty → pull changes since cursor'] },
        { kind: 'tip', title: 'Use the lab', body: 'The Offline Sync lab below: go Offline, then add, edit, tick and delete tasks and watch the outbox stack up and compact (create + delete cancels out). Switch back Online and watch it flush in order in the HTTP log.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'outbox_sqlite_from_scratch.ts',
          explanation: 'Runnable TypeScript on Node\'s built-in SQLite: local writes and outbox inserts in one transaction, coalescing of create/update/delete for the same entity, FIFO flushing that deletes rows only after a 2xx, a 503 that leaves the queue untouched, and a crash simulated by reopening the database file (the outbox survives). All asserted.',
          code: raw`//  OFFLINE EDITS ON TASK t1, t2, t3 (outbox after coalescing)
//
//   create t1 {title:'Buy milk'} + update t1 {done:true}   -> [create t1 {title:'Buy milk', done:true}]
//   create t2 + delete t2                                   -> []   (server never hears about t2)
//   update t3 {title:'x'} + update t3 {title:'y'}           -> [update t3 {title:'y'}]
//   flush FIFO:  POST t1 -> 201 -> delete row   PATCH t3 -> 503 -> keep row, retry later
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const file = join(mkdtempSync(join(tmpdir(), 'outbox-')), 'app.db');
let db = new DatabaseSync(file);
db.exec([
  'PRAGMA journal_mode = WAL;',
  'CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0);',
  'CREATE TABLE outbox (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, entity_id TEXT NOT NULL,',
  "  op TEXT NOT NULL CHECK (op IN ('create', 'update', 'delete')), payload TEXT NOT NULL);",
].join('\n'));

type Op = 'create' | 'update' | 'delete';
type Row = { seq: number; id: string; entity_id: string; op: Op; payload: string };
let mutationCounter = 0;

function change(entityId: string, op: Op, fields: Record<string, unknown> = {}) {
  db.exec('BEGIN');
  try {
    // 1) local write: the UI reads this immediately
    if (op === 'create') db.prepare('INSERT INTO tasks (id, title, done) VALUES (?, ?, ?)').run(entityId, String(fields.title), fields.done ? 1 : 0);
    if (op === 'update') for (const [k, v] of Object.entries(fields)) db.prepare('UPDATE tasks SET ' + (k === 'done' ? 'done' : 'title') + ' = ? WHERE id = ?').run(k === 'done' ? (v ? 1 : 0) : String(v), entityId);
    if (op === 'delete') db.prepare('DELETE FROM tasks WHERE id = ?').run(entityId);
    // 2) coalesce with a pending mutation for the same entity, or enqueue a new one
    const pending = db.prepare('SELECT * FROM outbox WHERE entity_id = ?').get(entityId) as Row | undefined;
    if (!pending) {
      db.prepare('INSERT INTO outbox (id, entity_id, op, payload) VALUES (?, ?, ?, ?)').run('m' + ++mutationCounter, entityId, op, JSON.stringify(fields));
    } else if (op === 'delete') {
      if (pending.op === 'create') db.prepare('DELETE FROM outbox WHERE seq = ?').run(pending.seq);      // never reached the server
      else db.prepare("UPDATE outbox SET op = 'delete', payload = '{}' WHERE seq = ?").run(pending.seq);
    } else {
      const merged = { ...JSON.parse(pending.payload), ...fields };                                        // create+update stays a create
      db.prepare('UPDATE outbox SET payload = ? WHERE seq = ?').run(JSON.stringify(merged), pending.seq);
    }
    db.exec('COMMIT');                                         // local write and queue entry are atomic
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

change('t1', 'create', { title: 'Buy milk' });
change('t1', 'update', { done: true });
change('t2', 'create', { title: 'Temp' });
change('t2', 'delete');
db.prepare("INSERT INTO tasks (id, title) VALUES ('t3', 'old')").run();      // t3 already exists on the server
change('t3', 'update', { title: 'x' });
change('t3', 'update', { title: 'y' });

const outbox = () => (db.prepare('SELECT entity_id, op, payload FROM outbox ORDER BY seq').all() as Array<Omit<Row, 'seq' | 'id'>>)
  .map((r) => r.op + ' ' + r.entity_id + ' ' + r.payload);
assert.deepEqual(outbox(), ['create t1 {"title":"Buy milk","done":true}', 'update t3 {"title":"y"}']);

// the app is killed before syncing: reopen the file, the queue is still there
db.close();
db = new DatabaseSync(file);
assert.equal(outbox().length, 2);

// FIFO flush: delete a row only after the server confirms it
const sent: string[] = [];
function flush(server: (m: Row) => number) {
  for (;;) {
    const m = db.prepare('SELECT * FROM outbox ORDER BY seq LIMIT 1').get() as Row | undefined;
    if (!m) return 'empty';
    const status = server(m);
    sent.push(m.op + ' ' + m.entity_id + ' -> ' + status);
    if (status >= 200 && status < 300) db.prepare('DELETE FROM outbox WHERE seq = ?').run(m.seq);
    else return 'paused at ' + m.entity_id;                    // keep order: don't skip ahead
  }
}
assert.equal(flush((m) => (m.entity_id === 't3' ? 503 : 201)), 'paused at t3');
assert.deepEqual(outbox(), ['update t3 {"title":"y"}']);
assert.equal(flush(() => 200), 'empty');
assert.deepEqual(sent, ['create t1 -> 201', 'update t3 -> 503', 'update t3 -> 200']);
assert.deepEqual(db.prepare('SELECT id, title, done FROM tasks ORDER BY id').all().map((r) => ({ ...r })),
  [{ id: 't1', title: 'Buy milk', done: 1 }, { id: 't3', title: 'y', done: 0 }]);
console.log('requests sent:', sent.join(' | '));`,
        },
        production: {
          language: 'ts',
          filename: 'syncEngine.ts',
          explanation: 'Production sync engine on expo-sqlite: a single-flight flush loop triggered by connectivity, app focus and new mutations; mutations sent FIFO with their id as the Idempotency-Key; rows deleted only after success; 4xx moved to a dead-letter table with a local rollback hook; backoff with jitter on retryable failures; and a pull of remote changes once the outbox is empty.',
          code: raw`import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';

type Mutation = { seq: number; id: string; entity: string; entity_id: string; op: 'create' | 'update' | 'delete'; payload: string; attempts: number };

// portable timeout (AbortSignal.timeout is not available on every React Native/Hermes version)
function timeoutSignal(ms: number) {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

export function createSyncEngine(db: SQLiteDatabase, api: { base: string; token: () => Promise<string> }, onRejected: (m: Mutation, body: unknown) => Promise<void>) {
  let running: Promise<void> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  async function send(m: Mutation): Promise<number> {
    const method = m.op === 'create' ? 'POST' : m.op === 'update' ? 'PATCH' : 'DELETE';
    const url = api.base + '/' + m.entity + (m.op === 'create' ? '' : '/' + m.entity_id);
    const res = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (await api.token()),
                 'idempotency-key': m.id },                       // same key on every retry of this mutation
      body: m.op === 'delete' ? undefined : m.payload,
      signal: timeoutSignal(15_000),
    });
    if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
      await onRejected(m, await res.json().catch(() => null));      // permanent: roll back locally + notify
      await db.withTransactionAsync(async () => {
        await db.runAsync('INSERT INTO dead_letter (id, entity, entity_id, op, payload, status) VALUES (?, ?, ?, ?, ?, ?)',
          [m.id, m.entity, m.entity_id, m.op, m.payload, res.status]);
        await db.runAsync('DELETE FROM outbox WHERE seq = ?', [m.seq]);
      });
      return 0;
    }
    return res.status;
  }

  async function flushOnce() {
    for (;;) {
      const m = await db.getFirstAsync<Mutation>('SELECT * FROM outbox ORDER BY seq LIMIT 1');
      if (!m) break;
      let status: number;
      try { status = await send(m); } catch { status = -1; }        // offline / timeout
      if (status === 0) continue;                                   // dead-lettered, move on
      if (status >= 200 && status < 300) { await db.runAsync('DELETE FROM outbox WHERE seq = ?', [m.seq]); continue; }
      await db.runAsync('UPDATE outbox SET attempts = attempts + 1 WHERE seq = ?', [m.seq]);
      const delay = Math.random() * Math.min(60_000, 1000 * 2 ** m.attempts);   // full jitter
      retryTimer = setTimeout(() => void flush(), delay);
      return;                                                       // keep FIFO order: stop here
    }
    await pullChanges(db, api);                                     // converge with other devices
  }

  function flush() {                                                // single flight: never two workers
    running ??= flushOnce().finally(() => { running = null; });
    return running;
  }

  const unsubNet = NetInfo.addEventListener((s) => { if (s.isConnected) { clearTimeout(retryTimer); void flush(); } });
  const appSub = AppState.addEventListener('change', (s) => { if (s === 'active') void flush(); });
  return { flush, stop: () => { unsubNet(); appSub.remove(); clearTimeout(retryTimer); } };
}

declare function pullChanges(db: SQLiteDatabase, api: { base: string }): Promise<void>;`,
        },
        bug: {
          explanation:
            'The queue lives in a JavaScript array, so every pending change disappears when the OS kills the app in the background (or the app crashes) before it reconnects; the local database says the change happened, the server never hears about it. Persist the outbox in SQLite in the same transaction as the local write.',
          buggy: {
            language: 'ts',
            filename: 'outbox.ts',
            code: raw`// ❌ In-memory queue: lost on process death, and not atomic with the local write
const queue: Mutation[] = [];

export async function completeTask(id: string) {
  await db.runAsync('UPDATE tasks SET done = 1 WHERE id = ?', [id]);   // persisted...
  queue.push({ id: uuid(), entity_id: id, op: 'update', payload: '{"done":true}' });   // ...but this is not
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'outbox.ts',
            code: raw`// ✅ Durable outbox row written in the same SQLite transaction
export async function completeTask(id: string) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE tasks SET done = 1 WHERE id = ?', [id]);
    await enqueueCoalesced(db, { entity: 'tasks', entity_id: id, op: 'update', fields: { done: true } });
  });
  void sync.flush();                                                   // try now; retried later if offline
}`,
          },
        },
      },
      takeaways: [
        'The UI reads and writes the local database; the network is never on the tap path.',
        'Write the local change and the outbox entry in one transaction; the outbox lives on disk.',
        'Coalesce per entity: create+update → create, update+update → update, create+delete → nothing.',
        'Drain FIFO with a single worker; delete only after 2xx; back off on 5xx; dead-letter 4xx; pull after push.',
        'Practice drill: in Tab 1, add an update after a delete for the same task (it should be rejected or ignored) and decide which behaviour your app needs.',
      ],
      labId: 'app-architecture',
      labMode: 'outbox',
    },

    // ------------------------------------------------------------------------
    {
      id: 'app-optimistic-ui',
      title: 'Optimistic UI with Pending State & Rollback',
      summary: 'Show the result of a tap instantly, mark it as pending, reconcile temporary ids with server ids, and roll back precisely (without undoing later edits) when the server rejects a change.',
      difficulty: 'Intermediate',
      minutes: 20,
      xp: 120,
      analogy:
        "Optimistic UI is a restaurant that brings your drink before the kitchen confirms the order, because it is almost always available. If the bar is out of lemonade, the waiter comes back, takes that one glass away and apologises, without also taking the bread you ordered afterwards.",
      intuition: [
        { title: 'Why optimistic', body: "On mobile networks, a round trip is 100–1000 ms. Waiting for the server makes every tap feel sluggish. Most writes succeed, so apply them immediately and confirm in the background." },
        { title: 'Confirmed state + pending operations', body: "Keep the last server-confirmed state and a list of pending operations. What the user sees is `pending.reduce(apply, confirmed)`. When an operation is confirmed it moves into the confirmed state; when it fails it is simply removed and the view is recomputed." },
        { title: 'Rollback precisely', body: "Restoring a whole snapshot taken before a failed operation would also erase later successful edits. Rebasing (recomputing from confirmed state + the remaining pending ops) undoes only the failed change." },
        { title: 'Temporary ids', body: "Items created offline get client-generated ids (UUIDs are best: then the server can accept them as the real id). If the server assigns ids, map temp → server id when the create is confirmed and rewrite pending ops that reference it." },
        { title: 'Show honest status', body: "Mark pending items subtly (a clock icon, reduced opacity) and failed ones clearly with a retry action. Never pretend a payment, booking or message was delivered when it wasn't." },
        { title: 'Know when not to be optimistic', body: "Irreversible or high-stakes actions (payments, account deletion, placing a trade) should wait for the server and show progress; optimistic UI is for likely-to-succeed, reversible actions." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Rebase model', body: 'The view is always derived; nothing is patched in place.', flow: ['tap → append pending op', 'view = pending.reduce(apply, confirmed)', 'server 2xx → move op into confirmed', 'server 4xx → drop op, recompute view, show error', 'later ops survive the rollback'] },
        { kind: 'tip', title: 'Use the lab', body: 'In the Offline Sync lab below, compare the Optimistic UI and Wait-for-server modes: with optimistic UI every action applies instantly and syncs in the background; with wait-for-server every tap blocks on the network and offline writes are refused.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'optimistic_rebase.ts',
          explanation: 'Runnable TypeScript: a confirmed-state + pending-ops model where the visible list is always derived; a failed op in the middle is rolled back without losing later edits (compared with naive snapshot restore), and a temporary id is mapped to the server id with pending ops rewritten. All asserted.',
          code: raw`//  CONFIRMED + PENDING = VISIBLE
//
//   confirmed: [a:"Milk"]
//   pending:   op1 add b:"Eggs"   op2 rename a->"Oat milk"   op3 add c:"Bread"
//   op2 rejected (409/422)  -> drop op2 only -> visible [a:"Milk", b:"Eggs", c:"Bread"]
//   naive snapshot-restore taken before op2 -> [a:"Milk", b:"Eggs"]   (Bread lost!)
import assert from 'node:assert/strict';

type Item = { id: string; title: string };
type PendingOp = { opId: string } & ({ kind: 'add'; item: Item } | { kind: 'rename'; id: string; title: string });
const apply = (items: Item[], op: PendingOp): Item[] =>
  op.kind === 'add' ? [...items, op.item] : items.map((i) => (i.id === op.id ? { ...i, title: op.title } : i));

class OptimisticList {
  confirmed: Item[] = [{ id: 'a', title: 'Milk' }];
  pending: PendingOp[] = [];
  get visible() { return this.pending.reduce(apply, this.confirmed); }
  run(op: PendingOp) { this.pending.push(op); }
  confirm(opId: string, idMap?: Record<string, string>) {
    const op = this.pending.find((p) => p.opId === opId)!;
    this.pending = this.pending.filter((p) => p.opId !== opId);
    let applied = apply(this.confirmed, op);
    if (idMap) {                                          // server assigned real ids: rewrite everything
      const fix = (id: string) => idMap[id] ?? id;
      applied = applied.map((i) => ({ ...i, id: fix(i.id) }));
      this.pending = this.pending.map((p) => (p.kind === 'rename' ? { ...p, id: fix(p.id) } : p));
    }
    this.confirmed = applied;
  }
  reject(opId: string) { this.pending = this.pending.filter((p) => p.opId !== opId); }   // rebase = recompute
}

const list = new OptimisticList();
list.run({ opId: 'op1', kind: 'add', item: { id: 'tmp-b', title: 'Eggs' } });
const snapshotBeforeOp2 = list.visible;                    // what a naive implementation would restore
list.run({ opId: 'op2', kind: 'rename', id: 'a', title: 'Oat milk' });
list.run({ opId: 'op3', kind: 'add', item: { id: 'tmp-c', title: 'Bread' } });
assert.deepEqual(list.visible.map((i) => i.title), ['Oat milk', 'Eggs', 'Bread']);   // instant feedback

list.reject('op2');                                         // server refused the rename
assert.deepEqual(list.visible.map((i) => i.title), ['Milk', 'Eggs', 'Bread']);       // only op2 undone
assert.deepEqual(snapshotBeforeOp2.map((i) => i.title), ['Milk', 'Eggs']);           // naive restore loses Bread

list.run({ opId: 'op4', kind: 'rename', id: 'tmp-b', title: 'Free-range eggs' });   // edit of an unconfirmed item
list.confirm('op1', { 'tmp-b': 'srv-17' });                 // create confirmed with a server id
assert.deepEqual(list.pending.find((p) => p.opId === 'op4'), { opId: 'op4', kind: 'rename', id: 'srv-17', title: 'Free-range eggs' });
list.confirm('op4'); list.confirm('op3');
assert.deepEqual(list.confirmed, [{ id: 'a', title: 'Milk' }, { id: 'srv-17', title: 'Free-range eggs' }, { id: 'tmp-c', title: 'Bread' }]);
assert.equal(list.pending.length, 0);
console.log('final:', list.visible.map((i) => i.id + ':' + i.title).join(', '));`,
        },
        production: {
          language: 'tsx',
          filename: 'useToggleTask.tsx',
          explanation: 'Production TanStack Query optimistic mutation in React Native: cancel in-flight fetches, update the cached list immediately with a pending flag, roll back that single item on error (not the whole list), show a retryable error, and refetch on settle to converge with the server.',
          code: raw`import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';

type Task = { id: string; title: string; done: boolean; pending?: boolean };
const key = ['tasks'] as const;

async function patchTask(id: string, done: boolean, idempotencyKey: string) {
  const res = await fetch('https://api.example.com/tasks/' + id, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
    body: JSON.stringify({ done }),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return (await res.json()) as Task;
}

export function useToggleTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; done: boolean; key: string }) => patchTask(v.id, v.done, v.key),
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey: key });                         // don't let a stale refetch overwrite us
      const previous = qc.getQueryData<Task[]>(key)?.find((t) => t.id === id);
      qc.setQueryData<Task[]>(key, (old = []) => old.map((t) => (t.id === id ? { ...t, done, pending: true } : t)));
      return { previous };                                               // context for rollback
    },
    onError: (_err, { id }, ctx) => {
      // roll back only this task, so other optimistic edits made meanwhile survive
      qc.setQueryData<Task[]>(key, (old = []) => old.map((t) => (t.id === id && ctx?.previous ? ctx.previous : t)));
      Alert.alert('Could not update the task', 'Check your connection and try again.');
    },
    onSuccess: (server) => {
      qc.setQueryData<Task[]>(key, (old = []) => old.map((t) => (t.id === server.id ? server : t)));   // pending cleared
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),            // converge with the server
  });
}

// usage: toggle.mutate({ id: task.id, done: !task.done, key: task.id + ':' + Date.now() })`,
        },
        bug: {
          explanation:
            'The UI is updated optimistically, but nothing happens when the request fails: the checkbox stays ticked although the server never saved it, and the next refetch flips it back unexpectedly (or never, if the screen is not refetched). Keep the previous value, roll it back on error, tell the user, and reconcile on settle.',
          buggy: {
            language: 'ts',
            filename: 'toggle.ts',
            code: raw`// ❌ Optimistic without rollback: the UI lies after a failure
export async function toggle(task: Task) {
  setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)));
  await fetch('/tasks/' + task.id, { method: 'PATCH', body: JSON.stringify({ done: !task.done }) });
  // a network error or 422 is silently ignored
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'toggle.ts',
            code: raw`// ✅ Apply, mark pending, roll back this item on failure, surface the error
export async function toggle(task: Task) {
  setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, done: !task.done, pending: true } : t)));
  try {
    const res = await fetch('/tasks/' + task.id, { method: 'PATCH', body: JSON.stringify({ done: !task.done }) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const saved = (await res.json()) as Task;
    setTasks((ts) => ts.map((t) => (t.id === task.id ? saved : t)));
  } catch {
    setTasks((ts) => ts.map((t) => (t.id === task.id ? task : t)));      // only this item
    showToast('Could not save. Tap to retry.');
  }
}`,
          },
        },
      },
      takeaways: [
        'Apply likely-to-succeed, reversible actions instantly; keep high-stakes actions pessimistic.',
        'Derive the view from confirmed state + pending ops; rollback = drop the failed op and recompute.',
        'Map temporary ids to server ids (or use client UUIDs) and rewrite pending ops.',
        'Show pending and failed states honestly, with retry.',
        'Practice drill: in Tab 1, reject op1 (the add of tmp-b) after op4 renamed it, and decide what the user should see (both disappear: op4 targets an item that no longer exists, so drop it too).',
      ],
      labId: 'app-architecture',
      labMode: 'optimistic',
    },

    // ------------------------------------------------------------------------
    {
      id: 'app-idempotent-sync',
      title: 'Idempotency Keys for Mid-Flight Disconnects',
      summary: 'Handle the hardest offline case: the server saved your change but the response never arrived. Persist one idempotency key per mutation so retries are replayed, never duplicated.',
      difficulty: 'Advanced',
      minutes: 20,
      xp: 130,
      analogy:
        "You send a parcel and the tracking page crashes before showing the receipt. Did it go? If you send it again without a reference number, the recipient may get two parcels. With an order number written on the box, the depot says \"we already have number 4471, here is your original receipt\" and nothing is shipped twice.",
      intuition: [
        { title: 'The ambiguous failure', body: "Request sent → server commits → connection drops (tunnel, elevator, app backgrounded) → client sees a timeout. The client cannot tell \"never arrived\" from \"done but unacknowledged\", so it must retry, and the retry must be harmless." },
        { title: 'One key per mutation, not per attempt', body: "Generate the key when the mutation is created and store it in the outbox row (the mutation id works). Every retry, even after an app restart, sends the same `Idempotency-Key` header." },
        { title: 'Server-side contract', body: "Store (client/user, key) → request fingerprint + response. A repeat with the same key replays the stored response (often marked `Idempotent-Replayed: true`); the same key with a different body is a client bug (422); a repeat while the first is still processing gets 409 and is retried later." },
        { title: 'Atomic with the write', body: "The server should record the key in the same database transaction as the change (a unique constraint on the key), so a crash cannot leave the change applied without its key or the key without the change." },
        { title: 'Natural idempotency helps', body: "Creates with client-generated UUIDs (`PUT /tasks/{uuid}` or insert ... on conflict do nothing) and absolute updates (`done = true`, not `toggle`) are idempotent by design. Relative operations (`balance += 10`, `toggle`) always need keys." },
        { title: 'Expiry', body: "Keys are kept for a bounded time (for example 24 h–7 days), longer than any realistic offline period plus retries, then cleaned up." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Lost response, safe retry', body: 'The key is created once and travels with every attempt.', flow: ['create mutation m42 (key = m42) in outbox', 'POST … Idempotency-Key: m42', 'server: INSERT change + key (one transaction) → 201', 'response lost → client timeout', 'retry with key m42 → server replays 201', 'client deletes outbox row'] },
        { kind: 'tip', title: 'Use the lab', body: 'In the Offline Sync lab below, go Offline while a request is in flight: if the server already committed, the retry shows up in the HTTP log as an idempotent replay with the same key.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'idempotency_replay.ts',
          explanation: 'Runnable TypeScript client/server simulation of a lost response: retries with a fresh key per attempt create duplicate charges, while a key stored with the mutation is replayed exactly once; a reused key with a different body is rejected, and a concurrent duplicate gets 409. Server records are written atomically with the side effect. All asserted.',
          code: raw`//  RESPONSE LOST AFTER THE SERVER COMMITTED
//
//   client --POST key=K1--> server: charge #1 committed --201--X (connection dropped)
//   retry, NEW key K2   --> server: charge #2 committed          => customer charged twice
//   retry, SAME key K1  --> server: "seen K1" -> replay 201 #1   => exactly one charge
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

class Server {
  charges: Array<{ id: number; amount: number }> = [];
  keys = new Map<string, { fp: string; state: 'processing' | 'done'; response?: { status: number; chargeId: number } }>();
  handle(key: string, body: { amount: number }, opts: { finish?: boolean } = {}) {
    const fp = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const rec = this.keys.get(key);
    if (rec) {
      if (rec.fp !== fp) return { status: 422 };                   // same key, different request
      if (rec.state === 'processing') return { status: 409 };      // first attempt still running
      return { ...rec.response!, replayed: true };
    }
    this.keys.set(key, { fp, state: 'processing' });
    if (opts.finish === false) return { status: 202 };
    // the change and the key record commit together (one DB transaction in real life)
    const charge = { id: this.charges.length + 1, amount: body.amount };
    this.charges.push(charge);
    const response = { status: 201, chargeId: charge.id };
    this.keys.set(key, { fp, state: 'done', response });
    return response;
  }
}

function clientWithLostResponse(server: Server, keyStrategy: 'per-attempt' | 'per-mutation') {
  const mutation = { id: 'mut-7f3a', body: { amount: 1200 } };      // persisted in the outbox
  let attempt = 0;
  const send = () => server.handle(keyStrategy === 'per-mutation' ? mutation.id : 'attempt-' + ++attempt, mutation.body);
  send();                                                            // committed, but the client never sees it
  return send();                                                     // retry after the timeout
}

const s1 = new Server();
clientWithLostResponse(s1, 'per-attempt');
assert.equal(s1.charges.length, 2);                                 // duplicate charge

const s2 = new Server();
const retry = clientWithLostResponse(s2, 'per-mutation');
assert.equal(s2.charges.length, 1);
assert.deepEqual(retry, { status: 201, chargeId: 1, replayed: true });

assert.equal(s2.handle('mut-7f3a', { amount: 9999 }).status, 422);   // key reused for a different body
const s3 = new Server();
s3.handle('k-slow', { amount: 50 }, { finish: false });
assert.equal(s3.handle('k-slow', { amount: 50 }).status, 409);       // concurrent duplicate: retry later

// natural idempotency: absolute updates converge, relative ones do not
let doneFlag = false; doneFlag = true; doneFlag = true;             // "set done = true" twice
let toggled = false; toggled = !toggled; toggled = !toggled;         // "toggle" twice
assert.deepEqual([doneFlag, toggled], [true, false]);
console.log('per-attempt keys ->', s1.charges.length, 'charges | per-mutation key ->', s2.charges.length, 'charge (replayed)');`,
        },
        production: {
          language: 'ts',
          filename: 'idempotency.server.ts',
          explanation: 'Production server side (Express + node-postgres): the idempotency record and the business write share one transaction, a unique constraint on (user_id, key) makes concurrent duplicates safe, replays return the stored response, mismatched bodies get 422 and in-progress duplicates get 409. The mobile client sends its outbox mutation id as the key.',
          code: raw`import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
// CREATE TABLE idempotency_keys (
//   user_id uuid NOT NULL, key text NOT NULL, fingerprint text NOT NULL,
//   status int, response jsonb, created_at timestamptz NOT NULL DEFAULT now(),
//   PRIMARY KEY (user_id, key));

export async function createTask(req: Request, res: Response) {
  const key = req.get('idempotency-key');
  if (!key || key.length > 100) return res.status(400).json({ title: 'Idempotency-Key required', status: 400 });
  const userId = req.user.id;
  const fingerprint = createHash('sha256').update(JSON.stringify(req.body)).digest('hex');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // claim the key; a concurrent duplicate blocks on the unique index, then sees the row
    const claim = await client.query(
      'INSERT INTO idempotency_keys (user_id, key, fingerprint) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING key',
      [userId, key, fingerprint]);
    if (claim.rowCount === 0) {
      const { rows: [prev] } = await client.query(
        'SELECT fingerprint, status, response FROM idempotency_keys WHERE user_id = $1 AND key = $2', [userId, key]);
      await client.query('ROLLBACK');
      if (prev.fingerprint !== fingerprint) return res.status(422).json({ title: 'Key reused with a different request', status: 422 });
      if (prev.status === null) return res.status(409).json({ title: 'Request still processing', status: 409 });
      return res.status(prev.status).set('idempotent-replayed', 'true').json(prev.response);
    }

    const { rows: [task] } = await client.query(
      'INSERT INTO tasks (id, user_id, title, done) VALUES ($1, $2, $3, $4) RETURNING *',   // client UUID as id
      [req.body.id, userId, req.body.title, req.body.done ?? false]);
    await client.query('UPDATE idempotency_keys SET status = 201, response = $3 WHERE user_id = $1 AND key = $2',
      [userId, key, task]);
    await client.query('COMMIT');                                  // change + stored response are atomic
    res.status(201).json(task);
  } catch (e) {
    await client.query('ROLLBACK');                                // key released: the retry can run again
    throw e;
  } finally {
    client.release();
  }
}
// cleanup job: DELETE FROM idempotency_keys WHERE created_at < now() - interval '7 days';`,
        },
        bug: {
          explanation:
            'A new UUID is generated inside the request function, so each retry of the same mutation carries a different key. When a response is lost after the server committed, the retry looks like a brand-new request and the action (a payment, a message, an order) is performed twice. Create the key once with the mutation, persist it in the outbox, and reuse it on every attempt.',
          buggy: {
            language: 'ts',
            filename: 'send.ts',
            code: raw`// ❌ Fresh key per attempt: retries after a lost response are duplicates
async function sendMutation(m: Mutation) {
  return fetch(API + '/payments', {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID(), 'content-type': 'application/json' },
    body: m.payload,
  });
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'send.ts',
            code: raw`// ✅ The key was generated when the mutation was enqueued and is stored in the outbox row
async function sendMutation(m: Mutation) {
  return fetch(API + '/payments', {
    method: 'POST',
    headers: { 'idempotency-key': m.id, 'content-type': 'application/json' },   // same on every retry
    body: m.payload,
    signal: timeoutSignal(15_000),                 // AbortController + setTimeout helper
  });
}`,
          },
        },
      },
      takeaways: [
        'A timeout does not mean failure: the server may have committed. Retries must be safe.',
        'Generate one idempotency key per mutation, persist it in the outbox, and reuse it across retries and restarts.',
        'Servers store key → fingerprint + response atomically with the change: replay, 409 while processing, 422 on mismatch.',
        'Prefer naturally idempotent designs: client UUIDs for creates, absolute updates instead of toggles.',
        'Practice drill: in Tab 1, change the second send in per-mutation mode to happen while the first is still processing (finish: false) and assert the client gets 409 and must retry later.',
      ],
      labId: 'app-architecture',
      labMode: 'idempotency',
    },

    // ------------------------------------------------------------------------
    {
      id: 'app-conflict-resolution',
      title: 'Conflict Resolution: Last-Write-Wins vs Version Vectors vs CRDTs',
      summary: 'When two devices edit the same data offline, decide deliberately who wins: understand how last-write-wins silently loses data, detect true concurrency with versions and version vectors, merge field by field, and use CRDTs where automatic merging is required.',
      difficulty: 'Advanced',
      minutes: 25,
      xp: 150,
      analogy:
        "Two people edit the same shared shopping list on a train with no signal. Last-write-wins is \"whoever's phone clock says later wins\", even if that phone's clock is ten minutes fast. Version vectors are each person keeping a tally of whose edits they have seen, so you can tell \"I already saw yours\" from \"we both changed it independently\". A CRDT is a list designed so that combining both copies in any order always gives the same, sensible result.",
      intuition: [
        { title: 'Conflicts are a product decision', body: "For each entity and field decide: can the server just take the latest value, should fields merge independently, should the user choose, or must the data type merge automatically (counters, sets, collaborative text)?" },
        { title: 'Last-write-wins (LWW)', body: "Keep the value with the largest timestamp. Simple, but device clocks drift and can be set manually: a phone 10 minutes fast wins every conflict. Even with good clocks, one person's edit is silently discarded. Use server-assigned versions or hybrid logical clocks, never raw device time." },
        { title: 'Optimistic concurrency with versions', body: "Each record has a server version. The client sends `baseVersion` with its update; if the server's version differs, it returns 409 with the current record. The client then merges (field-level three-way merge with the common base) or asks the user." },
        { title: 'Version vectors', body: "Each replica keeps a counter per device. Comparing vectors tells you whether one update happened after another (all counters ≥) or concurrently (each has a counter the other lacks). Only concurrent updates are real conflicts." },
        { title: 'CRDTs', body: "Conflict-free replicated data types merge automatically and deterministically: merge is commutative, associative and idempotent, so replicas converge regardless of order or duplicates. Examples: G-Counter/PN-Counter (likes, inventory adjustments), LWW-Register, OR-Set (tags, collaborators), and sequence CRDTs for text (Yjs, Automerge)." },
        { title: 'Tell the user when you must', body: "Some conflicts have no safe automatic answer (two different shipping addresses). Show both versions with clear choices (Keep mine / Keep theirs / Edit) rather than silently picking one." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Update with conflict detection', body: 'The server never blindly overwrites a newer version.', flow: ['client PATCH {fields, baseVersion: 4}', 'server version == 4 → apply, version 5 → 200', 'server version 5 ≠ 4 → 409 + current record', 'client three-way merge (base, mine, theirs)', 'auto-merged → retry with baseVersion 5 / true conflict → ask user'] },
        { kind: 'tip', title: 'Use the lab', body: 'In the Offline Sync lab below, click ✎ on a server row to simulate another device editing it, then edit the same task on the phone: the sync gets a 409, and the conflict sheet asks you to Keep Local or Keep Server.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'conflicts_from_scratch.ts',
          explanation: 'Runnable TypeScript: LWW with a skewed device clock discarding the genuinely newer edit, version-vector comparison (before / after / concurrent), a field-level three-way merge that resolves non-overlapping edits and flags true conflicts, and G-Counter and OR-Set CRDTs whose merges are commutative, associative and idempotent. All asserted.',
          code: raw`//  TWO PHONES EDIT TASK t1 OFFLINE (base: {title:"Report", due:"Mon", done:false})
//
//   phone A (clock +10 min): title -> "Q3 report"        at 10:05 (device time 10:15)
//   phone B (correct clock): due -> "Fri", done -> true  at 10:12
//   LWW by device time  -> A wins whole record: B's edits lost
//   3-way field merge   -> {title:"Q3 report", due:"Fri", done:true}  (no real conflict)
//   version vectors     -> A{a:1} vs B{b:1}: concurrent -> merge, don't overwrite
import assert from 'node:assert/strict';

type Task = { title: string; due: string; done: boolean };
const base: Task = { title: 'Report', due: 'Mon', done: false };
const a: Task = { ...base, title: 'Q3 report' };
const b: Task = { ...base, due: 'Fri', done: true };

// 1) LWW with device timestamps
const minutes = (h: number, m: number) => h * 60 + m;
const lww = (x: { v: Task; t: number }, y: { v: Task; t: number }) => (x.t >= y.t ? x.v : y.v);
const winner = lww({ v: a, t: minutes(10, 5) + 10 /* clock skew */ }, { v: b, t: minutes(10, 12) });
assert.deepEqual(winner, a);                                   // B's later, real edits are silently lost

// 2) version vectors: happened-before or concurrent?
type VV = Record<string, number>;
function compare(x: VV, y: VV): 'equal' | 'before' | 'after' | 'concurrent' {
  const ids = new Set([...Object.keys(x), ...Object.keys(y)]);
  let less = false, greater = false;
  for (const id of ids) { const xi = x[id] ?? 0, yi = y[id] ?? 0; if (xi < yi) less = true; if (xi > yi) greater = true; }
  return less && greater ? 'concurrent' : less ? 'before' : greater ? 'after' : 'equal';
}
assert.equal(compare({ a: 1 }, { b: 1 }), 'concurrent');
assert.equal(compare({ a: 1 }, { a: 1, b: 1 }), 'before');      // B had already seen A's edit
assert.equal(compare({ a: 2, b: 1 }, { a: 1, b: 1 }), 'after');

// 3) field-level three-way merge
function merge3<T extends Record<string, unknown>>(baseV: T, mine: T, theirs: T) {
  const out = { ...baseV }; const conflicts: string[] = [];
  for (const k of Object.keys(baseV) as Array<keyof T>) {
    const m = mine[k], t = theirs[k];
    if (Object.is(m, t)) out[k] = m;
    else if (Object.is(m, baseV[k])) out[k] = t;              // only they changed it
    else if (Object.is(t, baseV[k])) out[k] = m;              // only I changed it
    else conflicts.push(String(k));                            // both changed it differently
  }
  return { merged: out, conflicts };
}
assert.deepEqual(merge3(base, a, b), { merged: { title: 'Q3 report', due: 'Fri', done: true }, conflicts: [] });
assert.deepEqual(merge3(base, { ...base, due: 'Tue' }, { ...base, due: 'Fri' }).conflicts, ['due']);   // ask the user

// 4) CRDTs: merge order and duplicates don't matter
const gMerge = (x: VV, y: VV): VV => Object.fromEntries([...new Set([...Object.keys(x), ...Object.keys(y)])].map((k) => [k, Math.max(x[k] ?? 0, y[k] ?? 0)]));
const value = (c: VV) => Object.values(c).reduce((s, n) => s + n, 0);
const likesA = { a: 3 }, likesB = { b: 2 }, likesC = { a: 1, c: 4 };
assert.equal(value(gMerge(likesA, likesB)), value(gMerge(likesB, likesA)));                         // commutative
assert.deepEqual(gMerge(gMerge(likesA, likesB), likesC), gMerge(likesA, gMerge(likesB, likesC)));   // associative
assert.deepEqual(gMerge(likesA, likesA), likesA);                                                    // idempotent
assert.equal(value(gMerge(gMerge(likesA, likesB), likesC)), 9);

type OrSet = { adds: Map<string, Set<string>>; removes: Set<string> };   // element -> unique add tags
const orAdd = (s: OrSet, el: string, tag: string) => { s.adds.set(el, new Set([...(s.adds.get(el) ?? []), tag])); };
const orRemove = (s: OrSet, el: string) => { for (const t of s.adds.get(el) ?? []) s.removes.add(t); };  // removes only observed tags
const orMerge = (x: OrSet, y: OrSet): OrSet => {
  const adds = new Map<string, Set<string>>();
  for (const src of [x, y]) for (const [el, tags] of src.adds) adds.set(el, new Set([...(adds.get(el) ?? []), ...tags]));
  return { adds, removes: new Set([...x.removes, ...y.removes]) };
};
const orValue = (s: OrSet) => [...s.adds].filter(([, tags]) => [...tags].some((t) => !s.removes.has(t))).map(([el]) => el).sort();
const tagsA: OrSet = { adds: new Map(), removes: new Set() }, tagsB: OrSet = { adds: new Map(), removes: new Set() };
orAdd(tagsA, 'urgent', 'a1'); orAdd(tagsB, 'urgent', 'a1');   // both replicas saw the same add
orRemove(tagsA, 'urgent');                                     // A removes it ...
orAdd(tagsB, 'urgent', 'b1');                                  // ... while B concurrently re-adds it
orAdd(tagsB, 'home', 'b2');
assert.deepEqual(orValue(orMerge(tagsA, tagsB)), ['home', 'urgent']);   // add wins over a concurrent remove
assert.deepEqual(orValue(orMerge(tagsA, tagsB)), orValue(orMerge(tagsB, tagsA)));
console.log('LWW kept:', JSON.stringify(winner), '| 3-way merge:', JSON.stringify(merge3(base, a, b).merged));`,
        },
        production: {
          language: 'ts',
          filename: 'resolveConflict.ts',
          explanation: 'Production client handling of 409 Conflict during sync: the outbox mutation keeps the base version and base values it was made from; on 409 the engine three-way merges base/local/server per field, retries automatically when nothing overlaps (with the new baseVersion), and otherwise stores a conflict record for the UI to resolve with Keep mine / Keep theirs.',
          code: raw`import type { SQLiteDatabase } from 'expo-sqlite';

type Fields = Record<string, string | number | boolean | null>;
type UpdateMutation = { id: string; entity_id: string; baseVersion: number; base: Fields; changes: Fields };
type ServerRecord = { id: string; version: number; fields: Fields };

export function threeWayMerge(base: Fields, mine: Fields, theirs: Fields) {
  const merged: Fields = { ...theirs };
  const conflicts: string[] = [];
  for (const k of Object.keys(mine)) {
    if (Object.is(mine[k], theirs[k]) || Object.is(mine[k], base[k])) continue;   // same, or I didn't change it
    if (Object.is(theirs[k], base[k])) merged[k] = mine[k];                       // only I changed it
    else conflicts.push(k);                                                       // both changed it differently
  }
  return { merged, conflicts };
}

export async function sendUpdate(db: SQLiteDatabase, m: UpdateMutation, api: string): Promise<'done' | 'retry' | 'needs-user'> {
  const res = await fetch(api + '/tasks/' + m.entity_id, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'idempotency-key': m.id, 'if-match': '"' + m.baseVersion + '"' },
    body: JSON.stringify({ changes: m.changes, baseVersion: m.baseVersion }),
  });
  if (res.ok) return 'done';
  if (res.status !== 409) return 'retry';

  const server = (await res.json()) as ServerRecord;                     // current server state
  const mine = { ...m.base, ...m.changes };
  const { merged, conflicts } = threeWayMerge(m.base, mine, server.fields);
  if (conflicts.length === 0) {
    // non-overlapping edits: rebase the mutation onto the server version and send again
    const changes = Object.fromEntries(Object.keys(m.changes).map((k) => [k, merged[k]]));
    await db.runAsync('UPDATE outbox SET payload = ? WHERE id = ?',
      [JSON.stringify({ baseVersion: server.version, base: server.fields, changes }), m.id]);
    return 'retry';
  }
  // true conflict: park it and let the user decide (Keep mine / Keep theirs / Edit)
  await db.withTransactionAsync(async () => {
    await db.runAsync('INSERT INTO conflicts (mutation_id, entity_id, fields, mine, theirs, server_version) VALUES (?, ?, ?, ?, ?, ?)',
      [m.id, m.entity_id, JSON.stringify(conflicts), JSON.stringify(mine), JSON.stringify(server.fields), server.version]);
    await db.runAsync("UPDATE outbox SET state = 'blocked' WHERE id = ?", [m.id]);
  });
  return 'needs-user';
}`,
        },
        bug: {
          explanation:
            'The client stamps updates with its own clock and the server keeps whichever timestamp is larger. A phone whose clock runs ahead (or was changed manually) wins every conflict and silently erases other devices\' newer edits; nobody is ever told. Use a server-assigned version with baseVersion checks (409 on mismatch) and merge or ask the user.',
          buggy: {
            language: 'ts',
            filename: 'tasks.server.ts',
            code: raw`// ❌ LWW on device clocks: skewed phones overwrite newer data, silently
app.patch('/tasks/:id', async (req, res) => {
  const { fields, updatedAt } = req.body;                    // updatedAt = Date.now() on the phone
  await db.query(
    'UPDATE tasks SET fields = $2, updated_at = $3 WHERE id = $1 AND updated_at < $3',
    [req.params.id, fields, new Date(updatedAt)]);
  res.sendStatus(204);                                       // "success" even when nothing was saved
});`,
          },
          fixed: {
            language: 'ts',
            filename: 'tasks.server.ts',
            code: raw`// ✅ Server-assigned versions; mismatches return 409 with the current record
app.patch('/tasks/:id', async (req, res) => {
  const { changes, baseVersion } = req.body;
  const { rows } = await db.query(
    'UPDATE tasks SET fields = fields || $2::jsonb, version = version + 1 WHERE id = $1 AND version = $3 RETURNING *',
    [req.params.id, JSON.stringify(changes), baseVersion]);
  if (rows.length) return res.json(rows[0]);
  const { rows: [current] } = await db.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
  if (!current) return res.status(404).json({ title: 'Not found', status: 404 });
  res.status(409).json(current);                              // client merges or asks the user
});`,
          },
        },
      },
      takeaways: [
        'Decide conflict policy per entity/field: server wins, field merge, user choice, or CRDT.',
        'LWW on device clocks silently loses data; use server versions (baseVersion → 409) or hybrid logical clocks.',
        'Version vectors distinguish "already seen" from "truly concurrent"; three-way merges resolve non-overlapping edits.',
        'CRDT merges are commutative, associative and idempotent, so replicas converge in any order.',
        'Practice drill: in Tab 1, give phone A a clock that is 10 minutes slow instead of fast and predict which record LWW keeps (B\'s), then explain why that is still not a safe policy.',
      ],
      labId: 'app-architecture',
      labMode: 'conflict',
    },
  ],
};
