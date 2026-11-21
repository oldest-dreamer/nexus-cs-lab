import type { Module } from '../../types';

const raw = String.raw;

export const networkingModule: Module = {
  id: 'app-networking',
  title: 'Resilient Mobile Networking',
  level: 'Intermediate',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'app-flaky-network-retries',
      title: 'Surviving Flaky Networks: Timeouts, Exponential Backoff with Jitter & 503s',
      summary: 'Mobile networks drop, stall and lie about being connected. Classify failures, set timeouts, retry only what is safe, back off exponentially with jitter, honour Retry-After, and stop hammering a server that is down.',
      difficulty: 'Intermediate',
      minutes: 22,
      xp: 130,
      analogy:
        "Calling a busy helpline: if you hang up and redial instantly, forever, you only make the queue longer, and so does everyone else doing the same. Sensible callers wait a little longer after each failed attempt, add a random pause so they don't all redial at the same second, respect \"please call back in 5 minutes\", and give up after a few tries. A circuit breaker is deciding not to call at all for a while once the line has failed repeatedly.",
      intuition: [
        { title: 'Mobile failure modes', body: "Tunnels and lifts drop the connection mid-request; captive Wi-Fi portals report \"connected\" with no internet; 3G has seconds of latency; the OS suspends sockets when the app backgrounds. A request can hang far longer than any user will wait, so every request needs a timeout." },
        { title: 'Classify before retrying', body: "Retry network errors, timeouts, 408, 429 and 5xx (500, 502, 503, 504). Never blindly retry 4xx client errors (400, 401, 403, 404, 422): the same request will fail again. Refresh auth on 401 once, then stop." },
        { title: 'Only retry safe operations', body: "GET, PUT and DELETE are idempotent; POST/PATCH are retried only with an idempotency key (Module 5). Otherwise a retry after a lost response can duplicate an order." },
        { title: 'Exponential backoff with full jitter', body: "Delay ceiling = min(cap, base × 2ⁿ), actual delay = random(0, ceiling). With base 500 ms and cap 30 s the ceilings are 0.5, 1, 2, 4, 8, 16, 30 s. Jitter spreads millions of phones out, so a recovering server is not knocked over by synchronised retries (the thundering herd)." },
        { title: 'Honour Retry-After and budgets', body: "If a 429/503 includes `Retry-After`, wait at least that long. Cap the number of attempts and the total time; surface \"still trying…\" in the UI and let the outbox finish later rather than retrying forever in the foreground." },
        { title: 'Circuit breaker', body: "After several consecutive failures to the same host, open the circuit: fail fast locally for a cool-down period, then let one probe request through (half-open). This saves battery and avoids piling load onto a struggling backend." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Retry decision for one request', body: 'Each failure goes through the same checks.', flow: ['send with timeout', 'error / status → retryable? (network, 408, 429, 5xx)', 'safe to repeat? (idempotent or has key)', 'attempts / time budget left? circuit closed?', 'wait max(Retry-After, random(0, min(cap, base·2ⁿ)))', 'retry  —  otherwise fail and leave it in the outbox'] },
        { kind: 'tip', title: 'Use the lab', body: 'In the Offline Sync lab below, switch the network between Online, Slow 3G and Offline, then raise the server 503 rate slider: the HTTP log shows each 503 followed by growing, jittered backoff delays before the outbox retries.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'retry_policy_from_scratch.ts',
          explanation: 'Runnable TypeScript with a virtual clock and a seeded random number generator: retryability classification, full-jitter backoff ceilings, Retry-After taking precedence, an attempt and time budget, and a circuit breaker that opens after consecutive failures and half-opens after a cool-down. Delays and outcomes are asserted.',
          code: raw`//  RETRY TIMELINE (base 500 ms, cap 30 s, full jitter)
//
//   attempt:   1      2        3          4            5
//   ceiling:   -    500 ms   1000 ms    2000 ms      4000 ms      delay = random(0, ceiling)
//   503 with Retry-After: 5  -> wait max(5000, jitter)
//   5 consecutive failures -> circuit OPEN (fail fast 30 s) -> HALF-OPEN (1 probe) -> CLOSED
import assert from 'node:assert/strict';

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const isRetryable = (r: { status?: number; networkError?: boolean }) => !!r.networkError || RETRYABLE.has(r.status ?? 0);
assert.deepEqual([{ status: 503 }, { status: 422 }, { networkError: true }, { status: 401 }, { status: 429 }].map(isRetryable),
  [true, false, true, false, true]);

const ceiling = (n: number, base = 500, cap = 30_000) => Math.min(cap, base * 2 ** n);
assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map((n) => ceiling(n)), [500, 1000, 2000, 4000, 8000, 16000, 30000, 30000]);

let seed = 7;
const rng = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);   // deterministic for the test
const fullJitter = (n: number) => Math.floor(rng() * ceiling(n));

type Res = { status?: number; networkError?: boolean; retryAfterSec?: number };
function runWithRetries(responses: Res[], opts = { maxAttempts: 5, budgetMs: 20_000, idempotent: true }) {
  let clock = 0, attempt = 0;
  const waits: number[] = [];
  for (;;) {
    const r = responses[Math.min(attempt, responses.length - 1)];
    attempt++;
    if (!r.networkError && r.status! < 400) return { ok: true, attempts: attempt, waits, clock };
    if (!isRetryable(r) || !opts.idempotent || attempt >= opts.maxAttempts) return { ok: false, attempts: attempt, waits, clock };
    const wait = Math.max((r.retryAfterSec ?? 0) * 1000, fullJitter(attempt - 1));
    if (clock + wait > opts.budgetMs) return { ok: false, attempts: attempt, waits, clock, reason: 'budget' };
    waits.push(wait); clock += wait;
  }
}

const recovered = runWithRetries([{ status: 503 }, { networkError: true }, { status: 200 }]);
assert.equal(recovered.ok, true);
assert.equal(recovered.attempts, 3);
assert.ok(recovered.waits[0] < 500 && recovered.waits[1] < 1000);          // each wait under its ceiling

const throttled = runWithRetries([{ status: 429, retryAfterSec: 5 }, { status: 200 }]);
assert.ok(throttled.waits[0] >= 5000);                                      // Retry-After wins over jitter

assert.deepEqual(runWithRetries([{ status: 422 }]).attempts, 1);            // never retry a validation error
assert.equal(runWithRetries([{ status: 503 }], { maxAttempts: 5, budgetMs: 20_000, idempotent: false }).attempts, 1);  // unsafe POST
assert.equal(runWithRetries([{ status: 503 }]).ok, false);                  // gives up after the cap

// circuit breaker
class Breaker {
  failures = 0; openedAt = -1;
  constructor(private threshold = 5, private coolDownMs = 30_000) {}
  canRequest(now: number) { return this.openedAt < 0 || now - this.openedAt >= this.coolDownMs; }   // half-open after cool-down
  record(ok: boolean, now: number) {
    if (ok) { this.failures = 0; this.openedAt = -1; return; }
    if (++this.failures >= this.threshold) this.openedAt = now;
  }
}
const br = new Breaker();
for (let i = 0; i < 5; i++) br.record(false, 1000);
assert.equal(br.canRequest(2000), false);                                   // open: fail fast, save battery
assert.equal(br.canRequest(31_000), true);                                  // half-open: one probe allowed
br.record(true, 31_000);
assert.equal(br.canRequest(31_001), true);                                  // closed again
console.log('waits (ms):', recovered.waits, '| retry-after wait:', throttled.waits[0]);`,
        },
        production: {
          language: 'ts',
          filename: 'http.ts',
          explanation: 'Production React Native fetch wrapper: a per-attempt timeout via AbortController (portable across Hermes versions), caller cancellation, retry only for retryable statuses on safe or idempotency-keyed requests, full-jitter backoff capped by Retry-After and a total budget, waiting for connectivity with NetInfo instead of spinning while offline.',
          code: raw`import NetInfo from '@react-native-community/netinfo';

export class HttpError extends Error { constructor(public status: number, public body: unknown) { super('HTTP ' + status); } }
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); }, { once: true });
});

function waitForConnection(signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const unsubscribe = NetInfo.addEventListener((s) => {
      if (s.isConnected && s.isInternetReachable !== false) { unsubscribe(); resolve(); }   // fires immediately with current state
    });
    signal?.addEventListener('abort', () => { unsubscribe(); reject(new Error('aborted')); }, { once: true });
  });
}

type Opts = RequestInit & { timeoutMs?: number; maxAttempts?: number; budgetMs?: number; idempotencyKey?: string };

export async function request<T>(url: string, opts: Opts = {}): Promise<T> {
  const { timeoutMs = 15_000, maxAttempts = 5, budgetMs = 45_000, idempotencyKey, signal, ...init } = opts;
  const method = (init.method ?? 'GET').toUpperCase();
  const safe = ['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS'].includes(method) || !!idempotencyKey;
  const started = Date.now();
  const headers = { ...(init.headers as Record<string, string>), ...(idempotencyKey && { 'idempotency-key': idempotencyKey }) };

  for (let attempt = 0; ; attempt++) {
    await waitForConnection(signal ?? undefined);          // don't burn attempts while offline
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    signal?.addEventListener('abort', () => ctrl.abort(), { once: true });   // caller cancellation (screen unmount)
    let status = 0, retryAfterMs = 0;
    try {
      const res = await fetch(url, { ...init, headers, signal: ctrl.signal });
      if (res.ok) return (await res.json()) as T;
      status = res.status;
      retryAfterMs = Number(res.headers.get('retry-after') ?? 0) * 1000;
      if (!RETRYABLE.has(status)) throw new HttpError(status, await res.json().catch(() => null));
    } catch (e) {
      if (e instanceof HttpError || signal?.aborted) throw e;   // permanent error or caller cancelled
      // otherwise: network error or our timeout -> retryable
    } finally {
      clearTimeout(timer);
    }
    if (!safe || attempt + 1 >= maxAttempts) throw new HttpError(status, null);
    const delay = Math.max(retryAfterMs, Math.random() * Math.min(30_000, 500 * 2 ** attempt));   // full jitter
    if (Date.now() - started + delay > budgetMs) throw new HttpError(status, null);              // let the outbox retry later
    await sleep(delay, signal ?? undefined);
  }
}`,
        },
        bug: {
          explanation:
            'The loop retries immediately, forever, on every error including 4xx: a phone in a tunnel spins the radio and CPU (battery drain), a 422 is retried endlessly, and when the backend returns 503 every client retries at the same instant, keeping it down. Retry only retryable failures, with a cap, exponential backoff and jitter.',
          buggy: {
            language: 'ts',
            filename: 'sync.ts',
            code: raw`// ❌ Tight infinite retry: battery drain + thundering herd + retries hopeless 4xx
export async function syncForever(body: string) {
  while (true) {
    try {
      const res = await fetch(API + '/sync', { method: 'POST', body });
      if (res.ok) return res.json();
    } catch {}
    // no delay, no cap, no classification
  }
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'sync.ts',
            code: raw`// ✅ Bounded, classified, jittered retries; the outbox picks it up later if this gives up
export async function sync(body: string, mutationId: string) {
  return request(API + '/sync', {
    method: 'POST', body, idempotencyKey: mutationId,     // safe to retry
    maxAttempts: 5, budgetMs: 45_000, timeoutMs: 15_000,
    headers: { 'content-type': 'application/json' },
  });
}`,
          },
        },
      },
      takeaways: [
        'Every request needs a timeout; mobile connections hang as often as they fail.',
        'Retry only network errors, 408, 429 and 5xx, and only idempotent or idempotency-keyed requests.',
        'Back off with full jitter (random(0, min(cap, base·2ⁿ))), honour Retry-After, cap attempts and total time.',
        'Wait for connectivity instead of spinning offline; open a circuit breaker after repeated failures.',
        'Practice drill: compute the ceilings for base 250 ms and cap 10 s for attempts 0–6 ([250, 500, 1000, 2000, 4000, 8000, 10000]) and the expected average wait at attempt 3 (1000 ms: half the ceiling).',
      ],
      labId: 'app-architecture',
      labMode: 'network',
    },

    // ------------------------------------------------------------------------
    {
      id: 'app-cancellation-pagination',
      title: 'Request Cancellation on Unmount & Cursor-Paginated Infinite Lists',
      summary: 'Cancel work nobody is waiting for, never let a slow old response overwrite a newer screen, and build infinite scrolling that loads each page exactly once, survives inserts and stops at the end.',
      difficulty: 'Intermediate',
      minutes: 20,
      xp: 120,
      analogy:
        "Cancelling a request on unmount is telling the kitchen \"cancel table 12, they left\" instead of cooking a meal nobody will eat and carrying it to an empty table. Cursor pagination is a bookmark: \"give me the 20 items after this one\", which still works if new items were added at the top, unlike \"give me page 3\", which shifts every time something new arrives.",
      intuition: [
        { title: 'Unmounted screens should not finish requests', body: "When the user leaves a screen, its pending requests waste data and battery, and their responses may update state that no longer exists. Pass an AbortSignal to fetch and abort it in the effect cleanup (or let the query library do it)." },
        { title: 'Races between requests', body: "Typing a search query fires several requests; responses can arrive out of order. If the response for \"rea\" arrives after \"react\", it must not replace the newer results. Abort the previous request or ignore responses that are no longer the latest." },
        { title: 'Offset pagination breaks on live feeds', body: "`?page=3` depends on what was inserted since page 1: new posts shift everything down, so the user sees duplicates (or misses items when things are deleted)." },
        { title: 'Cursor pagination', body: "The server returns `{ items, nextCursor }` where the cursor encodes the last item's sort key. The client asks for `?after=<cursor>`. Stable under inserts and efficient with an index (see the Web track's REST chapter)." },
        { title: 'onEndReached fires more than once', body: "FlatList can call onEndReached repeatedly while the user is near the end and while a page is loading. Guard with `hasNextPage && !isFetchingNextPage`, dedupe items by id, and stop when `nextCursor` is null." },
        { title: 'Refresh and memory', body: "Pull-to-refresh resets to the first page; very long sessions may keep thousands of items, so cap the number of pages kept in memory (`maxPages`) and rely on virtualisation (Module 9)." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Infinite list data flow', body: 'One request per page, cancelled if the screen goes away.', flow: ['mount → fetch first page (signal)', 'render with FlatList (virtualised)', 'onEndReached → guard (hasNext, !fetching)', 'fetch ?after=cursor (signal)', 'append + dedupe by id', 'unmount → abort in-flight request'] },
        { kind: 'tip', title: 'Show the end', body: 'When nextCursor is null, render a short "You\'re all caught up" footer so users don\'t keep pulling for content that doesn\'t exist.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'cancel_and_paginate.ts',
          explanation: 'Runnable TypeScript with real AbortController and Promises: a stale search response is ignored after a newer query, an unmounted screen\'s request is aborted, and a cursor paginator loads each page once even when onEndReached fires repeatedly, survives an insert at the top without duplicates, and stops at the end. All asserted.',
          code: raw`//  INFINITE LIST WITH CURSORS (page size 3)
//
//   GET /posts                -> [9 8 7] next=7
//   (new post 10 inserted at the top)
//   GET /posts?after=7        -> [6 5 4] next=4      no duplicates, nothing skipped
//   onEndReached x3 while loading -> still one request
//   GET /posts?after=1        -> []      next=null  -> stop
import assert from 'node:assert/strict';

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((res, rej) => {
  const t = setTimeout(res, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('Aborted', 'AbortError')); }, { once: true });
});

async function main() {
  // 1) out-of-order search responses: abort the previous request
  let shown = '';
  let current: AbortController | null = null;
  const search = async (q: string, latencyMs: number) => {
    current?.abort();                                       // cancel the older request
    const ctrl = (current = new AbortController());
    try { await sleep(latencyMs, ctrl.signal); shown = 'results for ' + q; }
    catch (e) { if ((e as Error).name !== 'AbortError') throw e; }
  };
  await Promise.all([search('rea', 50), search('react', 10)]);   // the slow, older response arrives last
  assert.equal(shown, 'results for react');

  // 2) unmount aborts the in-flight request
  let stateUpdates = 0;
  const unmountCtrl = new AbortController();
  const pending = sleep(30, unmountCtrl.signal).then(() => { stateUpdates++; }, () => 'aborted');
  unmountCtrl.abort();                                       // effect cleanup
  assert.equal(await pending, 'aborted');
  assert.equal(stateUpdates, 0);

  // 3) cursor pagination with a guard
  let posts = Array.from({ length: 9 }, (_, i) => ({ id: 9 - i }));   // newest first
  let requests = 0;
  const api = async (after: number | null) => {
    requests++;
    await sleep(5);
    const start = after === null ? 0 : posts.findIndex((p) => p.id === after) + 1;
    const items = posts.slice(start, start + 3);
    return { items, next: items.length === 3 && start + 3 < posts.length ? items[2].id : null };
  };
  const list = { items: [] as Array<{ id: number }>, cursor: null as number | null, hasNext: true, loading: false };
  const loadMore = async () => {
    if (!list.hasNext || list.loading) return;               // guard against repeated onEndReached
    list.loading = true;
    const page = await api(list.cursor);
    const seen = new Set(list.items.map((i) => i.id));
    list.items.push(...page.items.filter((i) => !seen.has(i.id)));
    list.cursor = page.next; list.hasNext = page.next !== null; list.loading = false;
  };
  await loadMore();
  posts = [{ id: 10 }, ...posts];                            // new post arrives at the top
  await Promise.all([loadMore(), loadMore(), loadMore()]);   // onEndReached fired three times
  assert.equal(requests, 2);
  assert.deepEqual(list.items.map((i) => i.id), [9, 8, 7, 6, 5, 4]);
  await loadMore(); await loadMore();
  assert.deepEqual(list.items.map((i) => i.id), [9, 8, 7, 6, 5, 4, 3, 2, 1]);
  assert.equal(list.hasNext, false);
  await loadMore();
  assert.equal(requests, 3);                                 // 3 pages; no request after the end
  console.log('search shows:', shown, '| items:', list.items.map((i) => i.id).join(','), '| requests:', requests);
}
main().catch((e) => { console.error(e); process.exit(1); });`,
        },
        production: {
          language: 'tsx',
          filename: 'Feed.tsx',
          explanation: 'Production React Native infinite feed with TanStack Query: useInfiniteQuery passes an AbortSignal (cancelled automatically when the screen unmounts or the key changes), cursor-based getNextPageParam, maxPages to bound memory, a guarded onEndReached, pull-to-refresh and an end-of-feed footer on a virtualised FlatList.',
          code: raw`import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';

type Post = { id: string; title: string };
type Page = { items: Post[]; nextCursor: string | null };

async function fetchPage(cursor: string | null, signal: AbortSignal): Promise<Page> {
  const url = 'https://api.example.com/posts?limit=20' + (cursor ? '&after=' + encodeURIComponent(cursor) : '');
  const res = await fetch(url, { signal });                 // aborted on unmount / refetch
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

export function Feed() {
  const q = useInfiniteQuery({
    queryKey: ['feed'],
    queryFn: ({ pageParam, signal }) => fetchPage(pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,             // null -> hasNextPage = false
    maxPages: 10,                                             // keep memory bounded on long sessions
  });

  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <FlatList
      data={items}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <Text style={{ padding: 16 }}>{item.title}</Text>}
      onEndReachedThreshold={0.5}                              // start loading half a screen early
      onEndReached={() => {
        if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();   // guard: one request per page
      }}
      refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={() => void q.refetch()} />}
      ListFooterComponent={
        q.isFetchingNextPage ? <ActivityIndicator style={{ margin: 16 }} />
        : !q.hasNextPage && items.length > 0 ? <View style={{ padding: 16 }}><Text>You're all caught up</Text></View>
        : undefined
      }
    />
  );
}`,
        },
        bug: {
          explanation:
            'onEndReached can fire several times while a page is loading and the request is never cancelled, so the same page is fetched repeatedly and appended twice (duplicate rows and duplicate keys), offset paging shifts when new posts arrive, and setState runs after the screen has been closed. Guard loading, use the server cursor, dedupe, and abort on unmount.',
          buggy: {
            language: 'tsx',
            filename: 'Feed.tsx',
            code: raw`// ❌ Duplicate page loads, offset drift, updates after unmount
export function Feed() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [page, setPage] = useState(1);
  const load = async () => {
    const res = await fetch(API + '/posts?page=' + page);   // no guard, no signal
    const items: Post[] = await res.json();
    setPosts((p) => [...p, ...items]);                      // same page appended more than once
    setPage((n) => n + 1);
  };
  useEffect(() => { void load(); }, []);
  return <FlatList data={posts} renderItem={renderPost} onEndReached={load} />;
}`,
          },
          fixed: {
            language: 'tsx',
            filename: 'Feed.tsx',
            code: raw`// ✅ Cursor + guard + dedupe + cancellation (or simply useInfiniteQuery)
export function Feed() {
  const [state, setState] = useState({ posts: [] as Post[], cursor: null as string | null, done: false, loading: false });
  const ctrl = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    if (state.loading || state.done) return;
    setState((s) => ({ ...s, loading: true }));
    ctrl.current = new AbortController();
    try {
      const page = await fetchPage(state.cursor, ctrl.current.signal);
      setState((s) => {
        const seen = new Set(s.posts.map((p) => p.id));
        return { posts: [...s.posts, ...page.items.filter((p) => !seen.has(p.id))],
                 cursor: page.nextCursor, done: page.nextCursor === null, loading: false };
      });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setState((s) => ({ ...s, loading: false }));
    }
  }, [state]);
  useEffect(() => { void load(); return () => ctrl.current?.abort(); }, []);   // abort on unmount
  return <FlatList data={state.posts} keyExtractor={(p) => p.id} renderItem={renderPost} onEndReached={load} />;
}`,
          },
        },
      },
      takeaways: [
        'Abort requests when their screen unmounts or a newer request supersedes them.',
        'Never let an older, slower response overwrite newer state.',
        'Paginate with server cursors; offsets duplicate and skip items on live feeds.',
        'Guard onEndReached (hasNext && !loading), dedupe by id, stop at nextCursor = null, bound pages in memory.',
        'Practice drill: in Tab 1, delete post 7 between the first and second loadMore calls and decide what the cursor-based API should return for after=7 (items after 7\'s position; your server needs a tombstone or sort-key cursor, not an id lookup).',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'app-payload-efficiency',
      title: 'Battery-Friendly Payloads: Compression, Delta Sync & Request Batching',
      summary: 'Every byte and every radio wake-up costs battery and data. Compress responses, send only the fields and changes a screen needs, revalidate instead of re-downloading, and batch background requests.',
      difficulty: 'Intermediate',
      minutes: 20,
      xp: 110,
      analogy:
        "The phone's cellular radio is a delivery van with a slow engine warm-up and cool-down: starting it for a single letter wastes far more fuel than the letter itself, and the van keeps idling for a while after every trip. Good apps pack parcels tightly (compression), only ship what changed (delta sync), and send one van with ten parcels instead of ten vans with one each (batching).",
      intuition: [
        { title: 'The radio tail', body: "After each transfer, the cellular radio stays in a high-power state for several seconds before stepping down. Ten requests spread over a minute keep it awake almost the whole time; the same ten requests sent together cost one wake-up and one tail." },
        { title: 'Compress', body: "JSON is very repetitive: gzip or Brotli typically shrink API responses 5–10×. Native networking stacks send `Accept-Encoding` and decompress automatically; make sure the server and CDN actually compress JSON, not just HTML." },
        { title: 'Send less', body: "Return only the fields a screen renders (sparse fieldsets, GraphQL, view-specific endpoints), paginate, and request appropriately sized images. A list screen does not need every order's full line items." },
        { title: 'Delta sync', body: "Instead of re-downloading the whole dataset, ask for changes since the last sync cursor (`GET /changes?since=cursor`) including tombstones for deletions. Payloads then scale with the amount of change, not the size of the data." },
        { title: 'Revalidate', body: "Use ETags: `If-None-Match` returns `304 Not Modified` with an empty body when nothing changed. Combined with a persisted cache, app launches are fast and almost free when data is unchanged." },
        { title: 'Prefer push to polling', body: "Polling every few seconds keeps the radio permanently awake. Use push notifications (or a WebSocket while the app is in the foreground) to signal that something changed, then fetch the delta. Pause polling entirely in the background." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Efficient sync request', body: 'Small, compressed, conditional, batched.', flow: ['trigger: push "something changed" / app foreground', 'GET /changes?since=cursor (Accept-Encoding: br, gzip)', 'If-None-Match → 304 when unchanged', 'apply delta + tombstones to SQLite', 'store new cursor', 'batch queued uploads in the same radio wake-up'] },
        { kind: 'tip', title: 'Measure on a real network', body: 'Use the network inspector (React Native DevTools, Android Studio Network Inspector, Charles/Proxyman) to check compressed vs uncompressed sizes, request counts per screen, and whether anything polls while the app is idle.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'payload_efficiency.ts',
          explanation: 'Runnable TypeScript with node:zlib: real gzip and Brotli compression ratios on a 500-item JSON payload, the saving from sparse fieldsets, full sync vs delta sync sizes, and a simple radio energy model comparing ten separate requests with one batch and polling with push over an hour. Ratios and model outputs are asserted.',
          code: raw`//  RADIO STATE (illustrative energy model)
