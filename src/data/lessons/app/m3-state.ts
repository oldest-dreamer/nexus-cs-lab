import type { Module } from '../../types';

const raw = String.raw;

export const stateModule: Module = {
  id: 'app-state',
  title: 'Mobile State Architecture',
  level: 'Beginner',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'app-unidirectional-state',
      title: 'State Layers: UI State, Domain State & Server Cache with Unidirectional Flow',
      summary: 'Split app state into three layers with different owners and lifetimes, and move every change through one predictable path: action → reducer/store → view.',
      difficulty: 'Beginner',
      minutes: 20,
      xp: 90,
      analogy:
        "State is a river that only flows downhill. The view never reaches back up to change the water; it drops a message (an action) in at the top, and a single gatekeeper (the reducer) decides the new flow. Different things float on that river: a paper boat you are playing with right now (UI state: is the sheet open?), the cargo that matters to the business (domain state: the cart), and a reflection of the shore that may already be out of date (the server cache: the product catalog).",
      intuition: [
        { title: 'Three layers, three owners', body: "UI state belongs to one screen or component (open sheet, selected tab, text being typed). Domain state is the app's own truth (cart contents, unsent drafts, settings). Server cache is a copy of data the server owns (products, profile), which can be stale and must be refetched." },
        { title: 'Keep each layer in the right tool', body: "UI state: `useState`/`useReducer` close to where it is used. Domain state: a small store (reducer, Zustand, Redux Toolkit) that is persisted when it must survive restarts. Server cache: a query cache (TanStack Query, Apollo, RTK Query) with keys, staleness and refetching." },
        { title: 'Unidirectional data flow', body: "Views read state and dispatch actions; only reducers/store actions change state; the new state flows down as props or selectors. Every change has a single entry point, so it can be logged, replayed, persisted and tested." },
        { title: 'Reducers are pure', body: "`(state, action) => newState` with no side effects and no mutation. Side effects (network, storage, haptics) live in thunks, effects or the sync engine, triggered by actions." },
        { title: 'Select narrowly', body: "Components subscribe to the smallest slice they need (`useStore(s => s.cart.count)`). A change elsewhere in the store then does not re-render them, which matters on low-end phones." },
        { title: 'Never mutate', body: "Mutating an array in place keeps the same reference, so React and selector-based stores think nothing changed and the UI does not update. Return new objects for changed branches." },
      ],
      callouts: [
        { kind: 'architecture', title: 'One-way loop', body: 'Every change enters through dispatch; views only read.', flow: ['View (renders selected state)', 'dispatch(action)', 'reducer / store action (pure)', 'new immutable state', 'selectors notify only affected views'] },
        { kind: 'tip', title: 'Use the lab', body: 'The React Re-Render X-Ray below shows how state changes flow down the tree and which components re-render. The same rules apply in React Native: the renderer differs, React does not.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'store_from_scratch.ts',
          explanation: 'Runnable TypeScript: a minimal store with pure reducers, selector subscriptions that only notify when the selected slice changes, middleware that records every action (for logging/replay), and separate UI, domain and server-cache slices. Mutation vs immutable update is shown by reference equality. All asserted.',
          code: raw`//  UNIDIRECTIONAL FLOW
//
//   [view] --dispatch(action)--> [middleware log] --> [reducer (pure)] --> new state
//     ^                                                                       |
//     +---------------- selector(state) changed? notify subscriber -----------+
//   state = { ui: { sheetOpen }, domain: { cart }, server: { products, fetchedAt } }
import assert from 'node:assert/strict';

type State = {
  ui: { sheetOpen: boolean };
  domain: { cart: Array<{ sku: string; qty: number }> };
  server: { products: Record<string, number>; fetchedAt: number };
};
type Action =
  | { type: 'ui/sheet'; open: boolean }
  | { type: 'cart/add'; sku: string }
  | { type: 'server/products'; products: Record<string, number>; at: number };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'ui/sheet': return { ...s, ui: { sheetOpen: a.open } };
    case 'cart/add': {
      const existing = s.domain.cart.find((i) => i.sku === a.sku);
      const cart = existing
        ? s.domain.cart.map((i) => (i.sku === a.sku ? { ...i, qty: i.qty + 1 } : i))   // new objects only where changed
        : [...s.domain.cart, { sku: a.sku, qty: 1 }];
      return { ...s, domain: { cart } };
    }
    case 'server/products': return { ...s, server: { products: a.products, fetchedAt: a.at } };
  }
}

function createStore(initial: State) {
  let state = initial;
  const log: string[] = [];
  const subs: Array<() => void> = [];
  return {
    get: () => state,
    dispatch(a: Action) { log.push(a.type); state = reducer(state, a); subs.forEach((f) => f()); },
    select<T>(selector: (s: State) => T, onChange: (v: T) => void) {
      let last = selector(state);
      subs.push(() => { const next = selector(state); if (!Object.is(next, last)) { last = next; onChange(next); } });
    },
    log,
  };
}

const store = createStore({ ui: { sheetOpen: false }, domain: { cart: [] }, server: { products: {}, fetchedAt: 0 } });
let cartRenders = 0, sheetRenders = 0;
store.select((s) => s.domain.cart, () => cartRenders++);
store.select((s) => s.ui.sheetOpen, () => sheetRenders++);

store.dispatch({ type: 'cart/add', sku: 'A-1' });
store.dispatch({ type: 'cart/add', sku: 'A-1' });
store.dispatch({ type: 'ui/sheet', open: true });
store.dispatch({ type: 'server/products', products: { 'A-1': 1500 }, at: 1000 });
assert.deepEqual(store.get().domain.cart, [{ sku: 'A-1', qty: 2 }]);
assert.equal(cartRenders, 2);                                     // only cart changes re-render the cart view
assert.equal(sheetRenders, 1);
assert.deepEqual(store.log, ['cart/add', 'cart/add', 'ui/sheet', 'server/products']);   // replayable history

// mutation keeps the same reference: selectors (and React) see "no change"
const before = store.get().domain.cart;
before.push({ sku: 'B-2', qty: 1 });                              // the bug from Tab 3
assert.ok(Object.is(store.get().domain.cart, before));            // same reference -> no notification possible
const total = (s: State) => s.domain.cart.reduce((n, i) => n + i.qty * (s.server.products[i.sku] ?? 0), 0);
assert.equal(total(store.get()), 3000);                           // derived values are computed, not stored
console.log('cart renders', cartRenders, '| sheet renders', sheetRenders, '| actions', store.log.join(', '));`,
        },
        production: {
          language: 'tsx',
          filename: 'stores.tsx',
          explanation: 'Production React Native layering: a Zustand store for domain state (cart) persisted to MMKV, plain useState for screen-local UI state, TanStack Query for the server-owned catalog, and narrow selectors so a cart change re-renders only what shows the cart.',
          code: raw`import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useQuery } from '@tanstack/react-query';
import { MMKV } from 'react-native-mmkv';

const mmkv = new MMKV({ id: 'domain' });

// ---------- domain state: owned by the app, survives restarts
type CartItem = { sku: string; qty: number };
type CartStore = { items: CartItem[]; add: (sku: string) => void; clear: () => void };

export const useCart = create<CartStore>()(persist((set) => ({
  items: [],
  add: (sku) => set((s) => {                                   // immutable update inside the store action
    const found = s.items.find((i) => i.sku === sku);
    return { items: found ? s.items.map((i) => (i.sku === sku ? { ...i, qty: i.qty + 1 } : i)) : [...s.items, { sku, qty: 1 }] };
  }),
  clear: () => set({ items: [] }),
}), {
  name: 'cart',
  version: 1,                                                  // bump + migrate when the shape changes
  storage: createJSONStorage(() => ({
    getItem: (k) => mmkv.getString(k) ?? null,
    setItem: (k, v) => mmkv.set(k, v),
    removeItem: (k) => mmkv.delete(k),
  })),
}));

// ---------- server cache: owned by the server, refetched when stale
type Product = { sku: string; name: string; priceCents: number };
const useProducts = () => useQuery({
  queryKey: ['products'],
  queryFn: async (): Promise<Product[]> => (await fetch('https://api.example.com/products')).json(),
  staleTime: 5 * 60_000,
});

// ---------- views read narrowly and dispatch actions
function CartBadge() {
  const count = useCart((s) => s.items.reduce((n, i) => n + i.qty, 0));   // re-renders only when the count changes
  return <Text accessibilityLabel={count + ' items in cart'}>{count}</Text>;
}

export function ProductScreen() {
  const [detailsOpen, setDetailsOpen] = useState(false);        // UI state: local to this screen
  const add = useCart((s) => s.add);                             // stable action reference
  const products = useProducts();
  if (products.isPending) return <Text>Loading…</Text>;
  if (products.isError) return <Text>Could not load products</Text>;
  return (
    <View>
      <CartBadge />
      {products.data.map((p) => (
        <Pressable key={p.sku} onPress={() => add(p.sku)} style={{ minHeight: 48 }}>
          <Text>{p.name}</Text>
        </Pressable>
      ))}
      <Pressable onPress={() => setDetailsOpen((o) => !o)}><Text>{detailsOpen ? 'Hide' : 'Show'} details</Text></Pressable>
    </View>
  );
}`,
        },
        bug: {
          explanation:
            'push() mutates the existing array, so the store\'s state keeps the same reference. React and selector-based stores compare references to decide whether to re-render, conclude nothing changed, and the cart badge stays at its old value until something unrelated forces a render. Return a new array (and new objects for changed items).',
          buggy: {
            language: 'ts',
            filename: 'cartStore.ts',
            code: raw`// ❌ In-place mutation: same reference, subscribers never notified
export const useCart = create<CartStore>()((set, get) => ({
  items: [],
  add: (sku) => {
    get().items.push({ sku, qty: 1 });      // mutates the current state
    set({ items: get().items });            // same array reference -> no re-render
  },
}));`,
          },
          fixed: {
            language: 'ts',
            filename: 'cartStore.ts',
            code: raw`// ✅ New array, new objects for changed items
export const useCart = create<CartStore>()((set) => ({
  items: [],
  add: (sku) => set((s) => ({
    items: s.items.some((i) => i.sku === sku)
      ? s.items.map((i) => (i.sku === sku ? { ...i, qty: i.qty + 1 } : i))
      : [...s.items, { sku, qty: 1 }],
  })),
}));`,
          },
        },
      },
      takeaways: [
        'Separate UI state (screen-local), domain state (app-owned, often persisted) and server cache (server-owned, refetched).',
        'Changes flow one way: dispatch → pure reducer/store action → new immutable state → selected views.',
        'Subscribe to narrow slices so unrelated changes do not re-render a screen.',
        'Never mutate state in place; derive computed values instead of storing them.',
        'Practice drill: in Tab 1, add a "cart/remove" action and assert that removing the last unit deletes the line and notifies only the cart subscriber.',
      ],
      labId: 'web-internals',
      labMode: 'react',
    },

    // ------------------------------------------------------------------------
    {
      id: 'app-server-cache-reactive',
      title: 'Server Cache & Reactive Streams on Mobile: Focus, Connectivity & Subscriptions',
      summary: 'Treat server data as a cache that knows when it is stale, refetch on app focus and reconnection, and compose event streams (connectivity, location, sockets) without leaking subscriptions.',
      difficulty: 'Intermediate',
      minutes: 22,
      xp: 110,
      analogy:
        "The server cache is the newspaper on your kitchen table: useful immediately, but you check the date before trusting the headline. Coming back into the kitchen (app focus) or the delivery van reappearing (reconnect) are natural moments to grab a fresh copy. Reactive streams are subscriptions to a radio channel: you tune in when you enter the room and must remember to switch the radio off when you leave.",
      intuition: [
        { title: 'Server data is a cache', body: "Each query has a key (`['order', id]`), data, an updatedAt time and a `staleTime`. Fresh data is served instantly; stale data is shown immediately and refetched in the background (stale-while-revalidate)." },
        { title: 'Mobile refetch triggers', body: "Browsers have window focus events; mobile apps have AppState (`active`) and connectivity (NetInfo). Wire them into the query library so data refreshes when the user returns to the app or regains a connection, and pauses while offline." },
        { title: 'Don\'t copy server data into local state', body: "`const [items, setItems] = useState(query.data)` freezes the first value: later refetches never reach the screen. Read `query.data` directly, and keep only genuinely local edits in local state." },
        { title: 'Reactive streams', body: "Connectivity, sensors, WebSocket messages and database change notifications are streams of values over time. Operators such as `map`, `filter`, `distinctUntilChanged` and `debounce` turn noisy streams into meaningful UI updates." },
        { title: 'Every subscription needs an unsubscribe', body: "Subscribe in an effect and unsubscribe in its cleanup. A forgotten listener keeps running after the screen is gone: wasted battery, memory leaks and state updates on unmounted components." },
        { title: 'Invalidate after mutations', body: "After a successful write, invalidate (or update) the affected query keys so every screen showing that data refetches; combine with optimistic updates for instant feedback (Module 5)." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Query cache on mobile', body: 'Device events drive refetching; screens just read.', flow: ['screen mounts → useQuery(key)', 'cache hit: show data (fresh or stale)', 'stale → background refetch', 'AppState active / NetInfo online → refetch stale queries', 'mutation success → invalidate keys'] },
        { kind: 'tip', title: 'Persist the query cache', body: 'Persisting the cache to disk (for example with a persister backed by MMKV) gives instant cold starts and useful offline screens: show the last known data with an "updated 2 h ago" label while refetching.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'query_cache_and_streams.ts',
          explanation: 'Runnable TypeScript with a virtual clock: a tiny stream implementation (map, filter, distinctUntilChanged, debounce, unsubscribe) and a query cache with staleTime that refetches only stale queries on app focus and on reconnect, and pauses while offline. All asserted.',
          code: raw`//  CONNECTIVITY STREAM -> UI
//
//   raw:      online online offline offline online (flapping in a tunnel)
//   distinct: online        offline         online
//   debounce(2s): only states that held for 2 s reach the banner
//   app focus / reconnect --> refetch queries whose age > staleTime
import assert from 'node:assert/strict';

type Listener<T> = (v: T) => void;
class Stream<T> {
  private ls = new Set<Listener<T>>();
  emit(v: T) { this.ls.forEach((l) => l(v)); }
  subscribe(l: Listener<T>) { this.ls.add(l); return () => { this.ls.delete(l); }; }
  get listenerCount() { return this.ls.size; }
  pipe<U>(op: (src: Stream<T>, out: Stream<U>) => void): Stream<U> { const out = new Stream<U>(); op(this, out); return out; }
}
const map = <T, U>(f: (v: T) => U) => (src: Stream<T>, out: Stream<U>) => { src.subscribe((v) => out.emit(f(v))); };
const distinct = <T,>() => (src: Stream<T>, out: Stream<T>) => { let has = false, last: T; src.subscribe((v) => { if (!has || !Object.is(v, last)) { has = true; last = v; out.emit(v); } }); };

// virtual clock for debounce
let now = 0; const timers: Array<{ at: number; fn: () => void; id: number }> = []; let nextId = 1;
const setT = (fn: () => void, ms: number) => { const id = nextId++; timers.push({ at: now + ms, fn, id }); return id; };
const clearT = (id: number) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); };
const advance = (ms: number) => { const end = now + ms; for (;;) { timers.sort((a, b) => a.at - b.at); const t = timers[0]; if (!t || t.at > end) break; timers.shift(); now = t.at; t.fn(); } now = end; };
const debounce = <T,>(ms: number) => (src: Stream<T>, out: Stream<T>) => { let id = 0; src.subscribe((v) => { clearT(id); id = setT(() => out.emit(v), ms); }); };

const netInfo = new Stream<{ isConnected: boolean }>();
const banner: string[] = [];
const ui = netInfo.pipe(map((s): string => (s.isConnected ? 'online' : 'offline'))).pipe(distinct<string>()).pipe(debounce<string>(2000));
const unsubscribe = ui.subscribe((s) => banner.push(s));
for (const c of [true, true, false, false, true]) { netInfo.emit({ isConnected: c }); advance(500); }   // flapping
advance(2000);
assert.deepEqual(banner, ['online']);                     // flapping never reached the UI; final state did
netInfo.emit({ isConnected: false }); advance(2500);
assert.deepEqual(banner, ['online', 'offline']);
unsubscribe();
assert.equal(ui.listenerCount, 0);                        // cleaned up on unmount

// query cache with staleTime and mobile refetch triggers
type Entry = { data: string; updatedAt: number; staleTime: number };
const cache = new Map<string, Entry>();
let fetches: string[] = [], online = true;
const fetchQuery = (key: string, staleTime: number) => { fetches.push(key); cache.set(key, { data: key + '@' + now, updatedAt: now, staleTime }); };
const refetchStale = () => { if (!online) return; for (const [k, e] of cache) if (now - e.updatedAt > e.staleTime) fetchQuery(k, e.staleTime); };

now = 0; fetchQuery('products', 300_000); fetchQuery('profile', 60_000); fetches = [];
now = 120_000; refetchStale();                           // AppState -> active after 2 minutes
assert.deepEqual(fetches, ['profile']);                   // products still fresh
online = false; now = 400_000; refetchStale();
assert.deepEqual(fetches, ['profile']);                   // paused while offline
online = true; refetchStale();                            // NetInfo -> online
assert.deepEqual(fetches, ['profile', 'products', 'profile']);
console.log('banner:', banner.join(' -> '), '| refetches:', fetches.join(', '));`,
        },
        production: {
          language: 'tsx',
          filename: 'queryClient.tsx',
          explanation: 'Production TanStack Query in React Native: focusManager driven by AppState, onlineManager driven by NetInfo (queries pause offline and resume on reconnect), sensible staleTime and retry defaults, and a NetInfo subscription in an effect with cleanup for an offline banner.',
          code: raw`import { useEffect, useState, type ReactNode } from 'react';
import { AppState, Platform, Text, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';

// 1) "window focus" on mobile = AppState becoming active
focusManager.setEventListener((handleFocus) => {
  const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
    if (Platform.OS !== 'web') handleFocus(s === 'active');
  });
  return () => sub.remove();
});

// 2) online/offline from NetInfo: queries pause offline and refetch on reconnect
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(!!state.isConnected)),   // returns the unsubscribe fn
);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,                                 // fresh for a minute: no refetch storm on every mount
      gcTime: 24 * 60 * 60_000,                          // keep unused data for offline screens
      retry: (count, err) => count < 3 && !String(err).includes('HTTP 4'),   // don't retry client errors
    },
  },
});

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((s) => setOffline(s.isConnected === false));
    return unsubscribe;                                  // cleanup: no leaked listener after unmount
  }, []);
  return offline ? <Text accessibilityRole="alert">You're offline. Changes will sync later.</Text> : null;
}

export function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}><OfflineBanner />{children}</QueryClientProvider>;
}`,
        },
        bug: {
          explanation:
            'Copying query.data into useState captures only the first value: when the query refetches on focus or reconnect, the screen keeps rendering the stale copy, and it is also empty on the first render while loading. Render query data directly and keep only real local edits in state.',
          buggy: {
            language: 'tsx',
            filename: 'OrdersScreen.tsx',
            code: raw`// ❌ Frozen snapshot: background refetches never reach the UI
export function OrdersScreen() {
  const query = useQuery({ queryKey: ['orders'], queryFn: fetchOrders });
  const [orders, setOrders] = useState(query.data ?? []);   // initialised once, never updated
  return <OrderList data={orders} />;
}`,
          },
          fixed: {
            language: 'tsx',
            filename: 'OrdersScreen.tsx',
            code: raw`// ✅ Read the cache directly; derive what you need during render
export function OrdersScreen() {
  const { data = [], isPending, refetch, isRefetching } = useQuery({ queryKey: ['orders'], queryFn: fetchOrders });
  const open = data.filter((o) => o.status === 'open');      // derived, never stored
  if (isPending) return <Spinner />;
  return <OrderList data={open} refreshing={isRefetching} onRefresh={refetch} />;
}`,
          },
        },
      },
      takeaways: [
        'Server data is a cache with keys, staleTime and background refetching.',
        'On mobile, wire refetching to AppState (focus) and NetInfo (connectivity).',
        'Never copy query data into local state; derive during render.',
        'Streams need operators to tame noise and an unsubscribe for every subscribe.',
        'Practice drill: in Tab 1, change the debounce to 500 ms and predict the banner sequence for the same flapping input before running it.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'app-state-restoration',
      title: 'Restoring Navigation & Form State After Process Death',
      summary: 'Persist small, versioned snapshots of where the user was and what they were typing, validate them on cold start, and never let a stale or incompatible snapshot crash the app.',
      difficulty: 'Intermediate',
      minutes: 20,
      xp: 110,
      analogy:
        "State restoration is a bookmark plus a sticky note. The bookmark (navigation state) remembers the page; the sticky note (form draft) remembers what you were writing in the margin. If the book was reprinted with different page numbers (an app update), a sensible reader checks that the bookmarked page still exists before jumping to it, rather than opening to a blank page.",
      intuition: [
        { title: 'What to restore', body: "The navigation stack (which screen, with which ids), in-progress form drafts, scroll positions for long lists, and selected tabs or filters. Do not restore transient UI (open menus, toasts) or anything sensitive without re-authentication." },
        { title: 'Snapshots, not object graphs', body: "Persist plain JSON with ids and primitive values, plus a schema version and the time it was saved. Data itself is reloaded from the cache/database by id after restore." },
        { title: 'Version and validate', body: "App updates rename or remove screens and fields. On restore, check the version, migrate older snapshots if you can, verify every route still exists and params still validate, and otherwise fall back to the home screen." },
        { title: 'Expire old snapshots', body: "Returning to a half-finished checkout from three weeks ago is confusing and may involve stale prices. Restore navigation only if the snapshot is recent (for example under 24 hours), but keep drafts longer." },
        { title: 'Deep links win', body: "If the app was opened from a notification or link, that intent must override the saved navigation state; restoring the old stack instead would ignore what the user just tapped." },
        { title: 'Platform helpers exist', body: "Android offers saved-instance state (`rememberSaveable`, `SavedStateHandle`) and iOS has scene-based state restoration. In React Native the usual approach is persisting the navigation state yourself with `initialState`/`onStateChange`." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Cold start restore', body: 'Every snapshot is validated before it is used.', flow: ['cold start', 'opened via deep link? → use the link', 'read snapshot (MMKV)', 'version ok / migrate? routes exist? fresh?', 'restore nav + drafts', 'otherwise → home'] },
        { kind: 'warning', title: 'Restoration must never crash', body: 'Wrap restore logic in try/catch and treat any problem as "no snapshot". A crash at launch caused by a bad snapshot repeats on every launch until the user reinstalls.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'restore_from_scratch.ts',
          explanation: 'Runnable TypeScript: versioned snapshots of navigation and drafts, a v1 → v2 migration for a renamed route, validation against the current route table and param rules, expiry of stale navigation (drafts kept), deep-link precedence, and crash-proof parsing. All asserted.',
          code: raw`//  RESTORE DECISION
//
//   snapshot --parse ok?--> version 1? --migrate--> v2 --routes exist + params valid?--> fresh (< 24 h)?
//       |no                                              |no                                 |no
//       +--> home                                        +--> home (keep drafts)            +--> home (keep drafts)
//   launched from a deep link? -> the link always wins
import assert from 'node:assert/strict';

type Route = { name: string; params?: Record<string, string> };
type SnapshotV2 = { v: 2; savedAt: number; nav: Route[]; drafts: Record<string, string> };
const ROUTES: Record<string, (p?: Record<string, string>) => boolean> = {   // current app version
  Home: () => true,
  OrderDetail: (p) => /^\d+$/.test(p?.id ?? ''),
  Compose: () => true,
};
const DAY = 86_400_000;

function migrate(raw: unknown): SnapshotV2 | null {
  const s = raw as { v?: number; savedAt?: number; nav?: Route[]; stack?: Route[]; drafts?: Record<string, string> };
  if (s?.v === 2) return s as SnapshotV2;
  if (s?.v === 1 && Array.isArray(s.stack)) {             // v1 called the stack "stack" and had "Order" screens
    return { v: 2, savedAt: s.savedAt ?? 0, drafts: s.drafts ?? {},
             nav: s.stack.map((r) => (r.name === 'Order' ? { ...r, name: 'OrderDetail' } : r)) };
  }
  return null;
}

function restore(json: string | undefined, now: number, deepLink?: Route[]) {
  let snap: SnapshotV2 | null = null;
  try { snap = json ? migrate(JSON.parse(json)) : null; } catch { snap = null; }     // never crash at launch
  const drafts = snap?.drafts ?? {};
  if (deepLink) return { nav: deepLink, drafts };
  const valid = !!snap && snap.nav.every((r) => ROUTES[r.name]?.(r.params) === true);
  const fresh = !!snap && now - snap.savedAt < DAY;
  return { nav: valid && fresh ? snap!.nav : [{ name: 'Home' }], drafts };
}

const now = 10 * DAY;
const good: SnapshotV2 = { v: 2, savedAt: now - 3_600_000, nav: [{ name: 'Home' }, { name: 'OrderDetail', params: { id: '42' } }], drafts: { 'compose:42': 'Where is my parcel?' } };
assert.deepEqual(restore(JSON.stringify(good), now).nav.at(-1), { name: 'OrderDetail', params: { id: '42' } });

const v1 = { v: 1, savedAt: now - 1000, stack: [{ name: 'Home' }, { name: 'Order', params: { id: '7' } }] };
assert.deepEqual(restore(JSON.stringify(v1), now).nav.at(-1), { name: 'OrderDetail', params: { id: '7' } });   // migrated

const removedScreen = { ...good, nav: [{ name: 'Home' }, { name: 'LegacyWallet' }] };
assert.deepEqual(restore(JSON.stringify(removedScreen), now).nav, [{ name: 'Home' }]);
const badParams = { ...good, nav: [{ name: 'OrderDetail', params: { id: 'abc' } }] };
assert.deepEqual(restore(JSON.stringify(badParams), now).nav, [{ name: 'Home' }]);

const old = restore(JSON.stringify({ ...good, savedAt: now - 2 * DAY }), now);
assert.deepEqual(old.nav, [{ name: 'Home' }]);
assert.equal(old.drafts['compose:42'], 'Where is my parcel?');     // drafts outlive navigation

assert.deepEqual(restore('{corrupted', now).nav, [{ name: 'Home' }]);
const link = [{ name: 'Home' }, { name: 'OrderDetail', params: { id: '99' } }];
assert.deepEqual(restore(JSON.stringify(good), now, link).nav, link);   // deep link wins
console.log('restored:', restore(JSON.stringify(good), now).nav.map((r) => r.name).join(' > '));`,
        },
        production: {
          language: 'tsx',
          filename: 'App.tsx',
          explanation: 'Production React Navigation state persistence: the navigation state is saved to MMKV on every change with a schema version and timestamp, restored synchronously at launch only when it is recent, valid for the current route table and the app was not opened by a deep link; restore errors fall back to the default state.',
          code: raw`import { useState } from 'react';
import { Linking, Text } from 'react-native';
import { NavigationContainer, type NavigationState } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV({ id: 'nav' });
const KEY = 'nav-state';
const VERSION = 3;                                           // bump when screens are renamed/removed
const MAX_AGE_MS = 24 * 60 * 60_000;
const SCREENS = ['Home', 'OrderDetail', 'Compose'] as const;

type Saved = { v: number; savedAt: number; state: NavigationState };

function routesAreValid(state: NavigationState | undefined): boolean {
  if (!state) return true;
  return state.routes.every((r) => (SCREENS as readonly string[]).includes(r.name) &&
    routesAreValid(r.state as NavigationState | undefined));   // nested navigators too
}

function readSnapshot(): NavigationState | undefined {
  try {
    const raw = storage.getString(KEY);
    if (!raw) return undefined;
    const saved = JSON.parse(raw) as Saved;
    if (saved.v !== VERSION || Date.now() - saved.savedAt > MAX_AGE_MS) return undefined;
    return routesAreValid(saved.state) ? saved.state : undefined;
  } catch {
    return undefined;                                        // a bad snapshot must never crash launch
  }
}

const Stack = createNativeStackNavigator();
function Home() { return <Text>Home</Text>; }
function OrderDetail() { return <Text>Order</Text>; }
function Compose() { return <Text>Compose</Text>; }

export default function App({ launchedFromLink }: { launchedFromLink: boolean }) {
  // MMKV is synchronous, so the snapshot is ready before the first render (no splash flicker)
  const [initialState] = useState(() => (launchedFromLink ? undefined : readSnapshot()));
  return (
    <NavigationContainer
      initialState={initialState}
      onStateChange={(state) => {
        if (state) storage.set(KEY, JSON.stringify({ v: VERSION, savedAt: Date.now(), state } satisfies Saved));
      }}
      linking={{ prefixes: ['myapp://'], getInitialURL: () => Linking.getInitialURL() }}
    >
      <Stack.Navigator>
        <Stack.Screen name="Home" component={Home} />
        <Stack.Screen name="OrderDetail" component={OrderDetail} />
        <Stack.Screen name="Compose" component={Compose} options={{ presentation: 'modal' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}`,
        },
        bug: {
          explanation:
            'The persisted state from the previous app version is restored blindly. After an update that renamed "Order" to "OrderDetail", the navigator receives a route it does not know: users land on a broken or blank screen (or crash) on every launch until they reinstall. Version the snapshot, validate routes and fall back to the default state on any problem.',
          buggy: {
            language: 'tsx',
            filename: 'App.tsx',
            code: raw`// ❌ Whatever was saved, by whatever app version, is fed straight to the navigator
export default function App() {
  const saved = storage.getString('nav-state');
  const initialState = saved ? JSON.parse(saved) : undefined;   // may contain removed screens, may throw
  return (
    <NavigationContainer initialState={initialState}
      onStateChange={(s) => storage.set('nav-state', JSON.stringify(s))}>
      <RootStack />
    </NavigationContainer>
  );
}`,
          },
          fixed: {
            language: 'tsx',
            filename: 'App.tsx',
            code: raw`// ✅ Versioned, validated, crash-proof, and skipped when launched from a deep link
export default function App({ launchedFromLink }: { launchedFromLink: boolean }) {
  const [initialState] = useState(() => (launchedFromLink ? undefined : readSnapshot()));   // undefined on any doubt
  return (
    <NavigationContainer initialState={initialState}
      onStateChange={(s) => s && storage.set('nav-state',
        JSON.stringify({ v: VERSION, savedAt: Date.now(), state: s }))}>
      <RootStack />
    </NavigationContainer>
  );
}`,
          },
        },
      },
      takeaways: [
        'Persist small JSON snapshots (ids, primitives) of navigation and drafts, with a version and timestamp.',
        'Validate on restore: version/migrate, routes exist, params valid, snapshot fresh; otherwise go home.',
        'Deep links override restored navigation; drafts can outlive navigation snapshots.',
        'Restoration code must never crash the app.',
        'Practice drill: add a v2 → v3 migration in Tab 1 that renames the "Compose" screen to "NewMessage", update ROUTES, and assert an old v2 snapshot still restores correctly.',
      ],
    },
  ],
};
