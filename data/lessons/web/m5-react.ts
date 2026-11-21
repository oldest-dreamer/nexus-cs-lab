import type { Module } from '../../types';

const raw = String.raw;

export const reactModule: Module = {
  id: 'web-react',
  title: 'Modern React 19 Architecture & Performance',
  level: 'Intermediate',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'web-react-reconciliation-keys',
      title: 'Reconciliation, Fiber & Why key Bugs Corrupt State',
      summary: 'What React does between setState and the DOM update, how it decides whether a component is "the same" across renders, and why index keys move state onto the wrong row.',
      difficulty: 'Intermediate',
      minutes: 22,
      xp: 120,
      analogy:
        "Reconciliation is a theatre stage manager comparing tonight's cast list with last night's. Actors with the same name and role keep their costume and memorised lines (state); new names get new actors; missing names leave the stage. If the cast list only says \"actor #1, actor #2\" (index keys) and you add someone at the top, every actor shifts one role down while keeping their old costume: the play is now wrong, and nobody crashed.",
      intuition: [
        { title: 'Render is pure, commit touches the DOM', body: "A state update schedules a render: React calls your components to produce a new element tree. It reconciles (diffs) that tree against the previous one, then commits only the needed DOM changes and runs effects. Rendering can happen more often than committing." },
        { title: 'Fiber makes rendering interruptible', body: "Each component instance is a fiber: a unit of work with links to parent, child and sibling. React can pause between fibers to handle urgent updates (typing) before finishing non-urgent ones (`startTransition`), which is how concurrent rendering keeps input responsive." },
        { title: 'Identity = position + type + key', body: "At the same position, the same component type with the same key is treated as the same instance and keeps its state. A different type (e.g. `<div>` → `<section>`) or a different key unmounts the old subtree and mounts a new one, resetting all state inside." },
        { title: 'Keys identify items in lists', body: "With `key={item.id}`, React matches old and new children by id, so reordering moves DOM nodes and state along with their items. With `key={index}`, keys describe positions: inserting at the top makes every item match the instance that used to be one row above." },
        { title: 'Key is also a reset button', body: "`<EditProfile key={userId} />` deliberately throws away all local state when the user changes, cleaner than an effect that tries to reset fields." },
        { title: 'Unidirectional data flow', body: "State lives in the lowest common owner and flows down as props; changes flow up as callbacks. Any piece of data has exactly one owner, which makes renders predictable and bugs traceable." },
      ],
      callouts: [
        { kind: 'architecture', title: 'From setState to pixels', body: 'Render can be interrupted and restarted; commit is synchronous and atomic.', flow: ['setState / dispatch', 'schedule (lane priority)', 'render: call components → elements', 'reconcile: match by type + key', 'commit: DOM mutations', 'layout effects → paint → effects'] },
        { kind: 'tip', title: 'Use the lab', body: 'The React Re-Render X-Ray below opens in React mode. Each node flashes on commit (cyan = necessary, crimson = wasted) and shows why it rendered. Increment the counter and watch which components React re-renders, before you learn to prevent the wasted ones in the memoization chapter.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'mini_reconciler.ts',
          explanation: 'Runnable TypeScript model of keyed reconciliation: component instances hold local state (an input draft), and the reconciler matches new children to old instances by key. Inserting an item at the top with index keys moves the draft onto the wrong item; stable keys keep it with its item. All outcomes are asserted.',
          code: raw`//  INSERT "Call mom" AT THE TOP
//
//   key = index                         key = id
//   old: [0:Buy milk  draft="2L"]       old: [m:Buy milk draft="2L"]
//   new: [0:Call mom  <- reuses 0!]     new: [c:Call mom (new instance)]
//        [1:Buy milk  <- reuses 1]           [m:Buy milk draft="2L"] (moved)
//   => "2L" now shows next to Call mom   => state stays with its item
import assert from 'node:assert/strict';

type Item = { id: string; label: string };
type Instance = { key: string; label: string; draft: string; mounted: number };
let mounts = 0;

function reconcile(prev: Instance[], items: Item[], keyOf: (item: Item, index: number) => string): Instance[] {
  const byKey = new Map(prev.map((inst) => [inst.key, inst]));
  return items.map((item, i) => {
    const key = keyOf(item, i);
    const existing = byKey.get(key);
    if (existing) return { ...existing, label: item.label };      // same key: keep state, update props
    return { key, label: item.label, draft: '', mounted: ++mounts }; // new key: mount fresh state
  });
}

const byIndex = (_: Item, i: number) => String(i);
const byId = (item: Item) => item.id;
const before: Item[] = [{ id: 'm', label: 'Buy milk' }, { id: 'w', label: 'Walk dog' }];
const after: Item[] = [{ id: 'c', label: 'Call mom' }, ...before];

for (const [name, keyOf] of [['index', byIndex], ['id', byId]] as const) {
  let tree = reconcile([], before, keyOf);
  tree[0].draft = '2L';                                           // user types into "Buy milk"
  tree = reconcile(tree, after, keyOf);
  const draftOf = (label: string) => tree.find((t) => t.label === label)!.draft;
  if (name === 'index') {
    assert.equal(draftOf('Call mom'), '2L');                       // state moved to the wrong row
    assert.equal(draftOf('Buy milk'), '');
  } else {
    assert.equal(draftOf('Call mom'), '');
    assert.equal(draftOf('Buy milk'), '2L');                       // state followed its item
  }
}

// key as a reset button: changing the key mounts a brand-new instance
let form = reconcile([], [{ id: 'user-1', label: 'Edit Ada' }], byId);
form[0].draft = 'unsaved bio';
form = reconcile(form, [{ id: 'user-2', label: 'Edit Lin' }], byId);
assert.equal(form[0].draft, '');
console.log('index keys move state; id keys keep it; total mounts =', mounts);`,
        },
        production: {
          language: 'tsx',
          filename: 'TodoList.tsx',
          explanation: 'Production React 19: stable ids generated when items are created, state owned by the list and passed down, events passed up, a key used deliberately to reset an editor, and startTransition for a non-urgent filter update.',
          code: raw`import { useState, useTransition } from 'react';

type Todo = { id: string; title: string; done: boolean };

export function TodoApp() {
  // single owner of the list state (unidirectional data flow)
  const [todos, setTodos] = useState<Todo[]>([]);
  const [filter, setFilter] = useState<'all' | 'open'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const add = (title: string) =>
    setTodos((ts) => [{ id: crypto.randomUUID(), title, done: false }, ...ts]);  // id born with the item
  const toggle = (id: string) =>
    setTodos((ts) => ts.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const remove = (id: string) => setTodos((ts) => ts.filter((t) => t.id !== id));

  const visible = filter === 'all' ? todos : todos.filter((t) => !t.done);
  const editing = todos.find((t) => t.id === editingId);

  return (
    <section aria-busy={isPending}>
      <NewTodo onAdd={add} />
      <select value={filter} onChange={(e) => startTransition(() => setFilter(e.target.value as 'all' | 'open'))}>
        <option value="all">All</option><option value="open">Open</option>
      </select>
      <ul>
        {visible.map((t) => (
          <TodoRow key={t.id} todo={t} onToggle={toggle} onRemove={remove} onEdit={setEditingId} />
        ))}
      </ul>
      {/* key resets the editor's local draft whenever a different todo is edited */}
      {editing && <TodoEditor key={editing.id} todo={editing} onSave={(title) => {
        setTodos((ts) => ts.map((t) => (t.id === editing.id ? { ...t, title } : t)));
        setEditingId(null);
      }} />}
    </section>
  );
}

function TodoRow({ todo, onToggle, onRemove, onEdit }: {
  todo: Todo; onToggle: (id: string) => void; onRemove: (id: string) => void; onEdit: (id: string) => void;
}) {
  return (
    <li>
      <input type="checkbox" checked={todo.done} onChange={() => onToggle(todo.id)} />
      <span onDoubleClick={() => onEdit(todo.id)}>{todo.title}</span>
      <button onClick={() => onRemove(todo.id)} aria-label={'Delete ' + todo.title}>×</button>
    </li>
  );
}

function NewTodo({ onAdd }: { onAdd: (title: string) => void }) {
  const [title, setTitle] = useState('');                         // local draft: nobody else needs it
  return <form onSubmit={(e) => { e.preventDefault(); if (title.trim()) { onAdd(title.trim()); setTitle(''); } }}>
    <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="New todo" />
  </form>;
}

function TodoEditor({ todo, onSave }: { todo: Todo; onSave: (title: string) => void }) {
  const [draft, setDraft] = useState(todo.title);                 // initialised once per key
  return <form onSubmit={(e) => { e.preventDefault(); onSave(draft); }}>
    <input value={draft} onChange={(e) => setDraft(e.target.value)} />
  </form>;
}`,
        },
        bug: {
          explanation:
            'With key={index}, deleting the first row makes React reuse row 0\'s component instance (and its uncontrolled input and local state) for what used to be row 1. The typed note visibly jumps to a different item, and checkboxes or animations attach to the wrong data. Use a stable id from the data as the key.',
          buggy: {
            language: 'tsx',
            filename: 'NotesList.tsx',
            code: raw`// ❌ Keys describe positions, not items: delete row 0 and every draft shifts up
{notes.map((note, index) => (
  <li key={index}>
    {note.title}
    <input defaultValue="" placeholder="Add a comment" />   {/* uncontrolled: state lives in the DOM node */}
    <button onClick={() => removeNote(note.id)}>Delete</button>
  </li>
))}`,
          },
          fixed: {
            language: 'tsx',
            filename: 'NotesList.tsx',
            code: raw`// ✅ Stable identity from the data: state stays with its note
{notes.map((note) => (
  <li key={note.id}>
    {note.title}
    <input defaultValue="" placeholder="Add a comment" />
    <button onClick={() => removeNote(note.id)}>Delete</button>
  </li>
))}`,
          },
        },
      },
      takeaways: [
        'Render calls components; reconcile diffs; commit updates the DOM. Fiber lets rendering pause for urgent work.',
        'Same position + same type + same key = same instance with preserved state.',
        'Use stable ids as keys; index keys move state between items on insert, delete or reorder.',
        'Change a key on purpose to reset a subtree; keep each piece of state in exactly one owner.',
        'Practice drill: in Tab 1, delete "Buy milk" instead of inserting at the top and predict which label inherits the "2L" draft with index keys ("Walk dog").',
      ],
      labId: 'web-internals',
      labMode: 'react',
    },

    // ------------------------------------------------------------------------
    {
      id: 'web-react-effects-server-state',
      title: 'Hooks Lifecycle, useEffect Cleanup, Stale Closures & Server vs Client State',
      summary: 'When effects run and clean up, why a callback can see an old value forever, and why data from the server should live in a cache (TanStack Query) instead of hand-written effects.',
      difficulty: 'Intermediate',
      minutes: 25,
      xp: 130,
      analogy:
        "Every render is a photograph. Functions created during a render (event handlers, effect callbacks) carry that photograph with them; that is a closure. If an interval callback was created in the first photograph and never replaced, it keeps looking at the first photograph forever: a stale closure. Server data is different again: it's a newspaper, someone else owns it, it goes out of date, and you want a newsstand (a query cache) that keeps copies fresh rather than every reader printing their own.",
      intuition: [
        { title: 'Each render has its own props and state', body: "`count` inside a render is a constant for that render. `setCount(count + 1)` schedules a new render with a new `count`; it never mutates the old one." },
        { title: 'Effect lifecycle', body: "After commit, React runs effects whose dependencies changed. Before running an effect again (and on unmount) it runs the previous cleanup. In development StrictMode, React mounts, cleans up and re-mounts once to prove your cleanup works." },
        { title: 'Stale closures', body: "An effect with `[]` captures the first render's values. An interval doing `setCount(count + 1)` therefore sets 1 forever. Fixes: list the dependency, use a functional update (`setCount(c => c + 1)`), or read the latest value from a ref." },
        { title: 'You might not need an effect', body: "Derive values during render (`const total = items.reduce(...)`), handle user actions in event handlers, and reset state with a key. Effects are for synchronising with external systems: subscriptions, timers, the DOM, the network." },
        { title: 'Server state is not client state', body: "Client state (an open modal, a form draft) is owned by the UI. Server state (users, orders) is owned by the server: it can be stale, shared by many components, and needs caching, deduplication, retries, background refetching and invalidation after mutations." },
        { title: 'Use a query cache for server state', body: "TanStack Query (or a framework loader) handles races, caching and refetching. Hand-written `useEffect` fetching must at least abort or ignore stale responses, or a slow earlier request can overwrite a newer one." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Effect timeline across renders', body: 'Cleanup of the previous effect always runs before the next effect.', flow: ['render #1 → commit', 'effect #1 runs', 'deps change → render #2 → commit', 'cleanup #1', 'effect #2 runs', 'unmount → cleanup #2'] },
        { kind: 'tip', title: 'Lint the dependencies', body: 'Keep eslint-plugin-react-hooks on (rules-of-hooks + exhaustive-deps). Silencing exhaustive-deps is the single most common source of stale-closure bugs.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'mini_hooks_runtime.ts',
          explanation: 'Runnable TypeScript: a tiny hooks runtime (useState, useEffect with dependency comparison and cleanup) built from scratch. It reproduces the stale-closure interval bug, shows the functional-update fix, proves cleanup ordering, and models the fetch race that an ignore flag prevents. All outcomes are asserted.',
          code: raw`//  RENDER SNAPSHOTS
//
//   render#1 (count=0) --effect([])--> setInterval(() => set(count + 1))   count captured = 0
//   tick -> set(0 + 1) -> render#2 (count=1)
//   tick -> set(0 + 1) -> render#3 (count=1)   <- stale closure: stuck at 1
//   fix: set(c => c + 1) always reads the latest value
import assert from 'node:assert/strict';

type Cleanup = void | (() => void);
function createRuntime() {
  const slots: unknown[] = [];
  const effects: Array<{ deps?: unknown[]; cleanup?: Cleanup }> = [];
  const log: string[] = [];
  let cursor = 0, effectCursor = 0, component: () => void = () => {};
  const pending: Array<() => void> = [];

  function useState<T>(initial: T): [T, (next: T | ((prev: T) => T)) => void] {
    const i = cursor++;
    if (!(i in slots)) slots[i] = initial;
    const set = (next: T | ((prev: T) => T)) => {
      slots[i] = typeof next === 'function' ? (next as (p: T) => T)(slots[i] as T) : next;
      render();
    };
    return [slots[i] as T, set];
  }
  function useEffect(fn: () => Cleanup, deps?: unknown[]) {
    const i = effectCursor++;
    const prev = effects[i];
    const changed = !prev || !deps || deps.some((d, k) => !Object.is(d, prev.deps?.[k]));
    if (!changed) return;
    pending.push(() => {
      if (prev && typeof prev.cleanup === 'function') { prev.cleanup(); log.push('cleanup ' + i); }
      effects[i] = { deps, cleanup: fn() };
    });
  }
  function render() {
    cursor = 0; effectCursor = 0;
    component();
    while (pending.length) pending.shift()!();           // effects run after "commit"
  }
  function mount(c: () => void) { component = c; render(); }
  function unmount() { effects.forEach((e, i) => { if (typeof e.cleanup === 'function') { e.cleanup(); log.push('cleanup ' + i); } }); }
  return { useState, useEffect, mount, unmount, log };
}

// --- stale closure: interval created once with [] deps
function counterApp(fixed: boolean) {
  const rt = createRuntime();
  let tick: () => void = () => {};
  let shown = -1;
  rt.mount(() => {
    const [count, setCount] = rt.useState(0);
    shown = count;
    rt.useEffect(() => {
      tick = fixed ? () => setCount((c) => c + 1) : () => setCount(count + 1);   // captured count = 0
      return () => { tick = () => {}; };
    }, []);
  });
  tick(); tick(); tick();
  return { shown, rt };
}
assert.equal(counterApp(false).shown, 1);                 // stuck: 0 + 1 every time
assert.equal(counterApp(true).shown, 3);                  // functional update sees the latest value

// --- cleanup ordering when deps change, and on unmount
const rt = createRuntime();
let setRoom: (r: string) => void = () => {};
rt.mount(() => {
  const [room, set] = rt.useState('general');
  setRoom = set;
  rt.useEffect(() => { rt.log.push('connect ' + room); return () => rt.log.push('disconnect ' + room); }, [room]);
});
setRoom('random');
rt.unmount();
assert.deepEqual(rt.log, ['connect general', 'disconnect general', 'cleanup 0', 'connect random', 'disconnect random', 'cleanup 0']);

// --- fetch race: a slow response for an OLD id must not overwrite the new one
function loadProfiles(withIgnoreFlag: boolean) {
  let shownName = '';
  const responses: Array<() => void> = [];
  const effectFor = (id: string) => {
    let ignore = false;
    responses.push(() => { if (!withIgnoreFlag || !ignore) shownName = 'user ' + id; });
    return () => { ignore = true; };                       // cleanup when id changes
  };
  const cleanup1 = effectFor('1');
  cleanup1(); effectFor('2');                             // id changed from 1 to 2
  responses[1]();                                         // response for 2 arrives first
  responses[0]();                                         // slow response for 1 arrives last
  return shownName;
}
assert.equal(loadProfiles(false), 'user 1');              // race: wrong profile displayed
assert.equal(loadProfiles(true), 'user 2');
console.log('stale:', counterApp(false).shown, 'fixed:', counterApp(true).shown, '| log:', rt.log.join(', '));`,
        },
        production: {
          language: 'tsx',
          filename: 'orders-queries.tsx',
          explanation: 'Production React 19 + TanStack Query v5: server state in a query cache with keys, staleTime and abort signals; a mutation that invalidates the list; client-only UI state kept in useState; and an effect used only for an external subscription, with cleanup.',
          code: raw`import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

type Order = { id: string; status: 'open' | 'shipped'; totalCents: number };

// ---- server state: owned by the server, cached on the client
const ordersKey = (status: string) => ['orders', { status }] as const;

function useOrders(status: 'open' | 'shipped') {
  return useQuery({
    queryKey: ordersKey(status),                         // cache entry per filter
    queryFn: async ({ signal }) => {                     // signal aborts superseded requests
      const res = await fetch('/api/orders?status=' + status, { signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return (await res.json()) as Order[];
    },
    staleTime: 30_000,                                   // fresh for 30 s: no refetch on every mount
  });
}

function useShipOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetch('/api/orders/' + id + '/ship', { method: 'POST' }).then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),   // both filters refetch
  });
}

export function OrdersPage() {
  // ---- client state: owned by this UI only
  const [status, setStatus] = useState<'open' | 'shipped'>('open');
  const orders = useOrders(status);
  const ship = useShipOrder();

  // ---- an effect for an external system (WebSocket), with cleanup
  const qc = useQueryClient();
  useEffect(() => {
    const ws = new WebSocket('wss://example.com/orders/stream');
    ws.onmessage = () => qc.invalidateQueries({ queryKey: ['orders'] });
    return () => ws.close();                             // runs on unmount (and StrictMode re-mount)
  }, [qc]);

  if (orders.isPending) return <p aria-busy="true">Loading…</p>;
  if (orders.isError) return <p role="alert">{orders.error.message}</p>;
  return (
    <>
      <button onClick={() => setStatus(status === 'open' ? 'shipped' : 'open')}>Show {status === 'open' ? 'shipped' : 'open'}</button>
      <ul>{orders.data.map((o) => (
        <li key={o.id}>
          {o.id} · {(o.totalCents / 100).toFixed(2)}
          {o.status === 'open' && <button disabled={ship.isPending} onClick={() => ship.mutate(o.id)}>Ship</button>}
        </li>
      ))}</ul>
    </>
  );
}`,
        },
        bug: {
          explanation:
            'The effect runs once (empty dependency array), so the interval callback closes over the first render\'s count (0) and keeps calling setCount(0 + 1): the timer is stuck at 1. Use a functional update so each tick reads the latest state, and clear the interval in the cleanup.',
          buggy: {
            language: 'tsx',
            filename: 'Stopwatch.tsx',
            code: raw`// ❌ Stale closure: count is always 0 inside the interval, display stuck at 1
export function Stopwatch() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    setInterval(() => setCount(count + 1), 1000);   // also never cleared
  }, []);                                           // eslint-disable-line react-hooks/exhaustive-deps
  return <p>{count}s</p>;
}`,
          },
          fixed: {
            language: 'tsx',
            filename: 'Stopwatch.tsx',
            code: raw`// ✅ Functional update reads the latest state; cleanup stops the timer
export function Stopwatch() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setCount((c) => c + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return <p>{count}s</p>;
}`,
          },
        },
      },
      takeaways: [
        'Every render has its own props, state and closures; setState schedules a new render.',
        'Effects run after commit; the previous cleanup runs before the next effect and on unmount.',
        'Fix stale closures with correct dependencies, functional updates or refs; never silence exhaustive-deps.',
        'Keep server state in a query cache with keys, abort signals and invalidation; keep UI state local.',
        'Practice drill: in Tab 1, change the room twice (general → random → help) and write down the expected log before running it.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'web-react-memo-performance',
      title: 'React.memo, useCallback & useMemo: When Memoization Helps',
      summary: 'Why a parent re-render re-renders every child, how React.memo skips work with a shallow prop comparison, why unstable callbacks and objects silently defeat it, and when not to bother.',
      difficulty: 'Intermediate',
      minutes: 22,
      xp: 120,
      analogy:
        "React.memo is a receptionist who only lets you into the manager's office if your paperwork changed since last time. The check is quick: the receptionist only looks at whether each document is literally the same sheet of paper, not whether it says the same thing. If you print a fresh copy of the same document every time (a new function or object on every render), the receptionist always waves you in, and the check was wasted effort.",
      intuition: [
        { title: 'Re-renders cascade by default', body: "When a component's state changes, React re-renders it and all of its descendants, whether or not their props changed. This is usually fast enough; re-rendering is not the same as touching the DOM." },
        { title: 'React.memo = shallow props comparison', body: "`memo(Child)` skips rendering when every prop is `Object.is`-equal to last time. Primitives compare by value; objects, arrays and functions compare by reference." },
        { title: 'Unstable references defeat memo', body: "`onSelect={() => select(id)}` or `style={{ color: 'red' }}` creates a new reference on every parent render, so the memoized child re-renders anyway, now paying for the comparison as well." },
        { title: 'useCallback and useMemo stabilise references', body: "`useCallback(fn, deps)` returns the same function until deps change; `useMemo(() => compute(), deps)` caches a value. Use them for props passed to memoized children, for expensive calculations, and for values used as effect dependencies." },
        { title: 'Cheaper fixes first', body: "Move state down to where it is used, or pass expensive subtrees as `children` (they are created by the parent of the stateful component, so they don't re-render with it). These often remove the need for memo entirely." },
        { title: 'The React Compiler', body: "React 19 projects can enable the React Compiler, which automatically memoizes components and values at build time. Understanding referential equality is still essential for reading profiles and for code it cannot optimise." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Does the memoized child render?', body: 'One reference change anywhere in the props is enough to re-render.', flow: ['parent re-renders', 'memo(Child) compares each prop with Object.is', 'all equal → skip (reuse last output)', 'any different → render Child + its subtree'] },
        { kind: 'tip', title: 'Use the lab', body: 'The React Re-Render X-Ray below opens in React mode. Click Increment three times with neither toggle, with React.memo only, then with React.memo + useCallback, and compare the wasted-render counter: memo alone is defeated by the unstable callback; memo + useCallback brings wasted renders to zero.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'memo_from_scratch.ts',
          explanation: 'Runnable TypeScript: shallowEqual and memo implemented from scratch, a parent that re-renders three times, and render counts for no memo, memo with an inline callback, and memo with a stable callback (a useCallback stand-in). Also shows that structurally equal objects are still different references. All counts asserted.',
          code: raw`//  PARENT RE-RENDERS 3x
//
//   no memo                      -> child renders 1 + 3 = 4
//   memo + inline () => select() -> new function each time -> 4   (memo defeated)
//   memo + stable callback       -> props identical       -> 1   (3 skipped)
import assert from 'node:assert/strict';

type Props = Record<string, unknown>;
function shallowEqual(a: Props, b: Props): boolean {
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.is(a[k], b[k]));
}

function memo<P extends Props>(render: (p: P) => void) {
  let last: P | undefined;
  return (p: P) => {
    if (last && shallowEqual(last, p)) return;     // skip: reuse previous output
    last = p;
    render(p);
  };
}

function simulate(mode: 'plain' | 'memo-inline' | 'memo-stable'): number {
  let childRenders = 0;
  const renderChild = (_: { label: string; onSelect: () => void }) => { childRenders++; };
  const child = mode === 'plain' ? renderChild : memo(renderChild);
  const stableSelect = () => {};                   // what useCallback(fn, []) would return every time
  for (let parentRender = 0; parentRender < 4; parentRender++) {   // initial + 3 re-renders
    const onSelect = mode === 'memo-stable' ? stableSelect : () => {};   // inline = new function
    child({ label: 'Row', onSelect });
  }
  return childRenders;
}
assert.equal(simulate('plain'), 4);
assert.equal(simulate('memo-inline'), 4);
assert.equal(simulate('memo-stable'), 1);

// equal-looking objects are different references
assert.equal(shallowEqual({ style: { color: 'red' } }, { style: { color: 'red' } }), false);
const style = { color: 'red' };
assert.equal(shallowEqual({ style }, { style }), true);
assert.equal(Object.is(NaN, NaN) && !Object.is(0, -0), true);   // Object.is edge cases

// useMemo stand-in: recompute only when deps change
function useMemoLike<T>(compute: () => T) {
  let deps: unknown[] | undefined, value: T | undefined, computeCount = 0;
  return (nextDeps: unknown[]) => {
    if (!deps || nextDeps.some((d, i) => !Object.is(d, deps![i]))) { value = compute(); deps = nextDeps; computeCount++; }
    return { value: value as T, computeCount };
  };
}
const items = [5, 3, 8];
const sorted = useMemoLike(() => [...items].sort((a, b) => a - b));
sorted([items]); sorted([items]);
assert.equal(sorted([items]).computeCount, 1);
console.log('child renders: plain', simulate('plain'), '| memo+inline', simulate('memo-inline'), '| memo+stable', simulate('memo-stable'));`,
        },
        production: {
          language: 'tsx',
          filename: 'ProductGrid.tsx',
          explanation: 'Production React 19: state moved down so typing does not re-render the grid, a memoized row component receiving only stable props (useCallback with a functional update), useMemo for an expensive filter, and the children-as-props pattern for a static subtree.',
          code: raw`import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';

type Product = { id: string; name: string; priceCents: number; tags: string[] };

export function Shop({ products }: { products: Product[] }) {
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});

  // stable across renders: functional update means no dependency on cart
  const addToCart = useCallback((id: string) => {
    setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  }, []);

  // expensive work only when its inputs change
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? products.filter((p) => p.name.toLowerCase().includes(q) || p.tags.includes(q)) : products;
  }, [products, query]);

  return (
    <Layout sidebar={<StaticFilters />}>                {/* created here, not re-created by Layout's state */}
      <SearchBox value={query} onChange={setQuery} />   {/* setState functions are already stable */}
      <ul className="grid gap-3">
        {visible.map((p) => (
          <ProductRow key={p.id} product={p} inCart={cart[p.id] ?? 0} onAdd={addToCart} />
        ))}
      </ul>
    </Layout>
  );
}

// memo pays off: many rows, and every prop is a primitive or a stable reference
const ProductRow = memo(function ProductRow({ product, inCart, onAdd }: {
  product: Product; inCart: number; onAdd: (id: string) => void;
}) {
  return (
    <li>
      {product.name} · {(product.priceCents / 100).toFixed(2)}
      <button onClick={() => onAdd(product.id)}>Add {inCart > 0 && '(' + inCart + ')'}</button>
    </li>
  );
});

function Layout({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(true);                 // toggling does not re-render sidebar/children
  return <div className="flex"><aside hidden={!open}>{sidebar}</aside>
    <button onClick={() => setOpen((o) => !o)}>Toggle</button><main>{children}</main></div>;
}`,
        },
        bug: {
          explanation:
            'ExpensiveChart is wrapped in React.memo, but the parent passes a new arrow function (and a new options object) on every render, so the shallow comparison always fails and the chart re-renders on every keystroke anyway. Stabilise the callback with useCallback and the object with useMemo (or hoist constants outside the component).',
          buggy: {
            language: 'tsx',
            filename: 'Dashboard.tsx',
            code: raw`// ❌ memo defeated: onPointClick and options are new references every render
const ExpensiveChart = memo(Chart);

export function Dashboard({ series }: { series: Point[] }) {
  const [note, setNote] = useState('');
  return (
    <>
      <input value={note} onChange={(e) => setNote(e.target.value)} />
      <ExpensiveChart
        data={series}
        options={{ smooth: true }}                     /* new object each render */
        onPointClick={(p) => console.log(p)}           /* new function each render */
      />
    </>
  );
}`,
          },
          fixed: {
            language: 'tsx',
            filename: 'Dashboard.tsx',
            code: raw`// ✅ Stable references: typing in the input no longer re-renders the chart
const ExpensiveChart = memo(Chart);
const CHART_OPTIONS = { smooth: true } as const;     // constant: hoisted out of the component

export function Dashboard({ series }: { series: Point[] }) {
  const [note, setNote] = useState('');
  const onPointClick = useCallback((p: Point) => console.log(p), []);
  return (
    <>
      <input value={note} onChange={(e) => setNote(e.target.value)} />
      <ExpensiveChart data={series} options={CHART_OPTIONS} onPointClick={onPointClick} />
    </>
  );
}`,
          },
        },
      },
      takeaways: [
        'A parent re-render re-renders all descendants unless something stops it.',
        'React.memo compares props with Object.is: new functions/objects every render defeat it.',
        'useCallback/useMemo stabilise references; move state down or pass children before reaching for memo.',
        'Measure with the React Profiler (or let the React Compiler memoize) instead of memoizing everything.',
        'Practice drill: in the lab, reach zero wasted renders using only the toggles, then explain in one sentence why React.memo alone was not enough.',
      ],
      labId: 'web-internals',
      labMode: 'react',
    },

    // ------------------------------------------------------------------------
    {
      id: 'web-react-streaming-ai-ui',
      title: 'Streaming AI UI: SSE Token Streams, Optimistic State & Human Approval',
      summary: 'Render LLM answers token by token from a streamed response, let users stop generation, show optimistic updates that roll back on failure, and require explicit approval before an AI-proposed action changes data.',
      difficulty: 'Advanced',
      minutes: 25,
      xp: 140,
      analogy:
        "A streamed AI answer is a news ticker: words appear as they are typed in the newsroom, so readers start reading immediately instead of waiting for the full article. An optimistic update is a waiter writing your order on the board before the kitchen confirms it, and erasing it if the kitchen says no. A human-approval step is the bank teller who reads back \"transfer 500 to Alex, confirm?\" before anything moves.",
      intuition: [
        { title: 'Server-Sent Events format', body: "A stream of text events separated by a blank line. Each event has lines like `event: token`, `data: {\"t\":\"Hel\"}` and optionally `id:`; lines starting with `:` are comments (often keep-alives). Many LLM APIs stream this format, ending with a final event or `data: [DONE]`." },
        { title: 'Chunks are not lines', body: "Network chunks can split anywhere, including in the middle of a line or a UTF-8 character. Decode with a streaming `TextDecoder`, keep a buffer, and only parse complete events." },
        { title: 'Use fetch streaming for POST', body: "`EventSource` only supports GET without custom headers. For chat, `fetch` a POST endpoint and read `response.body` with a reader; pass an `AbortController` signal so a Stop button actually cancels the request (and the server stops spending tokens)." },
        { title: 'Render efficiently', body: "Append tokens with functional updates (`setText(t => t + chunk)`), and render the in-progress message in its own small component so the whole conversation doesn't re-render per token. Announce completion to screen readers instead of every token (`aria-live=\"polite\"` on a summary)." },
        { title: 'Optimistic UI', body: "React 19's `useOptimistic` shows the expected result immediately (\"message sent\") while the request runs inside an action/transition, and automatically reverts to the real state if it fails." },
        { title: 'Human approval before mutations', body: "When the model proposes a tool call that changes data (refund, delete, send email), render a confirmation card with the exact action and arguments. Only an explicit click calls the mutation endpoint, and the server re-checks permissions; the model's proposal is never authorisation." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Streaming chat request', body: 'Tokens flow down as SSE; proposed actions wait for a human click.', flow: ['POST /api/chat (AbortSignal)', 'SSE: event token × N', 'append to in-progress message', 'event: tool_proposal → approval card', 'user approves → POST /api/actions', 'server re-authorises → result'] },
        { kind: 'security', title: 'Model output is untrusted', body: 'Render streamed text as text (or sanitised Markdown), never via dangerouslySetInnerHTML. Proposed actions must be validated and authorised on the server exactly like a request from the user.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'sse_and_optimistic_from_scratch.ts',
          explanation: 'Runnable TypeScript: an incremental SSE parser that survives chunks split mid-line and mid-character (fed through a streaming TextDecoder), handles comments, multi-line data and [DONE], plus an optimistic-update reducer that rolls back on failure and an approval gate that refuses to run a mutation without an explicit approval. Everything asserted.',
          code: raw`//  SSE OVER ARBITRARY CHUNKS
//
//   chunk 1: "event: token\ndata: {\"t\":\"Hel"
//   chunk 2: "lo\"}\n\n: keep-alive\n\ndata: {\"t\":\" w"      <- event boundary inside a chunk
//   chunk 3: "orld\"}\n\ndata: [DONE]\n\n"
//   buffer --split on blank line--> complete events only --> tokens: "Hello", " world"
import assert from 'node:assert/strict';

type SseEvent = { event: string; data: string };
function createSseParser(onEvent: (e: SseEvent) => void) {
  let buffer = '';
  return (text: string) => {
    buffer += text;
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {          // only complete events
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let event = 'message';
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith(':')) continue;                    // comment / keep-alive
        const i = line.indexOf(':');
        const field = i === -1 ? line : line.slice(0, i);
        const value = i === -1 ? '' : line.slice(i + 1).replace(/^ /, '');
        if (field === 'event') event = value;
        if (field === 'data') data.push(value);
      }
      if (data.length) onEvent({ event, data: data.join('\n') });
    }
  };
}

const received: SseEvent[] = [];
const parse = createSseParser((e) => received.push(e));
const decoder = new TextDecoder();
const bytes = new TextEncoder().encode(
  'event: token\ndata: {"t":"Hello"}\n\n' +
  ': keep-alive\n\n' +
  'data: {"t":" w\u00f6rld"}\n\n' +
  'data: line one\ndata: line two\n\n' +
  'data: [DONE]\n\n');
const midChar = bytes.indexOf(0xc3) + 1;                        // between the 2 UTF-8 bytes of "ö"
const cuts = [7, 23, 40, midChar, 90, bytes.length];            // mid-line, mid-event, mid-character
let pos = 0;
for (const cut of cuts) {
  parse(decoder.decode(bytes.slice(pos, cut), { stream: true }));   // stream: true keeps partial UTF-8
  pos = cut;
}
assert.ok(40 < midChar && midChar < 90);
assert.deepEqual(received.map((e) => e.event), ['token', 'message', 'message', 'message']);
const tokens = received.filter((e) => e.data.startsWith('{')).map((e) => (JSON.parse(e.data) as { t: string }).t);
assert.equal(tokens.join(''), 'Hello wörld');
assert.equal(received[2].data, 'line one\nline two');
assert.equal(received[3].data, '[DONE]');

// optimistic update with rollback
type Msg = { id: string; text: string; pending?: boolean };
function sendOptimistic(list: Msg[], msg: Msg, serverOk: boolean): { shown: Msg[]; final: Msg[] } {
  const shown = [...list, { ...msg, pending: true }];          // instantly visible
  const final = serverOk ? [...list, msg] : list;              // confirmed or rolled back
  return { shown, final };
}
const ok = sendOptimistic([], { id: 'a', text: 'hi' }, true);
const bad = sendOptimistic([], { id: 'b', text: 'hi' }, false);
assert.equal(ok.shown[0].pending, true);
assert.deepEqual(ok.final, [{ id: 'a', text: 'hi' }]);
assert.deepEqual(bad.final, []);

// approval gate: AI-proposed mutations never run without an explicit human approval
type Proposal = { tool: 'refund'; args: { orderId: string; cents: number }; approvedBy?: string };
const executed: Proposal[] = [];
function execute(p: Proposal) {
  if (!p.approvedBy) throw new Error('approval required');
  executed.push(p);
}
const proposal: Proposal = { tool: 'refund', args: { orderId: 'o-9', cents: 1200 } };
assert.throws(() => execute(proposal), /approval required/);
execute({ ...proposal, approvedBy: 'agent-ui:user-42' });
assert.equal(executed.length, 1);
console.log('streamed:', JSON.stringify(tokens.join('')), '| events:', received.length);`,
        },
        production: {
          language: 'tsx',
          filename: 'Chat.tsx',
          explanation: 'Production React 19 chat: a streaming hook that POSTs with fetch, parses SSE incrementally, appends tokens with functional updates and supports Stop via AbortController; useOptimistic for the user\'s message; and an approval card that is the only path from a model-proposed tool call to the mutation endpoint.',
          code: raw`import { useOptimistic, useRef, useState, useTransition } from 'react';

type Msg = { id: string; role: 'user' | 'assistant'; text: string; sending?: boolean };
type Proposal = { id: string; tool: string; args: Record<string, unknown>; summary: string };

export function useChatStream() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  async function send(text: string) {
    ctrl.current = new AbortController();
    const assistantId = crypto.randomUUID();
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: 'user', text },
                              { id: assistantId, role: 'assistant', text: '' }]);
    const res = await fetch('/api/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }), signal: ctrl.current.signal,
    });
    if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();   // handles split UTF-8
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {           // complete events only
        const block = buffer.slice(0, sep); buffer = buffer.slice(sep + 2);
        const event = /^event: (.*)$/m.exec(block)?.[1] ?? 'message';
        const data = block.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('\n');
        if (data === '[DONE]') return;
        if (event === 'token') {
          const { t } = JSON.parse(data) as { t: string };
          setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, text: x.text + t } : x)));  // functional
        } else if (event === 'tool_proposal') {
          setProposal(JSON.parse(data) as Proposal);            // shown to the user, NOT executed
        }
      }
    }
  }
  return { messages, proposal, setProposal, send, stop: () => ctrl.current?.abort() };
}

export function Chat() {
  const { messages, proposal, setProposal, send, stop } = useChatStream();
  const [optimistic, addOptimistic] = useOptimistic(messages, (cur, text: string) =>
    [...cur, { id: 'optimistic', role: 'user' as const, text, sending: true }]);
  const [isPending, startTransition] = useTransition();

  const submit = (form: FormData) => startTransition(async () => {
    const text = String(form.get('text') ?? '').trim();
    if (!text) return;
    addOptimistic(text);                                        // reverts automatically if send throws
    await send(text);
  });

  return (
    <div>
      <ol aria-label="Conversation">
        {optimistic.map((m) => <li key={m.id} className={m.sending ? 'opacity-60' : ''}>{m.text}</li>)}
      </ol>
      {proposal && (
        <div role="alertdialog" aria-label="Confirm action" className="rounded-lg border p-3">
          <p>The assistant wants to: <strong>{proposal.summary}</strong></p>
          <pre>{JSON.stringify(proposal.args, null, 2)}</pre>
          <button onClick={async () => {
            await fetch('/api/actions/' + proposal.id + '/approve', { method: 'POST' });   // server re-authorises
            setProposal(null);
          }}>Approve</button>
          <button onClick={() => setProposal(null)}>Reject</button>
        </div>
      )}
      <form action={submit}>
        <input name="text" aria-label="Message" />
        {isPending ? <button type="button" onClick={stop}>Stop</button> : <button>Send</button>}
      </form>
    </div>
  );
}`,
        },
        bug: {
          explanation:
            'Splitting each network chunk on newlines assumes chunks end on event boundaries. They don\'t: when a chunk ends mid-line, the half-line is parsed as broken JSON (dropped tokens or a crash), and decoding each chunk separately corrupts multi-byte characters. Keep a buffer, decode with stream: true (or TextDecoderStream), and parse only complete events.',
          buggy: {
            language: 'ts',
            filename: 'stream.ts',
            code: raw`// ❌ Assumes every chunk contains whole lines and whole characters
const reader = res.body!.getReader();
for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  for (const line of new TextDecoder().decode(value).split('\n')) {   // fresh decoder per chunk
    if (line.startsWith('data: ')) onToken(JSON.parse(line.slice(6)).t);   // throws on half a line
  }
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'stream.ts',
            code: raw`// ✅ One streaming decoder + a buffer; parse complete events only
const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
let buffer = '';
for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += value;
  let sep: number;
  while ((sep = buffer.indexOf('\n\n')) !== -1) {
    const block = buffer.slice(0, sep);
    buffer = buffer.slice(sep + 2);
    const data = block.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('\n');
    if (data && data !== '[DONE]') onToken(JSON.parse(data).t);
  }
}`,
          },
        },
      },
      takeaways: [
        'SSE events are blank-line separated; chunks can split anywhere, so buffer and decode with streaming.',
        'Stream POST responses with fetch + reader and wire Stop to an AbortController.',
        'Append tokens with functional updates; isolate the in-progress message to limit re-renders.',
        'useOptimistic shows expected results instantly and reverts on failure; AI-proposed mutations need explicit human approval and server re-authorisation.',
        'Practice drill: in Tab 1, replace cuts with every index from 1 to bytes.length (one byte at a time) and confirm the parser still produces exactly the same tokens.',
      ],
    },
  ],
};