//
//   separate:  |#tx#|~~~tail~~~|  |#tx#|~~~tail~~~|  ... x10    -> 10 wake-ups, 10 tails
//   batched:   |#tx##########|~~~tail~~~|                       ->  1 wake-up,   1 tail
//   payload:   500 orders JSON  --gzip-->  ~1/5 the size  --sparse fields + delta-->  a few kB
import assert from 'node:assert/strict';
import { brotliCompressSync, gzipSync } from 'node:zlib';

const orders = Array.from({ length: 500 }, (_, i) => ({
  id: 'ord_' + String(i).padStart(6, '0'), status: i % 7 === 0 ? 'pending' : 'delivered', currency: 'BDT',
  totalCents: 10_000 + (i * 137) % 50_000, createdAt: '2026-11-' + String(1 + (i % 20)).padStart(2, '0') + 'T10:00:00Z',
  customer: { id: 'cus_' + (i % 40), name: 'Customer ' + (i % 40), email: 'customer' + (i % 40) + '@example.com' },
  shippingAddress: { line1: (i % 90) + ' Lake Road', city: 'Dhaka', postcode: '1205', country: 'BD' },
}));
const full = Buffer.from(JSON.stringify(orders));
const gz = gzipSync(full), br = brotliCompressSync(full);
assert.ok(full.length / gz.length > 4, 'gzip ratio ' + (full.length / gz.length).toFixed(1));
assert.ok(br.length < gz.length, 'brotli beats gzip on JSON');

