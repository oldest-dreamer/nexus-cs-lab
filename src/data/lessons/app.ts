import type { Track } from '../types';

export const appTrack: Track = {
  id: 'app',
  title: 'App Development',
  short: 'App',
  tagline: 'Mobile UI architecture, predictable state, and apps that keep working offline.',
  accent: 'amber',
  icon: 'smartphone',
  modules: [
    {
      id: 'app-state',
      title: 'UI Architecture & State Management',
      level: 'Beginner',
      lessons: [
        {
          id: 'app-unidirectional-state',
          title: 'Unidirectional Data Flow: Store → View → Action',
          summary: 'Why every serious app framework converges on one-way data flow, and how to build it with a reducer.',
          difficulty: 'Beginner',
          minutes: 14,
          xp: 70,
          analogy:
            'State is a river that only flows downhill. The view never reaches back up to change the water. It drops a message (an action) in at the top, and a single gatekeeper (the reducer) decides the new flow.',
          intuition: [
            { title: 'The view is a function of state', body: 'Give the screen the same state and it draws the same thing, every time. That makes bugs reproducible.' },
            { title: 'Views never mutate state', body: 'Buttons do not edit data directly. They dispatch an action, a plain object describing what happened, such as { type: "added", item }.' },
            { title: 'One reducer decides', body: 'A reducer is a pure function: (oldState, action) → newState. No network calls, no randomness. Just math on data.' },
            { title: 'New state means new render', body: 'The framework sees that the state object changed (a new reference) and re-renders only what depends on it.' },
          ],
          callouts: [
            {
              kind: 'architecture',
              title: 'The one-way loop',
              body: 'Side effects (network, storage) live outside the reducer, in effects or middleware that dispatch more actions.',
              flow: ['State', 'View renders', 'User taps', 'dispatch(action)', 'reducer(state, action)', 'New State'],
            },
            {
              kind: 'tip',
              title: 'Model actions as events',
              body: 'Name actions in past tense ("itemAdded", not "addItem"). They describe what happened; the reducer decides what it means.',
            },
          ],
          code: {
            basic: {
              language: 'ts',
              filename: 'cartReducer.ts',
              explanation: 'A discriminated union makes every action type-checked, and the reducer must handle each case.',
              code: `type Item = { id: string; name: string; qty: number };
type State = { items: Item[] };

type Action =
  | { type: 'itemAdded'; item: Item }
  | { type: 'itemRemoved'; id: string }
  | { type: 'cartCleared' };

export function cartReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'itemAdded':
      return { items: [...state.items, action.item] };
    case 'itemRemoved':
      return { items: state.items.filter((i) => i.id !== action.id) };
    case 'cartCleared':
      return { items: [] };
  }
}`,
            },
            production: {
              language: 'tsx',
              filename: 'CartProvider.tsx',
              explanation: 'Split state and dispatch into two contexts so components that only dispatch never re-render when the cart changes.',
              code: `import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react';
import { cartReducer, type Action, type State } from './cartReducer';

const StateCtx = createContext<State | null>(null);
const DispatchCtx = createContext<Dispatch<Action> | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [] });
  return (
    <DispatchCtx.Provider value={dispatch}>
      <StateCtx.Provider value={state}>{children}</StateCtx.Provider>
    </DispatchCtx.Provider>
  );
}

export const useCart = () => {
  const s = useContext(StateCtx);
  if (!s) throw new Error('useCart must be inside CartProvider');
  return s;
};

export const useCartDispatch = () => {
  const d = useContext(DispatchCtx);
  if (!d) throw new Error('useCartDispatch must be inside CartProvider');
  return d;
};`,
            },
            bug: {
              explanation:
                'Mutating the existing array keeps the same reference, so React (and most state libraries) see "no change" and skip the re-render. Always return new objects and arrays.',
              buggy: {
                language: 'ts',
                filename: 'cartReducer.ts',
                code: `// ❌ Mutation: same array reference, so the UI never updates
case 'itemAdded':
  state.items.push(action.item);
  return state;`,
              },
              fixed: {
                language: 'ts',
                filename: 'cartReducer.ts',
                code: `// ✅ New array, new state object
case 'itemAdded':
  return { ...state, items: [...state.items, action.item] };`,
              },
            },
          },
          takeaways: ['View = f(state).', 'Actions describe events; reducers are pure.', 'Never mutate; return new references.'],
          labId: 'web-internals',
          labMode: 'react',
        },
      ],
      planned: ['Navigation Stacks & Deep Links', 'Server State vs. Client State (React Query)', 'Performance: Lists, Virtualization & Memo'],
    },
    {
      id: 'app-offline',
      title: 'Offline Sync & APIs',
      level: 'Intermediate',
      lessons: [
        {
          id: 'app-offline-outbox',
          title: 'Offline-First Sync with an Outbox Queue',
          summary: 'Write locally first, sync later, and make retries safe with idempotency keys.',
          difficulty: 'Intermediate',
          minutes: 18,
          xp: 100,
          analogy:
            'An outbox is the post tray on your desk. You drop letters in whenever you like; the mail carrier takes them when the road is open. Each letter carries a tracking number, so a letter delivered twice is only counted once.',
          intuition: [
            { title: 'The local database is the source of truth for the UI', body: 'The app reads and writes a local store (SQLite or IndexedDB) instantly. The UI never waits for the network.' },
            { title: 'Every change is also queued', body: 'Alongside the local write, the app appends a mutation to an outbox table, for example { id, op: "createNote", payload }.' },
            { title: 'A sync worker drains the queue', body: 'When the device is online, a worker sends mutations in order and deletes each one only after the server confirms it.' },
            { title: 'Retries must be safe', body: 'Networks fail after the server has already saved a change. Sending an idempotency key lets the server recognise a retry and ignore the duplicate.' },
            { title: 'Back off when failing', body: 'Exponential backoff with jitter prevents a thousand phones from hammering a recovering server at the same moment.' },
          ],
          callouts: [
            {
              kind: 'architecture',
              title: 'Outbox pattern',
              body: 'The UI talks only to the local store. Sync is a background concern.',
              flow: ['UI', 'Local DB + Outbox (one transaction)', 'Sync Worker', 'API (idempotent)', 'Server DB'],
            },
            {
              kind: 'warning',
              title: 'Conflicts are a product decision',
              body: 'Last-write-wins is simple but loses data. For collaborative data, consider per-field merges or CRDTs.',
            },
          ],
          code: {
            basic: {
              language: 'ts',
              filename: 'outbox.ts',
              explanation: 'Write locally and enqueue together. The UI updates instantly.',
              code: `type Mutation = { id: string; op: 'createNote'; payload: { title: string }; tries: number };

const outbox: Mutation[] = [];
const notes: { id: string; title: string }[] = [];

export function createNote(title: string) {
  const id = crypto.randomUUID();
  notes.push({ id, title });                                   // 1. local write
  outbox.push({ id, op: 'createNote', payload: { title }, tries: 0 }); // 2. enqueue
  return id;
}`,
            },
            production: {
              language: 'ts',
              filename: 'syncWorker.ts',
              explanation: 'Drain in order, use the mutation id as the idempotency key, back off with jitter, and stop retrying permanent 4xx errors.',
              code: `const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function drainOutbox(db: OutboxStore, signal: AbortSignal) {
  while (!signal.aborted) {
    const next = await db.peekOldest();
    if (!next) return;                            // queue empty

    try {
      const res = await fetch('/api/mutations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': next.id,             // server dedupes retries
        },
        body: JSON.stringify({ op: next.op, payload: next.payload }),
        signal,
      });

      if (res.ok) { await db.remove(next.id); continue; }
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        await db.moveToDeadLetter(next, res.status); // will never succeed
        continue;
      }
      throw new Error('retryable ' + res.status);
    } catch {
      const tries = await db.incrementTries(next.id);
      const base = Math.min(30_000, 500 * 2 ** tries);
      await sleep(base / 2 + Math.random() * (base / 2)); // jittered backoff
    }
  }
}`,
            },
            bug: {
              explanation:
                'Without an idempotency key, a request that timed out after the server saved it gets replayed and creates a duplicate. The server must store processed keys and return the original result for repeats.',
              buggy: {
                language: 'ts',
                filename: 'api/mutations.ts',
                code: `// ❌ Every retry creates another row
app.post('/api/mutations', async (req, res) => {
  const note = await db.notes.insert(req.body.payload);
  res.json(note);
});`,
              },
              fixed: {
                language: 'ts',
                filename: 'api/mutations.ts',
                code: `// ✅ Same key → same result, exactly one row
app.post('/api/mutations', async (req, res) => {
  const key = req.header('Idempotency-Key');
  if (!key) return res.status(400).json({ error: 'Idempotency-Key required' });

  const seen = await db.idempotency.find(key);
  if (seen) return res.json(seen.response);

  const note = await db.tx(async (tx) => {
    const n = await tx.notes.insert(req.body.payload);
    await tx.idempotency.insert({ key, response: n }); // unique(key)
    return n;
  });
  res.json(note);
});`,
              },
            },
          },
          takeaways: ['UI reads and writes local first.', 'Queue mutations in the same transaction.', 'Idempotency keys plus jittered backoff make retries safe.'],
          labId: 'app-architecture',
        },
      ],
      planned: ['Conflict Resolution & CRDTs', 'Background Sync on iOS/Android', 'Designing Mobile-Friendly APIs'],
    },
  ],
};
