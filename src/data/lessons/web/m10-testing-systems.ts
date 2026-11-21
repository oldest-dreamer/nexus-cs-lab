import type { Module } from '../../types';

const raw = String.raw;

export const testingSystemsModule: Module = {
  id: 'web-testing-systems',
  title: 'Testing & Web System Design',
  level: 'Advanced',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'web-testing-strategy',
      title: 'Testing Strategy: Unit vs Integration vs End-to-End (Without Flakes)',
      summary: 'Decide what to test at which level, write tests that check behaviour instead of implementation, make time and randomness deterministic, and keep end-to-end tests fast and reliable.',
      difficulty: 'Intermediate',
      minutes: 22,
      xp: 120,
      analogy:
        "Testing a car happens at three levels. Unit tests check one part on a bench: does this brake pad grip? Integration tests check parts working together: do the pedal, hydraulics and pads stop the wheel? End-to-end tests are a test drive: can a driver actually stop at the red light? You need many bench tests, a good number of assembly tests, and a few test drives, because test drives are slow and expensive and a bumpy road can fail them for reasons unrelated to the brakes.",
      intuition: [
        { title: 'Unit tests', body: "Test a pure function or a small module in isolation, in milliseconds. Perfect for business rules, parsers, reducers and edge cases (empty lists, boundaries, unicode, time zones). Inject dependencies such as the clock and random number generator instead of mocking globals." },
        { title: 'Integration tests', body: "Test your code with its real collaborators: the HTTP layer with the real router and validation, the repository against a real Postgres (in a container, each test in a rolled-back transaction). This is where most of the confidence per minute comes from." },
        { title: 'End-to-end tests', body: "Drive a real browser through critical user journeys: sign up, checkout, password reset. Keep them few, independent and focused on flows that would cost money or trust if broken." },
        { title: 'Test behaviour, not implementation', body: "Assert on outputs and visible effects (\"the total shows €42.00\", \"the API returns 422\"), not on internal calls or state shape. Query the UI by role and accessible name, the way users and screen readers find things; refactors then don't break tests." },
        { title: 'Flaky tests are bugs', body: "Common causes: fixed sleeps, real clocks and time zones, shared state between tests, test order dependence, unmocked network, animations. Use web-first assertions that retry until a condition holds, fake timers, unique test data and isolated databases." },
        { title: 'Contracts between services', body: "When teams own different services, validate each side against a shared schema (OpenAPI/JSON Schema/Zod) in CI so a breaking API change fails before deployment, not in production." },
      ],
      callouts: [
        { kind: 'architecture', title: 'A practical test portfolio', body: 'Fast feedback first; slow, high-fidelity checks last.', flow: ['static: types + lint (seconds)', 'unit: pure logic (ms each, hundreds)', 'integration: API + real DB (tens)', 'E2E: critical journeys in a browser (a handful)', 'production: synthetic checks + monitoring'] },
        { kind: 'tip', title: 'Write the failing test first for bugs', body: 'Every production bug gets a test that reproduces it before the fix. It proves the fix works and stops the bug from quietly coming back.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'test_runner_from_scratch.ts',
          explanation: 'Runnable TypeScript: a tiny async test runner (test/expect, isolated failures, summary) built from scratch; a subscription renewal rule tested with an injected clock so results never depend on today\'s date; and a demonstration that a sleep-based test is flaky while a polling (web-first) wait is not. All asserted.',
          code: raw`//  TEST RUNNER
//
//   [test 1] [test 2] [test 3] ... --> run each in isolation --> catch failure --> { passed, failed }
//                                            |
//                                            v
//   renewalDue(sub, clock) <--- injected fixedClock('2026-03-08')   (no hidden Date.now())
import assert from 'node:assert/strict';

type TestFn = () => void | Promise<void>;
const tests: Array<{ name: string; fn: TestFn }> = [];
const test = (name: string, fn: TestFn) => tests.push({ name, fn });
const expect = <T extends unknown>(actual: T) => ({
  toBe: (expected: T) => { if (!Object.is(actual, expected)) throw new Error('expected ' + String(expected) + ', got ' + String(actual)); },
});

async function run() {
  const results: Array<{ name: string; ok: boolean; error?: string }> = [];
  for (const t of tests) {
    try { await t.fn(); results.push({ name: t.name, ok: true }); }
    catch (e) { results.push({ name: t.name, ok: false, error: (e as Error).message }); }   // one failure never stops the rest
  }
  return { passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok), results };
}

// ---- unit under test: a pure rule with an injected clock
type Clock = { now: () => Date };
type Subscription = { renewsOn: string };                     // ISO date, UTC
function renewalDue(sub: Subscription, clock: Clock, withinDays = 3): boolean {
  const msLeft = new Date(sub.renewsOn + 'T00:00:00Z').getTime() - clock.now().getTime();
  return msLeft >= 0 && msLeft <= withinDays * 86_400_000;
}
const fixedClock = (iso: string): Clock => ({ now: () => new Date(iso) });

test('due 2 days before renewal', () => expect(renewalDue({ renewsOn: '2026-03-10' }, fixedClock('2026-03-08T00:00:00Z'))).toBe(true));
test('not due 4 days before', () => expect(renewalDue({ renewsOn: '2026-03-10' }, fixedClock('2026-03-06T00:00:00Z'))).toBe(false));
test('not due after the date passed', () => expect(renewalDue({ renewsOn: '2026-03-10' }, fixedClock('2026-03-11T00:00:00Z'))).toBe(false));
test('boundary: exactly 3 days', () => expect(renewalDue({ renewsOn: '2026-03-10' }, fixedClock('2026-03-07T00:00:00Z'))).toBe(true));
test('deliberately failing test is reported, not fatal', () => expect(1 + 1).toBe(3));

// ---- flaky vs robust waiting: the "UI" finishes after a variable delay
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function startSave(delayMs: number) { const state = { saved: false }; setTimeout(() => { state.saved = true; }, delayMs); return state; }
async function sleepThenCheck(delayMs: number) { const s = startSave(delayMs); await sleep(30); return s.saved; }
async function pollUntil(cond: () => boolean, timeoutMs = 1000) {
  const start = Date.now();
  while (!cond()) { if (Date.now() - start > timeoutMs) return false; await sleep(5); }
  return true;
}

async function main() {
  const summary = await run();
  assert.equal(summary.passed, 4);
  assert.equal(summary.failed.length, 1);
  assert.equal(summary.failed[0].error, 'expected 3, got 2');

  const sleepResults = await Promise.all([10, 50, 15, 80].map(sleepThenCheck));   // same test, different timing
  assert.deepEqual(sleepResults, [true, false, true, false]);                        // flaky
  const pollResults = await Promise.all([10, 50, 15, 80].map(async (d) => { const s = startSave(d); return pollUntil(() => s.saved); }));
  assert.deepEqual(pollResults, [true, true, true, true]);                           // robust
  console.log('runner:', summary.passed, 'passed,', summary.failed.length, 'failed | sleep-based:', sleepResults, '| polling:', pollResults);
}
main().catch((e) => { console.error(e); process.exit(1); });`,
        },
        production: {
          language: 'ts',
          filename: 'checkout.spec.ts',
          explanation: 'Production Playwright end-to-end test for a critical journey: authenticated state reused from a setup project, a third-party payment call mocked at the network layer, a fixed clock, role-based locators and web-first assertions that retry until the UI settles (no sleeps). Unit tests (Vitest) and API integration tests cover the rest of the pyramid.',
          code: raw`// npx playwright test   (playwright.config.ts: projects [{ name: 'setup' }, { name: 'chromium', dependencies: ['setup'] }])
import { test, expect } from '@playwright/test';

test.use({ storageState: 'playwright/.auth/customer.json' });   // logged in once by the setup project

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-03-08T10:00:00Z'));   // "today" never drifts
  // third-party payment provider is mocked: we test OUR flow, not their sandbox uptime
  await page.route('**/api/payments/intent', (route) =>
    route.fulfill({ status: 200, json: { clientSecret: 'pi_test_secret', status: 'requires_confirmation' } }));
});

test('customer can buy a product and sees the confirmation', async ({ page }) => {
  await page.goto('/products/a-100');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.getByRole('status')).toHaveText('Added to cart');        // retries until true

  await page.getByRole('link', { name: /cart \(1\)/i }).click();
  await expect(page.getByTestId('cart-total')).toHaveText('€42.00');

  await page.getByRole('button', { name: 'Checkout' }).click();
  await page.getByLabel('Delivery date').fill('2026-03-12');
  await page.getByRole('button', { name: 'Pay now' }).click();

  await expect(page).toHaveURL(/\/orders\/[a-z0-9-]+$/);
  await expect(page.getByRole('heading', { name: 'Thank you for your order' })).toBeVisible();
  await expect(page.getByText('Arrives Thursday, 12 March')).toBeVisible();
});

test('sold-out product shows an error and does not charge', async ({ page }) => {
  let paymentCalls = 0;
  await page.route('**/api/payments/intent', (route) => { paymentCalls++; return route.continue(); });
  await page.route('**/api/orders', (route) =>
    route.fulfill({ status: 409, json: { title: 'Sold out', status: 409 } }));
  await page.goto('/checkout?sku=A-100');
  await page.getByRole('button', { name: 'Pay now' }).click();
  await expect(page.getByRole('alert')).toContainText('Sold out');
  expect(paymentCalls).toBe(0);
});`,
        },
        bug: {
          explanation:
            'A fixed sleep is either too short (the test fails on a slow CI machine) or too long (every run wastes time), and reading textContent once does not retry. The real date also makes the expected delivery text change every day. Use web-first assertions that wait for the condition and control the clock.',
          buggy: {
            language: 'ts',
            filename: 'order.spec.ts',
            code: raw`// ❌ Flaky: passes locally, fails on busy CI runners and on some days of the week
test('shows delivery estimate', async ({ page }) => {
  await page.goto('/checkout');
  await page.click('#pay');
  await page.waitForTimeout(2000);                                   // hope 2 s is enough
  const text = await page.locator('.estimate').textContent();        // read once, no retry
  expect(text).toBe('Arrives ' + formatDate(addDays(new Date(), 4))); // depends on today + local TZ
});`,
          },
          fixed: {
            language: 'ts',
            filename: 'order.spec.ts',
            code: raw`// ✅ Deterministic time + assertions that wait for the UI
test('shows delivery estimate', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-03-08T10:00:00Z'));
  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Pay now' }).click();
  await expect(page.getByTestId('estimate')).toHaveText('Arrives Thursday, 12 March');   // auto-retries
});`,
          },
        },
      },
      takeaways: [
        'Many fast unit tests, a solid layer of integration tests against real dependencies, a few critical E2E journeys.',
        'Test behaviour through public interfaces and accessible roles, not implementation details.',
        'Inject clocks and randomness; never sleep, wait for conditions instead.',
        'Turn every production bug into a failing test first; treat flaky tests as bugs.',
        'Practice drill: add a test to Tab 1 for a renewal date in a different time zone edge case (renewsOn tomorrow, clock at 23:30 UTC today) and decide the correct expected value (true: due within 3 days).',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'web-system-design-scale',
      title: 'System Design: Job Queues, Load Balancing & Structured Observability',
      summary: 'Move slow work off the request path with background jobs, spread traffic across stateless instances, and make the whole system debuggable with structured logs, correlation ids and the RED metrics.',
      difficulty: 'Advanced',
      minutes: 25,
      xp: 150,
      analogy:
        "A busy restaurant doesn't make diners wait while the dishes are washed. The waiter takes the order and hands a ticket to the kitchen (a job queue); diners get a receipt immediately (202 Accepted). The host spreads guests across tables (load balancing), and every ticket carries the table number (a correlation id), so when a complaint comes in, the manager can trace exactly what happened in the kitchen for that table.",
      intuition: [
        { title: 'Keep the request path fast', body: "Anything slow or unreliable that the user doesn't need to wait for (emails, PDFs, image processing, webhooks to third parties, AI summaries) becomes a background job. The API validates, enqueues and returns `202 Accepted` with a job/resource id the client can poll or subscribe to." },
        { title: 'Jobs must be retry-safe', body: "Workers crash and networks fail, so queues deliver at least once. Make jobs idempotent (a job id or idempotency key per side effect), retry with exponential backoff, and move jobs that keep failing to a dead-letter queue for inspection." },
        { title: 'Stateless instances behind a load balancer', body: "Keep no user state in process memory (sessions in Redis/DB, files in object storage), so any instance can serve any request and you can add or remove instances freely. The load balancer only sends traffic to instances passing health checks." },
        { title: 'Balancing algorithms', body: "Round robin is simple but ignores how busy each server is; least connections adapts to slow requests; consistent hashing sends the same key (user, tenant, cache key) to the same node and only remaps about 1/N of keys when a node is added, versus most keys with `hash % N`." },
        { title: 'Structured logs with correlation ids', body: "Log JSON objects (`level`, `msg`, `requestId`, `userId`, `durationMs`) rather than free text, generate a request id at the edge, pass it to downstream calls and jobs, and include it in every log line, so one id reconstructs the whole story." },
        { title: 'Metrics and traces', body: "For every service track RED: Rate, Errors, Duration (p50/p95/p99), plus queue depth and job age for workers. Distributed tracing (OpenTelemetry) shows where time goes across services. Alert on symptoms users feel (error rate, latency), not on CPU alone." },
      ],
      callouts: [
        { kind: 'architecture', title: 'A scalable request + job flow', body: 'The user-facing path stays short; heavy work happens asynchronously.', flow: ['client', 'load balancer (health checks)', 'stateless API × N (requestId)', 'Postgres + Redis', 'queue → workers × M (retries, DLQ)', 'logs / metrics / traces keyed by requestId'] },
        { kind: 'warning', title: 'Queues hide overload', body: 'A queue absorbs bursts, but if producers are faster than consumers for long, job age grows without bound. Alert on the age of the oldest job, autoscale workers, and apply backpressure (429) at the API when the backlog is too deep.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'system_design_from_scratch.ts',
          explanation: 'Runnable TypeScript simulations: round robin vs least connections under a workload where every third request is slow, key remapping when a node is added with modulo hashing vs a consistent-hash ring with virtual nodes, a job queue with exponential backoff and a dead-letter queue, and structured logs that share one correlation id via AsyncLocalStorage. All asserted.',
          code: raw`//  ADDING A 5TH CACHE NODE (10,000 keys)
//
//   hash % N        : ~80% of keys move  -> cache mostly cold, DB stampede
//   consistent ring : ~20% of keys move  -> only the new node's share
//       ring:  0 ----A----C--B----A--D----C--E(new)----B---- 2^32 (100 virtual nodes each)
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

// ---- 1) load balancing: requests every 10 ms, every 3rd one takes 300 ms
function simulate(pick: (active: number[], i: number) => number): number {
  const active = [0, 0, 0];
  const finishing: Array<{ at: number; server: number }> = [];
  let peak = 0;
  for (let i = 0; i < 60; i++) {
    const t = i * 10;
    for (const f of finishing.filter((x) => x.at <= t)) active[f.server]--;
    finishing.splice(0, finishing.length, ...finishing.filter((x) => x.at > t));
    const s = pick(active, i);
    active[s]++;
    peak = Math.max(peak, ...active);
    finishing.push({ at: t + (i % 3 === 0 ? 300 : 10), server: s });
  }
  return peak;
}
const roundRobin = simulate((_a, i) => i % 3);
const leastConn = simulate((a) => a.indexOf(Math.min(...a)));
assert.ok(roundRobin >= 10 && leastConn <= roundRobin / 2, 'round robin piles slow requests on one server');

// ---- 2) modulo vs consistent hashing
const h = (s: string) => createHash('sha1').update(s).digest().readUInt32BE(0);
const keys = Array.from({ length: 10_000 }, (_, i) => 'user:' + i);
const moduloMoved = keys.filter((k) => h(k) % 4 !== h(k) % 5).length / keys.length;

function ring(nodes: string[]) {
  const points = nodes.flatMap((n) => Array.from({ length: 100 }, (_, v) => ({ at: h(n + '#' + v), node: n })))
    .sort((a, b) => a.at - b.at);
  return (key: string) => { const x = h(key); return (points.find((p) => p.at >= x) ?? points[0]).node; };
}
const before = ring(['A', 'B', 'C', 'D']), after = ring(['A', 'B', 'C', 'D', 'E']);
const ringMoved = keys.filter((k) => before(k) !== after(k)).length / keys.length;
assert.ok(moduloMoved > 0.75, 'modulo remaps most keys');
assert.ok(ringMoved > 0.12 && ringMoved < 0.28, 'consistent hashing remaps ~1/5');
assert.ok(keys.filter((k) => before(k) !== after(k)).every((k) => after(k) === 'E'));   // moved keys only go to E

// ---- 3) job queue with exponential backoff and a dead-letter queue
type Job = { id: string; attempts: number; runAt: number };
function processQueue(jobs: Job[], handler: (j: Job) => boolean, maxAttempts = 4, baseMs = 1000) {
  const done: string[] = [], dlq: string[] = [], schedule: Record<string, number[]> = {};
  const queue = [...jobs];
  while (queue.length) {
    queue.sort((a, b) => a.runAt - b.runAt);
    const job = queue.shift()!;
    job.attempts++;
    (schedule[job.id] ??= []).push(job.runAt);
    if (handler(job)) done.push(job.id);
    else if (job.attempts >= maxAttempts) dlq.push(job.id);
    else queue.push({ ...job, runAt: job.runAt + baseMs * 2 ** (job.attempts - 1) });   // 1s, 2s, 4s ...
  }
  return { done, dlq, schedule };
}
const result = processQueue(
  [{ id: 'email-1', attempts: 0, runAt: 0 }, { id: 'webhook-7', attempts: 0, runAt: 0 }],
  (j) => j.id === 'email-1' ? j.attempts >= 3 : false);              // email recovers, webhook never does
assert.deepEqual(result.done, ['email-1']);
assert.deepEqual(result.dlq, ['webhook-7']);
assert.deepEqual(result.schedule['webhook-7'], [0, 1000, 3000, 7000]);

// ---- 4) structured logs carry the request id automatically
const als = new AsyncLocalStorage<{ requestId: string }>();
const lines: string[] = [];
const log = (msg: string, fields: Record<string, unknown> = {}) =>
  lines.push(JSON.stringify({ level: 'info', msg, ...als.getStore(), ...fields }));
async function handleRequest(requestId: string) {
  await als.run({ requestId }, async () => {
    log('request.start', { path: '/checkout' });
    await Promise.resolve();                                         // context survives await
    log('job.enqueued', { queue: 'emails' });
  });
}
async function main() {
  await Promise.all([handleRequest('req_a'), handleRequest('req_b')]);
  const parsed = lines.map((l) => JSON.parse(l) as { requestId: string; msg: string });
  assert.equal(parsed.filter((l) => l.requestId === 'req_a').length, 2);
  assert.deepEqual(parsed.filter((l) => l.requestId === 'req_b').map((l) => l.msg), ['request.start', 'job.enqueued']);
  console.log('peak in-flight RR', roundRobin, 'vs LC', leastConn, '| moved: modulo', moduloMoved.toFixed(2), 'ring', ringMoved.toFixed(2));
}
main().catch((e) => { console.error(e); process.exit(1); });`,
        },
        production: {
          language: 'ts',
          filename: 'reports.ts',
          explanation: 'Production Node.js: an API endpoint that validates, enqueues a BullMQ job with a deterministic job id (deduplication) and returns 202 with a status URL; a worker with concurrency, exponential backoff and idempotent side effects; and pino structured logging with a per-request id propagated into jobs through AsyncLocalStorage.',
          code: raw`import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { Queue, Worker } from 'bullmq';
import pino from 'pino';

const connection = { url: process.env.REDIS_URL! };
const context = new AsyncLocalStorage<{ requestId: string }>();
const baseLogger = pino({ level: 'info', redact: ['req.headers.authorization', '*.password'] });
const logger = () => baseLogger.child(context.getStore() ?? {});      // every line gets requestId

// ---------- API: accept fast, work later
const reports = new Queue('reports', { connection });
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  const requestId = req.get('x-request-id') ?? randomUUID();
  res.setHeader('x-request-id', requestId);
  const start = performance.now();
  res.on('finish', () => logger().info({ method: req.method, path: req.path, status: res.statusCode,
    durationMs: Math.round(performance.now() - start) }, 'request'));   // RED: rate, errors, duration
  context.run({ requestId }, next);
});

app.post('/api/reports', async (req, res) => {
  const { month } = ReportSchema.parse(req.body);
  const jobId = 'report:' + req.user.tenantId + ':' + month;            // same report twice = one job
  await reports.add('monthly', { tenantId: req.user.tenantId, month, requestId: context.getStore()!.requestId }, {
    jobId,
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },                      // 2s, 4s, 8s, 16s
    removeOnComplete: 1000,
    removeOnFail: false,                                                // keep failures for inspection (DLQ)
  });
  logger().info({ jobId }, 'report.enqueued');
  res.status(202).location('/api/reports/' + encodeURIComponent(jobId)).json({ jobId, status: 'queued' });
});

// ---------- worker (separate process / deployment, scaled independently)
new Worker('reports', async (job) => context.run({ requestId: job.data.requestId }, async () => {
  logger().info({ jobId: job.id, attempt: job.attemptsMade + 1 }, 'report.start');
  const pdf = await renderMonthlyReport(job.data.tenantId, job.data.month);   // slow, CPU/IO heavy
  await storage.put('reports/' + job.id + '.pdf', pdf);                        // overwrite = idempotent
  await email.send({ to: await owners(job.data.tenantId), template: 'report-ready',
                     idempotencyKey: String(job.id) });                         // provider dedupes retries
  logger().info({ jobId: job.id }, 'report.done');
}), { connection, concurrency: 4 })
  .on('failed', (job, err) => logger().error({ jobId: job?.id, err }, 'report.failed'));`,
        },
        bug: {
          explanation:
            'Rendering a PDF and sending email inside the request handler ties up the request for many seconds, hits load-balancer timeouts (the client retries and generates duplicates), and one slow third party makes the whole API slow. Validate, enqueue an idempotent job and return 202 immediately; let workers do the heavy lifting with retries.',
          buggy: {
            language: 'ts',
            filename: 'reports.ts',
            code: raw`// ❌ 20-40 s on the request path: timeouts, duplicate reports on retry, blocked capacity
app.post('/api/reports', async (req, res) => {
  const pdf = await renderMonthlyReport(req.user.tenantId, req.body.month);   // CPU heavy
  await email.send({ to: req.user.email, attachment: pdf });                   // slow third party
  res.json({ ok: true });
});`,
          },
          fixed: {
            language: 'ts',
            filename: 'reports.ts',
            code: raw`// ✅ Accept in milliseconds; the worker renders and emails with retries
app.post('/api/reports', async (req, res) => {
  const { month } = ReportSchema.parse(req.body);
  const jobId = 'report:' + req.user.tenantId + ':' + month;
  await reports.add('monthly', { tenantId: req.user.tenantId, month }, {
    jobId, attempts: 5, backoff: { type: 'exponential', delay: 2000 },
  });
  res.status(202).json({ jobId, status: 'queued' });
});`,
          },
        },
      },
      takeaways: [
        'Move slow, unreliable work to background jobs; return 202 with a job id.',
        'Jobs are delivered at least once: make them idempotent, back off exponentially, dead-letter the rest.',
        'Stateless instances behind health-checked load balancers; least connections for uneven work, consistent hashing for affinity.',
        'Log structured JSON with a correlation id everywhere; watch RED metrics and queue age.',
        'Practice drill: in Tab 1, change the slow-request pattern to every 2nd request and predict whether round robin still overloads one server (with 3 servers, slow requests now rotate across servers 0, 2 and 1).',
      ],
    },
  ],
};