// sparse fieldsets: the list screen only needs 3 fields
const sparse = Buffer.from(JSON.stringify(orders.map(({ id, status, totalCents }) => ({ id, status, totalCents }))));
assert.ok(sparse.length < full.length / 4);

// delta sync: only 12 orders changed since the last cursor (plus 2 deletions as tombstones)
const delta = Buffer.from(JSON.stringify({ changed: orders.slice(0, 12), deleted: ['ord_000498', 'ord_000499'], cursor: 'c_9f2' }));
assert.ok(gzipSync(delta).length < gz.length / 10);

// radio energy model (illustrative constants)
const TX_J_PER_S = 1.2, TAIL_S = 5, TAIL_J_PER_S = 0.6, TX_S_PER_REQ = 0.3;
const energy = (wakeups: number, requests: number) => requests * TX_S_PER_REQ * TX_J_PER_S + wakeups * TAIL_S * TAIL_J_PER_S;
const separate = energy(10, 10), batched = energy(1, 10);
assert.equal(Math.round(separate * 10) / 10, 33.6);
assert.equal(Math.round(batched * 10) / 10, 6.6);
const pollEvery5s = energy(720, 720);                          // one hour of 5-second polling
const pushThenFetch = energy(6, 6);                            // 6 real changes in that hour
assert.ok(pollEvery5s / pushThenFetch > 100);
console.log('json', full.length, 'B | gzip', gz.length, 'B | br', br.length, 'B | sparse', sparse.length,
  'B | delta(gz)', gzipSync(delta).length, 'B | energy separate/batched', separate.toFixed(1), '/', batched.toFixed(1), 'J');`,
        },
        production: {
          language: 'ts',
          filename: 'deltaSync.ts',
          explanation: 'Production delta sync on React Native: one sync call fetches changes since the stored cursor with a conditional request (304 when nothing changed), applies upserts and tombstones to SQLite in one transaction, flushes queued uploads in the same radio wake-up, and is triggered by app foreground or a push, never by a tight poll.',
          code: raw`import { AppState } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { MMKV } from 'react-native-mmkv';

