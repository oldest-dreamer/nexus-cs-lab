import type { Module } from '../../types';

const raw = String.raw;

export const backendApisModule: Module = {
  id: 'web-backend-apis',
  title: 'Backend APIs & Real-Time Protocols',
  level: 'Intermediate',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'web-node-rest-design',
      title: 'Node.js Server Architecture & REST Design (Pagination, Errors)',
      summary: 'Structure a TypeScript API into layers that are easy to test, design resources and methods with the right semantics, paginate with cursors instead of offsets, and return one consistent error envelope.',
      difficulty: 'Intermediate',
      minutes: 25,
      xp: 120,
      analogy:
        "A well-built API is a restaurant. The host (router + middleware) greets guests, checks reservations and seats them. The waiter (handler) takes the order and validates it. The chef (service) cooks using the recipes (business rules). The pantry manager (repository) is the only one who goes into the storeroom (database). Nobody does anyone else's job, so when the soup is wrong you know which station to visit.",
      intuition: [
        { title: 'Layers with one direction of dependency', body: "Routes/middleware → handlers (parse + validate HTTP input, map results to status codes) → services (business rules, transactions) → repositories (SQL). Services never see `req`/`res`, so they can be unit-tested and reused from jobs and CLIs." },
        { title: 'Node is single-threaded for your JavaScript', body: "Async I/O makes one process handle thousands of concurrent requests, but CPU-heavy work (image resizing, big JSON transforms, bcrypt with a high cost) blocks every request. Offload it to worker threads or a job queue." },
        { title: 'Resources and method semantics', body: "Nouns in URLs (`/orders/42/items`), verbs in methods. GET is safe; GET, PUT and DELETE are idempotent (repeating them has the same effect); POST is neither, so retried POSTs need idempotency keys (next chapter). Use PATCH for partial updates." },
        { title: 'Offset pagination breaks on live data', body: "`LIMIT 20 OFFSET 40` re-counts rows on every request. If a new row is inserted at the top between page 1 and page 2, the last item of page 1 appears again (and deletes cause skips). Deep offsets are also slow: the database still walks every skipped row." },
        { title: 'Cursor (keyset) pagination', body: "Return an opaque cursor encoding the last row's sort key, e.g. `(created_at, id)`, and ask for rows strictly after it: `WHERE (created_at, id) < ($1, $2) ORDER BY created_at DESC, id DESC LIMIT 20`. Stable under inserts and fast at any depth with a matching index." },
        { title: 'One error envelope', body: "Every error has the same shape (for example RFC 9457 problem details: `type`, `title`, `status`, `detail`, plus `errors` for validation) and a request id. Log internals server-side; never return stack traces." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Request path through the layers', body: 'Each layer has one job and depends only on the layer below.', flow: ['HTTP request', 'middleware: request id, auth, rate limit', 'handler: validate → call service', 'service: business rules + transaction', 'repository: SQL', 'handler: status code + JSON / problem details'] },
        { kind: 'tip', title: 'Graceful shutdown', body: 'On SIGTERM, stop accepting connections, let in-flight requests finish (with a deadline), then close the database pool. Deployments then never cut requests in half.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'pagination_from_scratch.ts',
          explanation: 'Runnable TypeScript: an in-memory feed where a new post arrives between page requests. Offset pagination shows a duplicate; keyset pagination with an opaque base64url cursor does not. Also builds an RFC 9457-style problem object. All results asserted.',
          code: raw`//  NEW POST ARRIVES BETWEEN PAGE 1 AND PAGE 2 (page size 3)
//
//   offset: page1 = [p10 p9 p8]   insert p11   page2 (OFFSET 3) = [p8 p7 p6]  <- p8 duplicated
//   cursor: page1 = [p10 p9 p8] cursor=(p8)    page2 (after p8) = [p7 p6 p5]  <- stable
import assert from 'node:assert/strict';

type Post = { id: number; createdAt: number };
let feed: Post[] = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, createdAt: 1000 + i }));
const newestFirst = () => [...feed].sort((a, b) => b.createdAt - a.createdAt || b.id - a.id);

function pageByOffset(offset: number, limit: number) {
  return newestFirst().slice(offset, offset + limit).map((p) => p.id);
}

const encodeCursor = (p: Post) => Buffer.from(JSON.stringify([p.createdAt, p.id])).toString('base64url');
const decodeCursor = (c: string) => JSON.parse(Buffer.from(c, 'base64url').toString()) as [number, number];

function pageByCursor(cursor: string | null, limit: number) {
  let rows = newestFirst();
  if (cursor) {
    const [ts, id] = decodeCursor(cursor);
    rows = rows.filter((p) => p.createdAt < ts || (p.createdAt === ts && p.id < id));   // (created_at, id) < cursor
  }
  const page = rows.slice(0, limit);
  return { ids: page.map((p) => p.id), next: page.length === limit ? encodeCursor(page[page.length - 1]) : null };
}

// offset pagination with a concurrent insert
const o1 = pageByOffset(0, 3);
feed.push({ id: 11, createdAt: 2000 });
const o2 = pageByOffset(3, 3);
assert.deepEqual(o1, [10, 9, 8]);
assert.deepEqual(o2, [8, 7, 6]);                               // 8 shown twice

// cursor pagination with the same insert
feed = feed.filter((p) => p.id !== 11);
const c1 = pageByCursor(null, 3);
feed.push({ id: 11, createdAt: 2000 });
const c2 = pageByCursor(c1.next, 3);
assert.deepEqual(c1.ids, [10, 9, 8]);
assert.deepEqual(c2.ids, [7, 6, 5]);                           // no duplicates, no skips
assert.match(c1.next!, /^[A-Za-z0-9_-]+$/);                    // opaque, URL-safe

// one error envelope for every failure (RFC 9457 problem details)
function problem(status: number, title: string, detail: string, requestId: string, errors?: { path: string; message: string }[]) {
  return { type: 'https://api.example.com/problems/' + title.toLowerCase().replace(/\s+/g, '-'), title, status, detail, requestId, ...(errors && { errors }) };
}
const p = problem(422, 'Validation Failed', '1 field is invalid', 'req_8f2', [{ path: 'items.0.qty', message: 'must be >= 1' }]);
assert.equal(p.type, 'https://api.example.com/problems/validation-failed');
assert.equal(p.errors?.[0].path, 'items.0.qty');
console.log('offset pages', o1, o2, '| cursor pages', c1.ids, c2.ids);`,
        },
        production: {
          language: 'ts',
          filename: 'orders-api.ts',
          explanation: 'Production Express 5 + node-postgres API: request ids, layered handler/service/repository, keyset pagination backed by a composite index, a central problem-details error handler (Express 5 forwards rejected async handlers to it), and graceful shutdown.',
          code: raw`import express, { type NextFunction, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 20 });

class HttpError extends Error {
  constructor(public status: number, public title: string, message: string, public errors?: unknown[]) { super(message); }
}

// ---------- repository: the only layer that writes SQL
// CREATE INDEX orders_customer_created ON orders (customer_id, created_at DESC, id DESC);
const ordersRepo = {
  async page(customerId: string, after: [string, string] | null, limit: number) {
    const { rows } = await pool.query(
      'SELECT id, status, total_cents, created_at FROM orders ' +
      'WHERE customer_id = $1 AND ($2::timestamptz IS NULL OR (created_at, id) < ($2, $3::uuid)) ' +
      'ORDER BY created_at DESC, id DESC LIMIT $4',
      [customerId, after?.[0] ?? null, after?.[1] ?? null, limit + 1]);   // +1 to know if more exist
    return rows;
  },
};

// ---------- service: business rules, no HTTP
const ordersService = {
  async list(customerId: string, cursor: string | undefined, limit: number) {
    let after: [string, string] | null = null;
    if (cursor) {
      try { after = JSON.parse(Buffer.from(cursor, 'base64url').toString()); }
      catch { throw new HttpError(400, 'Bad Cursor', 'cursor is malformed'); }
    }
    const rows = await ordersRepo.page(customerId, after, limit);
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const next = rows.length > limit && last
      ? Buffer.from(JSON.stringify([last.created_at, last.id])).toString('base64url') : null;
    return { data: page, nextCursor: next };
  },
};

// ---------- HTTP layer
const app = express();
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => { res.locals.requestId = req.get('x-request-id') ?? randomUUID(); next(); });

app.get('/v1/customers/:id/orders', async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 20) || 20, 100);          // clamp page size
  res.json(await ordersService.list(req.params.id, req.query.cursor as string | undefined, limit));
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {   // one error envelope
  const e = err instanceof HttpError ? err : new HttpError(500, 'Internal Error', 'Unexpected error');
  if (e.status >= 500) console.error({ requestId: res.locals.requestId, err });
  res.status(e.status).type('application/problem+json').json({
    type: 'https://api.example.com/problems/' + e.title.toLowerCase().replace(/\s+/g, '-'),
    title: e.title, status: e.status, detail: e.message, requestId: res.locals.requestId, errors: e.errors,
  });
});

const server = app.listen(Number(process.env.PORT ?? 3000));
process.on('SIGTERM', () => {                                   // graceful shutdown
  server.close(async () => { await pool.end(); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();            // hard deadline
});`,
        },
        bug: {
          explanation:
            'OFFSET pagination on a non-unique sort key is both wrong and slow: rows with the same created_at can appear on two pages or none (the order of ties is undefined), inserts shift every later page, and OFFSET 100000 makes Postgres read and discard 100,000 rows. Use keyset pagination with a unique tie-breaker and a matching index.',
          buggy: {
            language: 'sql',
            filename: 'feed.sql',
            code: raw`-- ❌ Ties in created_at reorder between requests; deep pages scan everything before them
SELECT id, title, created_at
FROM posts
ORDER BY created_at DESC
LIMIT 20 OFFSET 100000;`,
          },
          fixed: {
            language: 'sql',
            filename: 'feed.sql',
            code: raw`-- ✅ Keyset pagination: unique (created_at, id) order, index seek to the cursor
CREATE INDEX IF NOT EXISTS posts_created_id ON posts (created_at DESC, id DESC);

SELECT id, title, created_at
FROM posts
WHERE (created_at, id) < ($1, $2)          -- values decoded from the client's opaque cursor
ORDER BY created_at DESC, id DESC
LIMIT 20;`,
          },
        },
      },
      takeaways: [
        'Layer the server: middleware → handlers → services → repositories; keep HTTP out of services.',
        'Respect method semantics: GET safe; GET/PUT/DELETE idempotent; POST needs idempotency keys.',
        'Use keyset (cursor) pagination with a unique tie-breaker; offsets duplicate, skip and slow down.',
        'Return one problem-details error envelope with a request id; log internals, never leak them.',
        'Practice drill: in Tab 1, delete post 9 between the two offset requests instead of inserting, and predict which post is skipped (post 7: page 2 becomes [6, 5, 4]).',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'web-idempotency-rate-limiting',
      title: 'Idempotency Keys & Rate Limiting (Token Bucket, Sliding Window)',
      summary: 'Make retried POSTs safe with idempotency keys, protect your API with rate limits that are fair and atomic, and tell clients exactly when to retry.',
      difficulty: 'Intermediate',
      minutes: 22,
      xp: 120,
      analogy:
        "An idempotency key is the ticket number at a deli counter: if you shout your order twice with the same ticket, you still get one sandwich. Rate limiting is the turnstile at a stadium: a token bucket gives everyone a few quick passes for a burst, then lets them through at a steady pace; anyone faster is told to wait and for how long.",
      intuition: [
        { title: 'Why retries duplicate', body: "A client sends `POST /payments`, the server charges the card, and the response is lost (timeout, mobile network). The client cannot know whether it worked, so it retries, and without protection the customer is charged twice." },
        { title: 'Idempotency keys', body: "The client generates a unique `Idempotency-Key` per logical operation and reuses it on retries. The server stores key → (request fingerprint, status, response). A repeat with the same key returns the stored response; the same key with a different body is a client bug (422); a repeat while the first is still running gets 409." },
        { title: 'Fixed window vs sliding window', body: "A fixed window (100 requests per minute, reset at :00) allows 200 requests in two seconds around the boundary. A sliding window counts requests in the last 60 seconds from now, which is smoother." },
        { title: 'Token bucket', body: "A bucket holds up to `capacity` tokens and refills at `rate` per second. Each request takes a token; an empty bucket means 429. It allows short bursts while enforcing an average rate, and is what most API gateways use." },
        { title: 'Tell clients what to do', body: "Return 429 with `Retry-After` (seconds) and, ideally, `RateLimit-Limit`/`RateLimit-Remaining`/`RateLimit-Reset` headers. Clients should back off exponentially with jitter." },
        { title: 'Atomicity across servers', body: "With several API instances, limits and idempotency records must live in shared storage (Redis, Postgres) and be updated atomically (INCR, Lua scripts, `SET NX`, unique constraints). A read-then-write check races under load." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Idempotent POST handling', body: 'The key is claimed atomically before any side effect.', flow: ['POST + Idempotency-Key', 'SET key NX (claim)', 'claimed → run once, store response', 'exists + done → replay stored response', 'exists + running → 409 / same key, new body → 422'] },
        { kind: 'warning', title: 'Rate-limit by the right identity', body: 'Limit authenticated traffic per user or API key, and anonymous traffic per IP (behind a proxy, use the trusted X-Forwarded-For hop, not the raw header). Separate stricter limits protect login and password-reset endpoints from brute force.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'idempotency_and_limits_from_scratch.ts',
          explanation: 'Runnable TypeScript with a controllable clock: an idempotency store (replay, in-progress conflict, body mismatch), a token bucket, a fixed window showing the boundary burst, and a sliding-window log that prevents it. Every decision is asserted.',
          code: raw`//  TOKEN BUCKET (capacity 5, refill 1 token/s)
//
//   t=0s   [#####]  5 requests -> allowed, bucket empty [     ]
//   t=0s   6th request -> 429, Retry-After 1
//   t=2s   [##   ]  refilled 2 -> 2 more allowed
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// ---- idempotency keys
type Stored = { fingerprint: string; state: 'running' | 'done'; status?: number; body?: unknown };
const records = new Map<string, Stored>();
let charges = 0;
function handlePayment(key: string, body: { amount: number }, finish = true) {
  const fingerprint = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const existing = records.get(key);
  if (existing) {
    if (existing.fingerprint !== fingerprint) return { status: 422, body: 'key reused with a different body' };
    if (existing.state === 'running') return { status: 409, body: 'request in progress' };
    return { status: existing.status!, body: existing.body, replayed: true };
  }
  records.set(key, { fingerprint, state: 'running' });              // claim first (atomic in real storage)
  if (!finish) return { status: 202, body: 'started' };
  charges++;
  const rec = { fingerprint, state: 'done' as const, status: 201, body: { chargeId: 'ch_' + charges } };
  records.set(key, rec);
  return { status: rec.status, body: rec.body };
}
assert.deepEqual(handlePayment('k1', { amount: 500 }), { status: 201, body: { chargeId: 'ch_1' } });
assert.deepEqual(handlePayment('k1', { amount: 500 }), { status: 201, body: { chargeId: 'ch_1' }, replayed: true });
assert.equal(handlePayment('k1', { amount: 900 }).status, 422);
handlePayment('k2', { amount: 100 }, false);
assert.equal(handlePayment('k2', { amount: 100 }).status, 409);
assert.equal(charges, 1);                                            // one charge despite retries

// ---- token bucket
function tokenBucket(capacity: number, refillPerSec: number) {
  let tokens = capacity, last = 0;
  return (nowMs: number) => {
    tokens = Math.min(capacity, tokens + ((nowMs - last) / 1000) * refillPerSec);
    last = nowMs;
    if (tokens >= 1) { tokens -= 1; return { allowed: true }; }
    return { allowed: false, retryAfter: Math.ceil((1 - tokens) / refillPerSec) };
  };
}
const take = tokenBucket(5, 1);
const burst = Array.from({ length: 6 }, () => take(0));
assert.deepEqual(burst.map((r) => r.allowed), [true, true, true, true, true, false]);
assert.equal(burst[5].retryAfter, 1);
assert.deepEqual([take(2000), take(2000), take(2000)].map((r) => r.allowed), [true, true, false]);

// ---- fixed window allows 2x the limit around a boundary; sliding log does not
const LIMIT = 100, WINDOW = 60_000;
function fixedWindow() {
  const counts = new Map<number, number>();
  return (t: number) => { const w = Math.floor(t / WINDOW); const c = (counts.get(w) ?? 0) + 1; counts.set(w, c); return c <= LIMIT; };
}
function slidingLog() {
  const log: number[] = [];
  return (t: number) => { while (log.length && log[0] <= t - WINDOW) log.shift(); if (log.length >= LIMIT) return false; log.push(t); return true; };
}
const times = [...Array(100).fill(59_000), ...Array(100).fill(61_000)];   // 200 requests within 2 s
const fw = fixedWindow(), sl = slidingLog();
assert.equal(times.filter((t) => fw(t)).length, 200);
assert.equal(times.filter((t) => sl(t)).length, 100);
console.log('charges', charges, '| fixed window allowed', 200, '| sliding window allowed', 100);`,
        },
        production: {
          language: 'ts',
          filename: 'protect.ts',
          explanation: 'Production Express middleware backed by Redis (ioredis): an atomic token bucket implemented as a Lua script (one round trip, no races between API instances) with standard rate-limit headers, and an idempotency middleware that claims keys with SET NX, replays stored responses and detects body mismatches.',
          code: raw`import type { NextFunction, Request, Response } from 'express';
import { createHash } from 'node:crypto';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

// ---- token bucket in Lua: read, refill, take and save happen atomically inside Redis
const TOKEN_BUCKET = [
  "local cap, rate, now = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])",
  "local b = redis.call('HMGET', KEYS[1], 'tokens', 'ts')",
  "local tokens = tonumber(b[1]) or cap",
  "local ts = tonumber(b[2]) or now",
  "tokens = math.min(cap, tokens + (now - ts) / 1000 * rate)",
  "local allowed = 0",
  "if tokens >= 1 then tokens = tokens - 1; allowed = 1 end",
  "redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)",
  "redis.call('PEXPIRE', KEYS[1], math.ceil(cap / rate * 1000))",
  "return { allowed, tostring(tokens) }",
].join('\n');

export function rateLimit(capacity: number, perSecond: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const id = req.user?.id ?? req.ip;                                  // per user, else per IP (trust proxy set)
    const [allowed, left] = (await redis.eval(TOKEN_BUCKET, 1, 'rl:' + id, capacity, perSecond, Date.now())) as [number, string];
    res.setHeader('RateLimit-Limit', String(capacity));
    res.setHeader('RateLimit-Remaining', String(Math.floor(Number(left))));
    if (allowed) return next();
    res.setHeader('Retry-After', String(Math.ceil((1 - Number(left)) / perSecond)));
    res.status(429).json({ title: 'Too Many Requests', status: 429 });
  };
}

// ---- idempotency for unsafe methods
export async function idempotency(req: Request, res: Response, next: NextFunction) {
  const key = req.get('Idempotency-Key');
  if (!key) return res.status(400).json({ title: 'Idempotency-Key header required', status: 400 });
  const scope = 'idem:' + (req.user?.id ?? 'anon') + ':' + key;          // keys are per client
  const fingerprint = createHash('sha256').update(req.method + req.path + JSON.stringify(req.body)).digest('hex');

  const claimed = await redis.set(scope, JSON.stringify({ fingerprint, state: 'running' }), 'EX', 86_400, 'NX');
  if (!claimed) {
    const rec = JSON.parse((await redis.get(scope)) ?? '{}');
    if (rec.fingerprint !== fingerprint) return res.status(422).json({ title: 'Idempotency key reused with different request', status: 422 });
    if (rec.state === 'running') return res.status(409).json({ title: 'Request already in progress', status: 409 });
    res.setHeader('Idempotent-Replayed', 'true');
    return res.status(rec.status).json(rec.body);                     // replay the original response
  }

  const json = res.json.bind(res);
  res.json = (body: unknown) => {                                      // capture and store the response
    void redis.set(scope, JSON.stringify({ fingerprint, state: 'done', status: res.statusCode, body }), 'EX', 86_400);
    return json(body);
  };
  next();
}

// app.post('/v1/payments', rateLimit(10, 1), idempotency, createPayment);`,
        },
        bug: {
          explanation:
            'GET followed by SET is a check-then-act race: under load, many requests read the same count before any of them writes, so far more than the limit get through, and two API instances make it worse. Use a single atomic operation (INCR with an expiry set in the same transaction, or a Lua script).',
          buggy: {
            language: 'ts',
            filename: 'limit.ts',
            code: raw`// ❌ Non-atomic: 50 concurrent requests can all read "99" and all pass
export async function allow(userId: string) {
  const key = 'rl:' + userId + ':' + Math.floor(Date.now() / 60_000);
  const count = Number((await redis.get(key)) ?? 0);
  if (count >= 100) return false;
  await redis.set(key, count + 1, 'EX', 60);
  return true;
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'limit.ts',
            code: raw`// ✅ INCR is atomic; MULTI sets the expiry in the same round trip
export async function allow(userId: string) {
  const key = 'rl:' + userId + ':' + Math.floor(Date.now() / 60_000);
  const [[, count]] = (await redis.multi().incr(key).expire(key, 60).exec()) as [[null, number], unknown];
  return count <= 100;
}`,
          },
        },
      },
      takeaways: [
        'Retries are inevitable; idempotency keys turn "maybe twice" into "exactly once" for POSTs.',
        'Store key → fingerprint + response; replay on repeat, 409 while running, 422 on body mismatch.',
        'Token buckets allow bursts at a steady average; fixed windows allow 2× bursts at boundaries.',
        'Return 429 + Retry-After; implement limits atomically in shared storage.',
        'Practice drill: with tokenBucket(10, 2), how many of 15 requests at t = 0 succeed (10), and how many more at t = 1500 ms (3)? Verify in Tab 1.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'web-sse-websockets',
      title: 'Real-Time: Server-Sent Events vs WebSockets',
      summary: 'Choose between polling, SSE and WebSockets, understand the WebSocket upgrade handshake, resume SSE streams with Last-Event-ID, and keep connections healthy with heartbeats and backoff.',
      difficulty: 'Intermediate',
      minutes: 22,
      xp: 120,
      analogy:
        "Polling is calling the pizza shop every minute to ask if your order is ready. Server-Sent Events is the shop texting you updates on a one-way line: simple, automatic and it reconnects by itself. A WebSocket is an open phone call where both of you can talk at any time: more powerful, but someone has to notice when the line goes silent and hang up properly.",
      intuition: [
        { title: 'Pick the simplest thing that works', body: "Polling is fine for slow-changing data. SSE suits server → client streams (notifications, live dashboards, LLM tokens). WebSockets suit genuinely bidirectional, low-latency traffic (multiplayer, collaborative editing, chat with typing indicators)." },
        { title: 'SSE is just HTTP', body: "`Content-Type: text/event-stream`, then `id:`, `event:` and `data:` lines separated by blank lines. It works through proxies and with HTTP/2 multiplexing, and `EventSource` reconnects automatically, sending `Last-Event-ID` so the server can replay missed events." },
        { title: 'The WebSocket handshake', body: "The client sends an HTTP GET with `Upgrade: websocket` and a random `Sec-WebSocket-Key`. The server replies `101 Switching Protocols` with `Sec-WebSocket-Accept = base64(SHA-1(key + \"258EAFA5-E914-47DA-95CA-C5AB0DC85B11\"))`. After that, the TCP connection carries framed binary/text messages both ways." },
        { title: 'Authenticate on connect', body: "Browsers cannot set custom headers on `new WebSocket()`. Authenticate the upgrade request with the session cookie (and check `Origin` to stop cross-site WebSocket hijacking) or a short-lived token, and re-check permissions per message for sensitive actions." },
        { title: 'Keep connections honest', body: "Idle connections are silently dropped by NATs and load balancers. Send heartbeats (SSE comments, WebSocket ping/pong), terminate peers that stop answering, and reconnect clients with exponential backoff plus jitter so a server restart doesn't cause a reconnect stampede." },
        { title: 'Scaling out', body: "Each instance only knows its own connections. Fan out messages through a pub/sub layer (Redis, NATS, Postgres LISTEN/NOTIFY) and use sticky sessions or connection-aware routing at the load balancer." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Real-time fan-out across instances', body: 'Any instance can publish; every instance pushes to its own connected clients.', flow: ['event produced (API / worker)', 'publish to Redis channel', 'all API instances subscribed', 'each pushes to its SSE / WebSocket clients', 'clients reconnect with Last-Event-ID / backoff'] },
        { kind: 'security', title: 'Cross-Site WebSocket Hijacking', body: 'WebSockets are not covered by CORS. If you authenticate with cookies, verify the Origin header against an allowlist during the upgrade, or any website can open a socket as your user.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'realtime_from_scratch.ts',
          explanation: 'Runnable TypeScript: computes Sec-WebSocket-Accept and checks it against the RFC 6455 example, serialises SSE events and replays them after a Last-Event-ID, and generates a capped exponential backoff schedule with full jitter. All asserted.',
          code: raw`//  WEBSOCKET UPGRADE
//
//   client: GET /chat  Upgrade: websocket  Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
//   server: 101 Switching Protocols  Sec-WebSocket-Accept: base64(sha1(key + GUID))
//   ...then framed messages in both directions on the same TCP connection
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const acceptFor = (key: string) => createHash('sha1').update(key + GUID).digest('base64');
assert.equal(acceptFor('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');   // RFC 6455 example

// ---- SSE serialisation + replay after reconnect
type Ev = { id: number; event: string; data: unknown };
const serialize = (e: Ev) => 'id: ' + e.id + '\nevent: ' + e.event + '\ndata: ' + JSON.stringify(e.data) + '\n\n';
const history: Ev[] = [1, 2, 3, 4, 5].map((id) => ({ id, event: 'price', data: { v: 100 + id } }));
const replayAfter = (lastEventId: number) => history.filter((e) => e.id > lastEventId).map(serialize).join('');
assert.equal(serialize(history[0]), 'id: 1\nevent: price\ndata: {"v":101}\n\n');
const resumed = replayAfter(3);
assert.equal((resumed.match(/^id: /gm) ?? []).length, 2);                  // events 4 and 5 only
assert.ok(resumed.startsWith('id: 4'));

// ---- reconnect backoff: exponential, capped, with full jitter (seeded RNG for determinism)
function backoffSchedule(attempts: number, baseMs: number, capMs: number, rand: () => number) {
  return Array.from({ length: attempts }, (_, n) => Math.round(rand() * Math.min(capMs, baseMs * 2 ** n)));
}
let seed = 42;
const rng = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const ceilings = Array.from({ length: 8 }, (_, n) => Math.min(30_000, 500 * 2 ** n));
assert.deepEqual(ceilings, [500, 1000, 2000, 4000, 8000, 16000, 30000, 30000]);
const delays = backoffSchedule(8, 500, 30_000, rng);
assert.ok(delays.every((d, n) => d >= 0 && d <= ceilings[n]));            // jitter stays under the cap
assert.ok(new Set(delays).size > 6);                                       // clients spread out
console.log('accept', acceptFor('dGhlIHNhbXBsZSBub25jZQ=='), '| backoff', delays);`,
        },
        production: {
          language: 'ts',
          filename: 'realtime-server.ts',
          explanation: 'Production Node.js: an SSE endpoint with Last-Event-ID replay, heartbeats and cleanup on disconnect, plus a WebSocket server (ws library) that authenticates the upgrade with the session cookie, checks Origin, and terminates dead peers via ping/pong. Both fan out through Redis pub/sub.',
          code: raw`import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import Redis from 'ioredis';
import { WebSocketServer, type WebSocket } from 'ws';

const sub = new Redis(process.env.REDIS_URL!);
const sseClients = new Set<ServerResponse>();
const wsClients = new Set<WebSocket & { alive?: boolean }>();
const ALLOWED_ORIGINS = new Set(['https://app.example.com']);

// ---------- SSE: one-way stream with resume
async function sse(req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',                                     // disable proxy buffering (nginx)
  });
  const lastId = Number(req.headers['last-event-id'] ?? 0);
  for (const e of await events.since(lastId)) res.write('id: ' + e.id + '\ndata: ' + JSON.stringify(e) + '\n\n');
  sseClients.add(res);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);   // comment keeps proxies happy
  req.on('close', () => { clearInterval(heartbeat); sseClients.delete(res); });   // ALWAYS clean up
}

// ---------- WebSocket: authenticated upgrade + heartbeats
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
const server = createServer((req, res) => (req.url === '/events' ? void sse(req, res) : res.writeHead(404).end()));

server.on('upgrade', async (req, socket, head) => {
  const user = await sessions.fromCookie(req.headers.cookie);           // cookie auth...
  if (!user || !ALLOWED_ORIGINS.has(req.headers.origin ?? '')) {        // ...so Origin MUST be checked
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws: WebSocket & { alive?: boolean }) => {
    ws.alive = true;
    ws.on('pong', () => { ws.alive = true; });
    ws.on('message', (raw) => handleMessage(user, raw.toString()));    // re-check permissions per action
    ws.on('close', () => wsClients.delete(ws));
    wsClients.add(ws);
  });
});

setInterval(() => {                                                     // drop peers that stopped answering
  for (const ws of wsClients) {
    if (!ws.alive) { ws.terminate(); wsClients.delete(ws); continue; }
    ws.alive = false; ws.ping();
  }
}, 30_000);

// ---------- fan-out: every instance receives every event and pushes to its own clients
void sub.subscribe('events');
sub.on('message', (_channel, message) => {
  const e = JSON.parse(message) as { id: number };
  for (const res of sseClients) res.write('id: ' + e.id + '\ndata: ' + message + '\n\n');
  for (const ws of wsClients) if (ws.bufferedAmount < 1_000_000) ws.send(message);   // skip slow consumers
});

server.listen(3000);`,
        },
        bug: {
          explanation:
            'When the client disconnects, the handler never clears its interval or removes the response from the subscriber set, so every reconnect adds another timer writing to a dead socket. Memory and CPU grow until the process falls over. Always clean up on the request\'s close event.',
          buggy: {
            language: 'ts',
            filename: 'notifications.ts',
            code: raw`// ❌ Leaks one interval + one listener per connection, forever
app.get('/notifications', (req, res) => {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  setInterval(() => res.write(': ping\n\n'), 15_000);
  bus.on('notification', (n) => res.write('data: ' + JSON.stringify(n) + '\n\n'));
});`,
          },
          fixed: {
            language: 'ts',
            filename: 'notifications.ts',
            code: raw`// ✅ Everything registered on connect is removed on disconnect
app.get('/notifications', (req, res) => {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
  const onNotification = (n: unknown) => res.write('data: ' + JSON.stringify(n) + '\n\n');
  bus.on('notification', onNotification);
  req.on('close', () => {
    clearInterval(ping);
    bus.off('notification', onNotification);
  });
});`,
          },
        },
      },
      takeaways: [
        'Polling for slow data, SSE for server → client streams, WebSockets for true bidirectional traffic.',
        'SSE resumes with Last-Event-ID; WebSockets start with an HTTP 101 upgrade and a SHA-1 accept hash.',
        'Authenticate the upgrade, check Origin, heartbeat, and clean up on every disconnect.',
        'Reconnect with capped exponential backoff + jitter; fan out across instances with pub/sub.',
        'Practice drill: compute the backoff ceiling for attempt 5 (n = 5) with base 250 ms and cap 10 s (8,000 ms), then for n = 6 (10,000 ms, capped).',
      ],
    },
  ],
};
