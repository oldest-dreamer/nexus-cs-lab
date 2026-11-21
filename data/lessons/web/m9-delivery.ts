import type { Module } from '../../types';

const raw = String.raw;
// GitHub Actions expressions start with "$" + "{{"; the samples below interpolate GH deliberately to emit that token
const GH = '$' + '{{';

export const deliveryModule: Module = {
  id: 'web-delivery',
  title: 'Caching, Build Tooling & Deployment',
  level: 'Advanced',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'web-caching-layers',
      title: 'Caching Layers: Browser, CDN & Redis (and Invalidation)',
      summary: 'Use HTTP caching headers precisely, put a CDN in front of the right responses, add a Redis cache-aside layer that survives stampedes, and invalidate without serving stale or private data.',
      difficulty: 'Intermediate',
      minutes: 22,
      xp: 120,
      analogy:
        "Caching is keeping copies closer to where they are needed. Your browser cache is the snacks in your desk drawer, the CDN is the corner shop on your street, Redis is the warehouse next to the kitchen, and the database is the farm. Every copy saves a trip, but each one can go out of date, and you must never put someone else's personal groceries on the corner shop's public shelf.",
      intuition: [
        { title: 'Cache-Control is the contract', body: "`max-age=N`: fresh for N seconds in any cache. `s-maxage`: override for shared caches (CDNs). `private`: only the user's browser may store it. `no-cache`: store, but revalidate before every use. `no-store`: never store. `immutable`: never revalidate during max-age." },
        { title: 'Revalidation is cheap', body: "A stale response with an `ETag` (or `Last-Modified`) is revalidated with `If-None-Match`; an unchanged resource returns `304 Not Modified` with no body. `stale-while-revalidate=60` lets caches serve the stale copy immediately while refreshing in the background." },
        { title: 'The standard recipe', body: "Hashed build assets (`app.3f9a1c.js`): `public, max-age=31536000, immutable`. HTML: `no-cache` (always revalidate, so new deploys are picked up). Public API data: short `s-maxage` + `stale-while-revalidate`. Personal data: `private, no-store` or `private, no-cache`." },
        { title: 'Cache-aside with Redis', body: "Read: try Redis; on a miss, load from the database and store with a TTL. Write: update the database, then delete the cache key (don't try to update both). Add random jitter to TTLs so thousands of keys don't expire in the same second." },
        { title: 'Stampedes', body: "When a hot key expires, hundreds of concurrent requests miss at once and all hit the database. Single-flight (one request recomputes, the rest wait for its result), a short lock in Redis, or early probabilistic refresh prevents it." },
        { title: 'Invalidation and keys', body: "Version cache keys (`product:v3:42`) to invalidate a whole class of entries by bumping the version; purge CDN paths or surrogate keys after content changes. A cache key must include everything the response varies on (user, locale, query params), and responses that vary by header need `Vary`." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Request through the cache hierarchy', body: 'Each layer answers if it has a fresh copy; otherwise it asks the next.', flow: ['browser cache (max-age / ETag)', 'CDN edge (s-maxage, cache key, Vary)', 'API server', 'Redis (cache-aside, TTL + jitter)', 'PostgreSQL'] },
        { kind: 'security', title: 'Web cache poisoning and leaks', body: 'If a CDN caches a personalized response (or one influenced by an unkeyed header), every visitor may receive it. Mark personal responses private/no-store, keep cache keys explicit, and never cache responses that set cookies.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'caching_from_scratch.ts',
          explanation: 'Runnable TypeScript with a fake clock: a Cache-Control interpreter for browser vs shared caches (fresh, stale-while-revalidate, revalidate, not storable), and a cache-aside store with TTL jitter and single-flight that turns 100 concurrent misses into one database query. All asserted.',
          code: raw`//  100 CONCURRENT REQUESTS FOR AN EXPIRED HOT KEY
//
//   without single-flight:  100 misses -> 100 DB queries   (stampede)
//   with single-flight:     1 request loads, 99 await the same Promise -> 1 DB query
import assert from 'node:assert/strict';

type Decision = 'not-storable' | 'fresh' | 'serve-stale-and-refresh' | 'revalidate';
function decide(cacheControl: string, ageSec: number, shared: boolean): Decision {
  const d = new Map(cacheControl.split(',').map((p) => {
    const [k, v] = p.trim().split('=');
    return [k.toLowerCase(), v === undefined ? true : Number(v)] as const;
  }));
  if (d.has('no-store') || (shared && d.has('private'))) return 'not-storable';
  if (d.has('no-cache')) return 'revalidate';
  const sMaxAge = shared ? d.get('s-maxage') : undefined;              // s-maxage applies to shared caches only
  const maxAge = Number(sMaxAge ?? d.get('max-age') ?? 0);
  if (ageSec < maxAge) return 'fresh';
  const swr = Number(d.get('stale-while-revalidate') ?? 0);
  return ageSec < maxAge + swr ? 'serve-stale-and-refresh' : 'revalidate';
}
assert.equal(decide('public, max-age=31536000, immutable', 86_400, true), 'fresh');      // hashed asset
assert.equal(decide('no-cache', 0, false), 'revalidate');                                 // HTML
assert.equal(decide('private, max-age=60', 10, true), 'not-storable');                    // CDN must skip
assert.equal(decide('private, max-age=60', 10, false), 'fresh');                          // browser may keep it
assert.equal(decide('public, max-age=10, s-maxage=60, stale-while-revalidate=30', 45, true), 'fresh');
assert.equal(decide('public, max-age=10, s-maxage=60, stale-while-revalidate=30', 75, true), 'serve-stale-and-refresh');
assert.equal(decide('public, max-age=10, s-maxage=60, stale-while-revalidate=30', 95, true), 'revalidate');

// ---- cache-aside with TTL jitter and single-flight
let now = 0, dbQueries = 0;
const store = new Map<string, { value: string; expires: number }>();
const inflight = new Map<string, Promise<string>>();
const loadFromDb = async (key: string) => { dbQueries++; await new Promise((r) => setTimeout(r, 5)); return 'value-of-' + key; };
const ttlWithJitter = (base: number, rnd: number) => Math.round(base * (0.9 + 0.2 * rnd));   // +/-10%

async function get(key: string, singleFlight: boolean): Promise<string> {
  const hit = store.get(key);
  if (hit && hit.expires > now) return hit.value;
  if (singleFlight && inflight.has(key)) return inflight.get(key)!;          // join the running load
  const p = loadFromDb(key).then((value) => {
    store.set(key, { value, expires: now + ttlWithJitter(300, 0.5) * 1000 });
    return value;
  }).finally(() => inflight.delete(key));
  if (singleFlight) inflight.set(key, p);
  return p;
}

async function main() {
  await Promise.all(Array.from({ length: 100 }, () => get('product:42', false)));
  assert.equal(dbQueries, 100);                                              // stampede
  store.clear(); dbQueries = 0;
  const values = await Promise.all(Array.from({ length: 100 }, () => get('product:42', true)));
  assert.equal(dbQueries, 1);                                                // single flight
  assert.ok(values.every((v) => v === 'value-of-product:42'));
  await get('product:42', true);
  assert.equal(dbQueries, 1);                                                // served from cache
  now += 301_000;                                                            // past the (jittered) TTL
  await get('product:42', true);
  assert.equal(dbQueries, 2);
  assert.deepEqual([0, 0.5, 1].map((r) => ttlWithJitter(300, r)), [270, 300, 330]);
  console.log('stampede queries: 100 -> 1 with single-flight');
}
main().catch((e) => { console.error(e); process.exit(1); });`,
        },
        production: {
          language: 'ts',
          filename: 'cache.ts',
          explanation: 'Production Express + Redis: Cache-Control policies per response type (immutable hashed assets, revalidated HTML, CDN-cached public API, private user data), and a cache-aside helper with jittered TTL, a short Redis lock for stampede protection and delete-on-write invalidation with versioned keys.',
          code: raw`import express from 'express';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);
const app = express();

// ---------- HTTP caching policies
app.use('/assets', express.static('dist/assets', {
  setHeaders: (res) => res.setHeader('cache-control', 'public, max-age=31536000, immutable'),   // hashed names
}));
app.get(['/', '/app/*splat'], (_req, res) => {
  res.setHeader('cache-control', 'no-cache');                     // always revalidate: new deploys show up
  res.sendFile('index.html', { root: 'dist' });
});

// ---------- cache-aside with stampede protection
const KEY_VERSION = 'v3';                                         // bump to invalidate every product key
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function cached<T>(key: string, ttlSec: number, load: () => Promise<T>): Promise<T> {
  const k = KEY_VERSION + ':' + key;
  for (let attempt = 0; attempt < 50; attempt++) {
    const hit = await redis.get(k);
    if (hit) return JSON.parse(hit) as T;
    const gotLock = await redis.set(k + ':lock', '1', 'PX', 5000, 'NX');   // only one loader
    if (gotLock) {
      try {
        const value = await load();
        const ttl = Math.round(ttlSec * (0.9 + Math.random() * 0.2));      // jitter: no synchronized expiry
        await redis.set(k, JSON.stringify(value), 'EX', ttl);
        return value;
      } finally {
        await redis.del(k + ':lock');
      }
    }
    await sleep(50);                                              // someone else is loading: wait and re-check
  }
  return load();                                                  // give up waiting; fail open
}

app.get('/api/products/:id', async (req, res) => {
  const product = await cached('product:' + req.params.id, 300, () => db.products.find(req.params.id));
  res.setHeader('cache-control', 'public, max-age=30, s-maxage=300, stale-while-revalidate=60');
  res.json(product);
});

app.put('/api/products/:id', async (req, res) => {
  const updated = await db.products.update(req.params.id, req.body);
  await redis.del(KEY_VERSION + ':product:' + req.params.id);     // write DB, then delete the cache entry
  await cdn.purge(['/api/products/' + req.params.id]);            // and the edge copy
  res.json(updated);
});

app.get('/api/me', requireAuth, async (req, res) => {
  res.setHeader('cache-control', 'private, no-store');            // personal: never in shared caches
  res.json(await db.users.profile(req.userId));
});`,
        },
        bug: {
          explanation:
            'Marking a personalized endpoint as public lets the CDN store the first user\'s profile under the URL /api/me and serve it to everyone else for five minutes: a data leak caused by one header. Personalized responses must be private (or no-store); if a CDN must cache per-user data, the user identity has to be part of the cache key.',
          buggy: {
            language: 'ts',
            filename: 'me.route.ts',
            code: raw`// ❌ "Speed up the profile page": the CDN now serves Alice's profile to Bob
app.get('/api/me', requireAuth, async (req, res) => {
  res.setHeader('cache-control', 'public, max-age=300');
  res.json(await db.users.profile(req.userId));
});`,
          },
          fixed: {
            language: 'ts',
            filename: 'me.route.ts',
            code: raw`// ✅ Personal data stays out of shared caches; speed comes from a server-side cache instead
app.get('/api/me', requireAuth, async (req, res) => {
  res.setHeader('cache-control', 'private, no-store');
  res.setHeader('vary', 'Cookie, Authorization');
  res.json(await cached('profile:' + req.userId, 60, () => db.users.profile(req.userId)));
});`,
          },
        },
      },
      takeaways: [
        'Cache-Control decides who may store a response and for how long; private keeps it out of CDNs.',
        'Hashed assets: immutable for a year; HTML: no-cache; public API: s-maxage + stale-while-revalidate.',
        'Cache-aside: read-through on miss, delete on write, jitter TTLs, single-flight hot keys.',
        'Never publicly cache personalized responses; include every varying input in the cache key.',
        'Practice drill: with decide() in Tab 1, find the ages at which "public, max-age=0, s-maxage=120, stale-while-revalidate=60" is fresh, stale-and-refresh and revalidate for a CDN (0–119 s, 120–179 s, 180 s+).',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'web-vite-bundling-secrets',
      title: 'Vite 8 (Rolldown) Bundling, Code Splitting & Frontend Secret Hygiene',
      summary: 'What a bundler does to your source, how dynamic import() creates lazily loaded chunks, and the one rule about environment variables that keeps API keys out of every user\'s browser.',
      difficulty: 'Intermediate',
      minutes: 22,
      xp: 120,
      analogy:
        "A bundler is a moving company packing your house. It follows every import like a list of rooms, leaves behind what nobody uses (tree-shaking), and packs boxes. Code splitting is labelling some boxes \"deliver later\" so moving day starts with only the kitchen. And everything packed into the truck is visible to anyone who opens it: a `VITE_` variable is a note taped to the outside of a box. Never write your bank PIN on it.",
      intuition: [
        { title: 'Dev server vs production build', body: "`vite` (dev) serves native ES modules on demand with instant hot updates. `vite build` bundles for production: resolves the import graph, tree-shakes unused exports, minifies, and writes content-hashed files (`index-3f9a1c.js`) that can be cached forever. Vite 8 does this with Rolldown, a Rust bundler, which is why build output and config mention rolldown." },
        { title: 'Chunks come from the import graph', body: "Static imports end up in the same chunk as their importer. Each `import('./Page')` (dynamic import) starts a new chunk that is downloaded only when that code runs. `React.lazy(() => import('./Settings'))` + `<Suspense>` turns routes and heavy widgets into on-demand chunks." },
        { title: 'Measure the initial bundle', body: "Users pay for the JavaScript needed for the first screen: download, parse and execute. Lazy-load routes, editors, charts and labs; keep shared vendor code cacheable; check the build report and fix chunk-size warnings by splitting at route boundaries." },
        { title: 'The VITE_ rule', body: "Vite exposes environment variables to client code only if they start with `VITE_` (configurable via `envPrefix`). They are replaced with string literals at build time, so the value is in the JavaScript file every visitor downloads. Treat every `VITE_` variable as public." },
        { title: 'What is safe in the frontend', body: "Public identifiers designed for browsers: a Supabase publishable/anon key protected by RLS, a Stripe publishable key, analytics site IDs. Never: OpenAI/LLM keys, database URLs, service-role keys, JWT secrets, webhook secrets or admin tokens." },
        { title: 'Secrets go behind your server', body: "The browser calls your API (`/api/summarize`), the server reads `process.env.OPENAI_API_KEY` (no `VITE_` prefix), checks the user's session and rate limit, and calls the provider. If a secret ever shipped in a bundle, rotate it: deleting the line does not remove it from old builds, caches or git history." },
      ],
      callouts: [
        { kind: 'architecture', title: 'From source to cached chunks', body: 'Dynamic imports are the seams where chunks are cut.', flow: ['src/main.tsx (entry)', 'import graph + tree-shaking', 'static imports → entry chunk', 'import() → lazy chunks', 'minify + content hash names', 'dist/ served with immutable caching'] },
        { kind: 'security', title: 'Audit what you ship', body: 'After every build, search dist/ for secret patterns (sk_live_, sk-, -----BEGIN, service_role, postgres://) in CI and fail the pipeline on a match.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'bundler_and_env_from_scratch.ts',
          explanation: 'Runnable TypeScript: a model of Vite\'s env handling (only VITE_-prefixed variables are exposed and statically replaced into the bundle text), a CI-style secret scanner that catches a leaked key in the output, and an import-graph walker that computes initial vs lazily loaded bytes with and without dynamic imports. All asserted.',
          code: raw`//  IMPORT GRAPH (kB)                       initial download
//
//   main(20) --static--> App(15) --static--> Dashboard(40)       all static: 20+15+40+180+300 = 555 kB
//                          |-- import() --> Editor(180)          lazy routes: 20+15+40 = 75 kB
//                          '-- import() --> Charts(300)          (Editor, Charts load on demand)
import assert from 'node:assert/strict';

// ---- env exposure: only VITE_* reaches client code, as literal strings
const dotenv = { VITE_API_URL: 'https://api.example.com', VITE_OPENAI_KEY: 'sk-proj-abc123def456ghi789',
                 DATABASE_URL: 'postgres://admin:pw@db/app', OPENAI_API_KEY: 'sk-proj-server-only-000111' };
const clientEnv = Object.fromEntries(Object.entries(dotenv).filter(([k]) => k.startsWith('VITE_')));
assert.deepEqual(Object.keys(clientEnv), ['VITE_API_URL', 'VITE_OPENAI_KEY']);

const source = "fetch(import.meta.env.VITE_API_URL + '/chat', { headers: { authorization: 'Bearer ' + import.meta.env.VITE_OPENAI_KEY } })";
const bundle = source.replace(/import\.meta\.env\.(\w+)/g, (_, name: string) =>
  name in clientEnv ? JSON.stringify(clientEnv[name]) : 'undefined');          // static replacement at build time
assert.ok(bundle.includes('"sk-proj-abc123def456ghi789"'));                    // the key is now public
assert.ok(!bundle.includes('postgres://'));                                     // non-VITE_ vars never leak

// ---- CI secret scan over build output
const SECRET_PATTERNS = [/sk-(proj-)?[A-Za-z0-9]{16,}/, /sk_live_[A-Za-z0-9]{16,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /postgres(ql)?:\/\/[^\s"']+:[^\s"']+@/];
const scan = (text: string) => SECRET_PATTERNS.filter((p) => p.test(text)).length;
assert.equal(scan(bundle), 1);                                                  // CI should fail this build
assert.equal(scan("fetch('/api/chat', { method: 'POST' })"), 0);               // the fixed client code

// ---- chunking: walk static edges for the initial download, dynamic edges become lazy chunks
type Mod = { kb: number; static: string[]; dynamic: string[] };
function initialKb(graph: Record<string, Mod>, entry: string): number {
  const seen = new Set<string>();
  const visit = (m: string) => { if (seen.has(m)) return; seen.add(m); graph[m].static.forEach(visit); };
  visit(entry);
  return [...seen].reduce((s, m) => s + graph[m].kb, 0);
}
const lazyGraph: Record<string, Mod> = {
  main: { kb: 20, static: ['App'], dynamic: [] },
  App: { kb: 15, static: ['Dashboard'], dynamic: ['Editor', 'Charts'] },
  Dashboard: { kb: 40, static: [], dynamic: [] },
  Editor: { kb: 180, static: [], dynamic: [] },
  Charts: { kb: 300, static: [], dynamic: [] },
};
const eagerGraph = { ...lazyGraph, App: { kb: 15, static: ['Dashboard', 'Editor', 'Charts'], dynamic: [] } };
assert.equal(initialKb(eagerGraph, 'main'), 555);
assert.equal(initialKb(lazyGraph, 'main'), 75);
console.log('leaked keys in bundle:', scan(bundle), '| initial kB eager vs lazy:', initialKb(eagerGraph, 'main'), initialKb(lazyGraph, 'main'));`,
        },
        production: {
          language: 'tsx',
          filename: 'router.tsx',
          explanation: 'Production React 19 + Vite: route-level code splitting with React.lazy and Suspense, prefetching a chunk on hover/focus so navigation feels instant, and a typed client-config module that only reads public VITE_ values (the secret-holding calls live behind /api). Vite 8 code-splits automatically at every dynamic import.',
          code: raw`import { lazy, Suspense, useState, type ComponentType } from 'react';

// ---- typed, public-only client config (see src/vite-env.d.ts for ImportMetaEnv)
export const config = {
  apiBase: import.meta.env.VITE_API_URL ?? '/api',            // public by definition
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,             // publishable values only, RLS protects data
} as const;

// ---- lazy routes: each import() becomes its own chunk in dist/assets
type Loader = () => Promise<{ default: ComponentType }>;
function lazyRoute(load: Loader) {
  const Component = lazy(load);
  return Object.assign(Component, { preload: load });          // the same import() warms the module cache
}

const routes = {
  '/': lazyRoute(() => import('./pages/Dashboard')),
  '/editor': lazyRoute(() => import('./pages/Editor')),       // heavy: code editor
  '/reports': lazyRoute(() => import('./pages/Reports')),     // heavy: charting library
} satisfies Record<string, ComponentType & { preload: Loader }>;

type Path = keyof typeof routes;

export function App() {
  const [path, setPath] = useState<Path>('/');
  const Page = routes[path];
  return (
    <>
      <nav>
        {(Object.keys(routes) as Path[]).map((p) => (
          <a key={p} href={p}
             onMouseEnter={() => void routes[p].preload()}      // start downloading on intent
             onFocus={() => void routes[p].preload()}
             onClick={(e) => { e.preventDefault(); setPath(p); }}>
            {p === '/' ? 'Home' : p.slice(1)}
          </a>
        ))}
      </nav>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-panel" aria-busy="true" />}>
        <Page />
      </Suspense>
    </>
  );
}

// AI features call our own API; the provider key exists only on the server
export async function summarize(text: string): Promise<string> {
  const res = await fetch(config.apiBase + '/summarize', {
    method: 'POST', credentials: 'include',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return ((await res.json()) as { summary: string }).summary;
}`,
        },
        bug: {
          explanation:
            'Anything prefixed VITE_ is compiled into the JavaScript bundle as a plain string, so this API key is visible to every visitor in DevTools and can be used to run up your bill or access your account. Move the call behind your own authenticated, rate-limited endpoint that reads a non-VITE_ server variable, and rotate the leaked key immediately.',
          buggy: {
            language: 'ts',
            filename: 'summarize.ts',
            code: raw`// ❌ The secret ships to every browser: dist/assets/index-*.js contains "sk-..."
export async function summarize(text: string) {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer ' + import.meta.env.VITE_OPENAI_API_KEY,
    },
    body: JSON.stringify({ model: 'gpt-4.1-mini', input: 'Summarize: ' + text }),
  });
  return res.json();
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'summarize.ts',
            code: raw`// ✅ Browser -> our API (session + rate limit) -> provider. Key lives only on the server.
// client
export async function summarize(text: string) {
  const res = await fetch('/api/summarize', {
    method: 'POST', credentials: 'include',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

// server (Node): process.env.OPENAI_API_KEY has no VITE_ prefix, so Vite never bundles it
app.post('/api/summarize', requireAuth, rateLimit(20, 0.2), async (req, res) => {
  const { text } = SummarizeSchema.parse(req.body);              // bounded length
  res.json({ summary: await llm.summarize(text, { apiKey: process.env.OPENAI_API_KEY! }) });
});`,
          },
        },
      },
      takeaways: [
        'vite build follows the import graph, tree-shakes, minifies and hashes file names (Rolldown in Vite 8).',
        'Every import() is a chunk boundary: lazy-load routes and heavy widgets with React.lazy + Suspense.',
        'Only VITE_-prefixed variables reach the client, and they are public: never put secrets there.',
        'Proxy secret-holding calls through your server, scan dist/ for secrets in CI, and rotate anything that leaked.',
        'Practice drill: run npm run build in this project and find which labs are emitted as separate chunks (they are lazy-loaded in src/labs/index.tsx), then compute how much of the total JS the first screen needs.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'web-docker-cicd',
      title: 'Docker Basics & CI/CD Pipelines',
      summary: 'Package an app into a small, secure, reproducible image with multi-stage builds and good layer ordering, then automate checks and deployments with a CI/CD pipeline that never leaks secrets.',
      difficulty: 'Intermediate',
      minutes: 22,
      xp: 120,
      analogy:
        "A Docker image is a shipping container: whatever is inside runs the same on a laptop, a CI runner or a cloud server. Each Dockerfile instruction adds a layer, like stacked transparent sheets; if a sheet changes, every sheet above it must be redrawn. CI/CD is the factory's quality-control conveyor belt: every change passes the same inspections, in the same order, before it is allowed onto the delivery truck.",
      intuition: [
        { title: 'Images, layers and the cache', body: "Each instruction (`COPY`, `RUN`) creates a layer, cached by its inputs. When an input changes, that layer and every later layer rebuild. Copy `package.json` + lockfile and run `npm ci` before copying the source, so editing a component doesn't reinstall all dependencies." },
        { title: 'Multi-stage builds', body: "A build stage has compilers and devDependencies; the final stage copies only the build output and production dependencies. Smaller images download faster and contain fewer vulnerable packages." },
        { title: 'Runtime hygiene', body: "Run as a non-root user, pin base image versions, add a `.dockerignore` (node_modules, .git, .env), add a HEALTHCHECK, and handle SIGTERM for graceful shutdown. Secrets are injected at runtime (environment or secret mounts), never baked into layers with ARG/ENV or COPY." },
        { title: 'Continuous integration', body: "On every pull request: install with the lockfile, lint, type-check, run unit and integration tests, build, and scan. The pipeline is the definition of \"done\"; a red build blocks the merge." },
        { title: 'Continuous delivery', body: "On merge to main: build the image once, tag it with the commit SHA, push it, deploy the same artifact to staging, run smoke tests, then promote to production (manually approved or automatic), with a one-command rollback to the previous SHA." },
        { title: 'Pipeline security', body: "Grant the workflow token minimal permissions, keep secrets out of pull requests from forks, never echo secrets, prefer short-lived OIDC credentials to long-lived cloud keys, and pin third-party actions." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Pipeline stages', body: 'The same image that passed tests is the one deployed.', flow: ['pull request: install → lint → typecheck → test → build', 'merge to main', 'docker build (tag = commit SHA) → push', 'deploy to staging → smoke tests', 'approve → deploy to production', 'rollback = redeploy previous SHA'] },
        { kind: 'tip', title: 'Reproducible installs', body: 'Use npm ci (exact lockfile, clean install) in CI and Docker, never npm install. Commit the lockfile and update dependencies in dedicated PRs.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'layer_cache_and_pipeline.ts',
          explanation: 'Runnable TypeScript: a Docker layer-cache simulator that shows why copying the lockfile before the source avoids reinstalling dependencies, a multi-stage size comparison, and a topological sort of CI jobs (with cycle detection) that produces a valid execution order. All asserted.',
          code: raw`//  LAYER CACHE AFTER EDITING src/App.tsx
//
//   bad order                       good order
//   1 FROM node:22-slim   cached    1 FROM node:22-slim          cached
//   2 COPY . .            CHANGED   2 COPY package*.json ./      cached
//   3 RUN npm ci          rebuild   3 RUN npm ci                 cached  (the slow step)
//   4 RUN npm run build   rebuild   4 COPY . .                   CHANGED
//                                   5 RUN npm run build          rebuild
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

type Step = { op: 'FROM' | 'COPY' | 'RUN'; arg: string; inputs?: string[]; seconds: number };
const files: Record<string, string> = { 'package.json': '{"deps":1}', 'package-lock.json': 'lock-v1', 'src/App.tsx': 'v1' };

function build(steps: Step[], cache: Set<string>): { rebuilt: number[]; seconds: number } {
  let parent = '', seconds = 0;
  const rebuilt: number[] = [];
  steps.forEach((s, i) => {
    const inputs = (s.inputs ?? []).map((f) => f + '=' + files[f]).join('|');
    const key = createHash('sha256').update(parent + s.op + s.arg + inputs).digest('hex');   // depends on parent
    if (!cache.has(key)) { rebuilt.push(i + 1); seconds += s.seconds; cache.add(key); }
    parent = key;
  });
  return { rebuilt, seconds };
}

const all = Object.keys(files);
const badOrder: Step[] = [
  { op: 'FROM', arg: 'node:22-slim', seconds: 0 },
  { op: 'COPY', arg: '. .', inputs: all, seconds: 1 },
  { op: 'RUN', arg: 'npm ci', seconds: 90 },
  { op: 'RUN', arg: 'npm run build', seconds: 20 },
];
const goodOrder: Step[] = [
  { op: 'FROM', arg: 'node:22-slim', seconds: 0 },
  { op: 'COPY', arg: 'package*.json ./', inputs: ['package.json', 'package-lock.json'], seconds: 1 },
  { op: 'RUN', arg: 'npm ci', seconds: 90 },
  { op: 'COPY', arg: '. .', inputs: all, seconds: 1 },
  { op: 'RUN', arg: 'npm run build', seconds: 20 },
];
const badCache = new Set<string>(), goodCache = new Set<string>();
build(badOrder, badCache); build(goodOrder, goodCache);              // first builds fill the caches
files['src/App.tsx'] = 'v2';                                          // a typical code change
assert.deepEqual(build(badOrder, badCache), { rebuilt: [2, 3, 4], seconds: 111 });
assert.deepEqual(build(goodOrder, goodCache), { rebuilt: [4, 5], seconds: 21 });

// multi-stage: the final image keeps only what runs
const buildStageMb = { base: 180, nodeModulesAll: 420, src: 5, dist: 3 };
const finalMb = buildStageMb.base + 60 /* prod-only node_modules */ + buildStageMb.dist;
assert.equal(buildStageMb.base + buildStageMb.nodeModulesAll + buildStageMb.src + buildStageMb.dist, 608);
assert.equal(finalMb, 243);

// CI jobs as a DAG: run each job after its dependencies
function order(jobs: Record<string, string[]>): string[] {
  const out: string[] = [], state = new Map<string, 'visiting' | 'done'>();
  const visit = (j: string) => {
    if (state.get(j) === 'done') return;
    if (state.get(j) === 'visiting') throw new Error('cycle at ' + j);
    state.set(j, 'visiting');
    jobs[j].forEach(visit);
    state.set(j, 'done'); out.push(j);
  };
  Object.keys(jobs).forEach(visit);
  return out;
}
const pipeline = { install: [], lint: ['install'], typecheck: ['install'], test: ['install'],
                   build: ['lint', 'typecheck', 'test'], image: ['build'], 'deploy-staging': ['image'], 'deploy-prod': ['deploy-staging'] };
const seq = order(pipeline);
assert.equal(seq[0], 'install');
assert.ok(seq.indexOf('build') > Math.max(seq.indexOf('lint'), seq.indexOf('typecheck'), seq.indexOf('test')));
assert.equal(seq[seq.length - 1], 'deploy-prod');
assert.throws(() => order({ a: ['b'], b: ['a'] }), /cycle/);
console.log('rebuild after code change: bad order 111 s, good order 21 s | pipeline:', seq.join(' -> '));`,
        },
        production: {
          language: 'text',
          filename: 'Dockerfile',
          explanation: 'Production multi-stage Dockerfile for a Node/TypeScript API that also serves the Vite build: dependency layers ordered for caching, a BuildKit cache mount for npm, devDependencies dropped from the final image, a non-root user, a health check and a proper init for signals. Secrets are provided at runtime, never at build time.',
          code: raw`# syntax=docker/dockerfile:1
# ---------- 1) deps: cached until package*.json changes
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# ---------- 2) build: compile the API and the Vite frontend
FROM deps AS build
COPY . .
RUN npm run build && npm prune --omit=dev          # keep only production dependencies

# ---------- 3) runtime: small, non-root, no compilers, no source
FROM node:22-slim AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./
USER node                                           # never run as root
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]                 # forwards SIGTERM for graceful shutdown
CMD ["node", "dist/server.js"]

# .dockerignore (next to this file):
#   node_modules  dist  .git  .env*  coverage  *.log
# Secrets: docker run -e DATABASE_URL=... or your platform's secret store, never ARG/ENV here.`,
        },
        bug: {
          explanation:
            'pull_request_target runs with repository secrets and write permissions, so checking out and running code from a fork\'s pull request lets anyone exfiltrate the deploy token; echoing a secret puts it in logs. Run untrusted PR code with the pull_request event and read-only permissions, deploy only from main, and use short-lived OIDC credentials.',
          buggy: {
            language: 'text',
            filename: '.github/workflows/ci.yml',
            code: raw`# ❌ Fork PRs run with secrets and a write token; the secret is printed to the log
on: pull_request_target
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${GH} github.event.pull_request.head.sha }}    # untrusted code...
      - run: npm install && npm test                         # ...executed with secrets available
      - run: echo "deploying with ${GH} secrets.DEPLOY_TOKEN }}"
      - run: ./deploy.sh`,
          },
          fixed: {
            language: 'text',
            filename: '.github/workflows/ci.yml',
            code: raw`# ✅ Untrusted code gets no secrets; deploys only from main with short-lived OIDC credentials
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read                                   # least privilege for every job by default
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run lint && npm run typecheck && npm test && npm run build
  deploy:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    needs: ci
    runs-on: ubuntu-latest
    environment: production                        # protected: required reviewers
    permissions:
      contents: read
      id-token: write                              # OIDC token instead of a stored cloud key
    steps:
      - uses: actions/checkout@v4
      - run: ./deploy.sh "${GH} github.sha }}"`,
          },
        },
      },
      takeaways: [
        'Order Dockerfile layers from least to most frequently changing: lockfile and npm ci before the source.',
        'Multi-stage builds ship only runtime artifacts; run as non-root with a health check and signal handling.',
        'CI runs the same checks on every PR; CD deploys the exact image that passed, tagged by commit SHA.',
        'Keep secrets out of images, logs and fork PRs; use least-privilege tokens and OIDC.',
        'Practice drill: in Tab 1, change package-lock.json instead of src/App.tsx and predict which steps rebuild in the good order ([2, 3, 4, 5]: the dependency layer changed).',
      ],
    },
  ],
};