const meta = new MMKV({ id: 'sync-meta' });
type Change = { id: string; status: string; totalCents: number; updatedAt: string };
type Delta = { changed: Change[]; deleted: string[]; cursor: string };

export async function syncOrders(db: SQLiteDatabase, token: string, flushOutbox: () => Promise<void>) {
  await flushOutbox();                                              // uploads share this radio wake-up
  const cursor = meta.getString('orders.cursor');
  const etag = meta.getString('orders.etag');
  const res = await fetch('https://api.example.com/orders/changes?fields=id,status,totalCents,updatedAt' +
    (cursor ? '&since=' + encodeURIComponent(cursor) : ''), {
    headers: { authorization: 'Bearer ' + token, ...(etag && { 'if-none-match': etag }) },   // gzip/br negotiated natively
  });
  if (res.status === 304) return { changed: 0 };                     // nothing new: empty body
  if (!res.ok) throw new Error('HTTP ' + res.status);

  const delta = (await res.json()) as Delta;
  await db.withTransactionAsync(async () => {
    for (const c of delta.changed) {
      await db.runAsync(
        'INSERT INTO orders (id, status, total_cents, updated_at) VALUES (?, ?, ?, ?) ' +
        'ON CONFLICT(id) DO UPDATE SET status = excluded.status, total_cents = excluded.total_cents, updated_at = excluded.updated_at',
        [c.id, c.status, c.totalCents, c.updatedAt]);
    }
    for (const id of delta.deleted) await db.runAsync('DELETE FROM orders WHERE id = ?', [id]);   // tombstones
  });
  meta.set('orders.cursor', delta.cursor);
  const newEtag = res.headers.get('etag');
  if (newEtag) meta.set('orders.etag', newEtag);
  return { changed: delta.changed.length + delta.deleted.length };
}

// Triggers: app comes to the foreground, or a (silent) push says "orders changed"
export function startSyncTriggers(run: () => Promise<unknown>) {
  const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void run(); });
  return () => sub.remove();
}`,
        },
        bug: {
          explanation:
            'Polling the full order list every 5 seconds, in the foreground and background alike, keeps the cellular radio in its high-power state permanently, downloads the same unchanged megabytes over and over, and drains the battery while the app is not even visible. Fetch deltas on foreground and on push, revalidate with ETags, and stop when backgrounded.',
          buggy: {
            language: 'ts',
            filename: 'ordersPoller.ts',
            code: raw`// ❌ Full download every 5 s, forever, even in the background
setInterval(async () => {
  const res = await fetch('https://api.example.com/orders');          // all fields, all orders
  setOrders(await res.json());
}, 5000);`,
          },
          fixed: {
            language: 'ts',
            filename: 'ordersPoller.ts',
            code: raw`// ✅ Event-driven delta sync: on foreground + on push, conditional, paused in background
const stop = startSyncTriggers(() => syncOrders(db, token, flushOutbox));
Notifications.addNotificationReceivedListener((n) => {
  if (n.request.content.data?.type === 'orders-changed') void syncOrders(db, token, flushOutbox);
});
// call stop() on logout; no timers keep the radio awake`,
          },
        },
      },
      takeaways: [
        'Radio wake-ups and their tails dominate network energy: batch requests and avoid polling.',
        'Compress JSON (gzip/Brotli shrink it several times) and send only the fields a screen needs.',
        'Sync deltas since a cursor with tombstones; revalidate with ETags (304 = empty body).',
        'Trigger sync from foreground events and push, and stop background polling.',
        'Practice drill: with the Tab 1 model, compute the energy of 30 requests sent in 3 batches (30·0.36 + 3·3 = 19.8 J) versus individually (30·0.36 + 30·3 = 100.8 J).',
      ],
    },
  ],
};
