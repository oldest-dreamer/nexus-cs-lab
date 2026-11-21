import type { Module } from '../../types';

const raw = String.raw;

export const howTheWebWorksModule: Module = {
  id: 'web-how-the-web-works',
  title: 'How the Web Works Under the Hood',
  level: 'Scratch',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'web-dns-tcp-tls',
      title: 'DNS Resolution, TCP & the TLS 1.3 Handshake',
      summary: 'Everything that happens between pressing Enter and the first byte of HTML: name lookup, connection setup, encryption, and why round trips decide how fast a page feels.',
      difficulty: 'Scratch',
      minutes: 20,
      xp: 80,
      analogy:
        "Visiting a website is like visiting a friend in a big city. First you look up their address in the phone book (DNS). Then you walk to the door and knock until someone answers (the TCP handshake). Before talking about anything private, you agree on a secret code only the two of you know (TLS). Only then do you ask your question (the HTTP request). Each step is a trip there and back, and the trips add up.",
      intuition: [
        { title: 'The URL is parsed first', body: "`https://shop.example.com/cart` gives the scheme (`https` → port 443 and TLS), the host (`shop.example.com`) and the path (`/cart`). The host must become an IP address before any packet can be sent." },
        { title: 'DNS is a chain of caches', body: "The browser cache, then the OS cache, then a recursive resolver (your ISP or 1.1.1.1). On a miss, the resolver asks a root server (\"who handles .com?\"), then the .com TLD server (\"who handles example.com?\"), then the authoritative server, which returns the A/AAAA record. Every answer carries a TTL that says how long it may be cached." },
        { title: 'TCP: the three-way handshake', body: "The client sends SYN, the server replies SYN-ACK, and the client sends ACK. That costs one round trip (RTT) before any data can flow. TCP then guarantees in-order, reliable delivery." },
        { title: 'TLS 1.3: one more round trip', body: "ClientHello (with a key share) → ServerHello + certificate + Finished. The client verifies the certificate chain against trusted roots and the hostname, and both sides derive the same session keys. TLS 1.3 needs 1 RTT (TLS 1.2 needed 2). Resumed sessions can send 0-RTT data, but that data can be replayed, so only safe, idempotent requests should use it." },
        { title: 'Count the round trips', body: "At 50 ms RTT, a cold HTTPS request over TCP + TLS 1.3 costs DNS (1) + TCP (1) + TLS (1) + request (1) = 4 RTT = 200 ms before the first byte, ignoring server time. With TLS 1.2 it is 250 ms. HTTP/3 over QUIC merges transport and TLS setup: 150 ms. A reused connection: just 50 ms." },
        { title: 'Why this matters for engineers', body: "Fewer origins, connection reuse (keep-alive), `preconnect` hints for critical third-party origins, a CDN close to users (smaller RTT) and sensible DNS TTLs usually save more time than micro-optimizing JavaScript." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Cold HTTPS request timeline', body: 'Each arrow is at least one network round trip.', flow: ['URL parse', 'DNS lookup (cache → resolver → root → TLD → authoritative)', 'TCP SYN / SYN-ACK / ACK', 'TLS 1.3 hello + certificate', 'HTTP request', 'first byte (TTFB)'] },
        { kind: 'security', title: 'The certificate check is the security', body: 'Encryption without authentication is useless: TLS protects you because the browser checks that the certificate chains to a trusted root and matches the hostname. Never disable certificate verification in server code (for example `rejectUnauthorized: false`), even "just for testing".' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'dns_and_rtt_from_scratch.ts',
          explanation: 'Runnable TypeScript: an iterative DNS resolver over an in-memory set of root, TLD and authoritative servers with TTL caching, plus a round-trip budget calculator for TLS 1.2, TLS 1.3, HTTP/3 and reused connections. Every number from the intuition steps is asserted.',
          code: raw`//  ITERATIVE DNS RESOLUTION (cache miss)
//
//   browser -> resolver: "shop.example.com?"
//   resolver -> root (.)         : ask the .com servers
//   resolver -> .com TLD         : ask ns1.example.com
//   resolver -> ns1.example.com  : A 93.184.216.34  (TTL 300 s)
//   resolver -> browser          : 93.184.216.34   (cached until TTL expires)
import assert from 'node:assert/strict';

type Answer = { kind: 'referral'; next: string } | { kind: 'record'; ip: string; ttl: number };
const SERVERS: Record<string, (name: string) => Answer> = {
  root: (n) => ({ kind: 'referral', next: n.endsWith('.com') ? 'tld-com' : 'tld-org' }),
  'tld-com': (n) => ({ kind: 'referral', next: n.endsWith('example.com') ? 'ns1.example.com' : 'unknown' }),
  'ns1.example.com': (n) => (n === 'shop.example.com'
    ? { kind: 'record', ip: '93.184.216.34', ttl: 300 }
    : { kind: 'record', ip: '0.0.0.0', ttl: 60 }),
};

const cache = new Map<string, { ip: string; expires: number }>();
let queries = 0;

function resolve(name: string, now: number): { ip: string; hops: string[] } {
  const hit = cache.get(name);
  if (hit && hit.expires > now) return { ip: hit.ip, hops: ['cache'] };
  const hops: string[] = [];
  let server = 'root';
  for (;;) {
    queries++;
    hops.push(server);
    const ans = SERVERS[server](name);
    if (ans.kind === 'record') {
      cache.set(name, { ip: ans.ip, expires: now + ans.ttl * 1000 });
      return { ip: ans.ip, hops };
    }
    server = ans.next;
  }
}

const cold = resolve('shop.example.com', 0);
assert.equal(cold.ip, '93.184.216.34');
assert.deepEqual(cold.hops, ['root', 'tld-com', 'ns1.example.com']);
assert.deepEqual(resolve('shop.example.com', 299_000).hops, ['cache']);          // within TTL
assert.deepEqual(resolve('shop.example.com', 300_001).hops.length, 3);          // TTL expired
assert.equal(queries, 6);

// Round trips before the first byte of the response (server think time ignored)
const RTT = 50;
const setupRtts = { 'tcp+tls1.2': 1 + 2, 'tcp+tls1.3': 1 + 1, 'quic (http/3)': 1, reused: 0 };
const ttfb = (setup: number, dnsCached: boolean) => ((dnsCached ? 0 : 1) + setup + 1) * RTT;
assert.equal(ttfb(setupRtts['tcp+tls1.3'], false), 200);
assert.equal(ttfb(setupRtts['tcp+tls1.2'], false), 250);
assert.equal(ttfb(setupRtts['quic (http/3)'], false), 150);
assert.equal(ttfb(setupRtts.reused, true), 50);
console.log('resolved', cold.ip, 'via', cold.hops.join(' -> '), '| cold TLS 1.3 TTFB', ttfb(2, false), 'ms');`,
        },
        production: {
          language: 'ts',
          filename: 'connection-diagnostics.ts',
          explanation: 'Production Node.js (no dependencies): a diagnostic script that times each phase separately (DNS, TCP connect, TLS handshake) and reports the negotiated TLS version, ALPN protocol and certificate expiry. Useful in incident response and in CI health checks for your own domains.',
          code: raw`// usage: npx tsx connection-diagnostics.ts example.com
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import tls from 'node:tls';
import { performance } from 'node:perf_hooks';

async function diagnose(host: string, port = 443) {
  const t0 = performance.now();
  const { address, family } = await lookup(host);            // OS resolver (respects /etc/hosts, caches)
  const tDns = performance.now();

  const socket = net.connect({ host: address, port });       // TCP three-way handshake
  await new Promise<void>((ok, fail) => { socket.once('connect', ok); socket.once('error', fail); });
  const tTcp = performance.now();

  const secure = tls.connect({
    socket,
    servername: host,                                        // SNI: which certificate we want
    ALPNProtocols: ['h2', 'http/1.1'],                       // let the server pick HTTP/2 if supported
    // rejectUnauthorized defaults to true: NEVER turn it off
  });
  await new Promise<void>((ok, fail) => { secure.once('secureConnect', ok); secure.once('error', fail); });
  const tTls = performance.now();

  const cert = secure.getPeerCertificate();
  const daysLeft = Math.round((new Date(cert.valid_to).getTime() - Date.now()) / 86_400_000);
  secure.end();

  return {
    ip: address + ' (IPv' + family + ')',
    dnsMs: Math.round(tDns - t0),
    tcpMs: Math.round(tTcp - tDns),                          // ~1 RTT
    tlsMs: Math.round(tTls - tTcp),                          // ~1 RTT for TLS 1.3
    tlsVersion: secure.getProtocol(),                        // e.g. 'TLSv1.3'
    alpn: secure.alpnProtocol,                               // 'h2' or 'http/1.1'
    certExpiresInDays: daysLeft,
  };
}

const report = await diagnose(process.argv[2] ?? 'example.com');
console.table(report);
if (report.certExpiresInDays < 14) process.exitCode = 1;     // fail the health check early`,
        },
        bug: {
          explanation:
            'Creating a fresh agent per request (or passing agent: false) disables connection reuse, so every outbound API call from your server pays DNS + TCP + TLS again, often 3 extra round trips, and exhausts ephemeral ports under load. Share one keep-alive agent (Node\'s built-in fetch already pools connections per origin).',
          buggy: {
            language: 'ts',
            filename: 'payments-client.ts',
            code: raw`// ❌ A new connection (TCP + TLS handshake) for every single call
import https from 'node:https';

export function charge(body: string) {
  return new Promise((resolve, reject) => {
    const req = https.request('https://api.payments.example/charges', {
      method: 'POST',
      agent: new https.Agent({ keepAlive: false }),   // fresh agent = no reuse
      headers: { 'content-type': 'application/json' },
    }, resolve);
    req.on('error', reject);
    req.end(body);
  });
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'payments-client.ts',
            code: raw`// ✅ One shared keep-alive agent per upstream: handshakes happen once, then reuse
import https from 'node:https';

const agent = new https.Agent({ keepAlive: true, maxSockets: 50, timeout: 10_000 });

export function charge(body: string) {
  return new Promise((resolve, reject) => {
    const req = https.request('https://api.payments.example/charges', {
      method: 'POST', agent, headers: { 'content-type': 'application/json' },
    }, resolve);
    req.on('error', reject);
    req.end(body);
  });
}
// (or simply use global fetch(), which pools keep-alive connections per origin)`,
          },
        },
      },
      takeaways: [
        'DNS is a chain of caches; TTLs decide how long an answer lives.',
        'TCP costs 1 RTT, TLS 1.3 another 1 RTT; QUIC (HTTP/3) merges them.',
        'Count round trips: at 50 ms RTT a cold HTTPS request needs ~200 ms before the first byte.',
        'Reuse connections and never disable certificate verification.',
        'Practice drill: compute the cold TTFB at 120 ms RTT for TLS 1.2 (5 × 120 = 600 ms) and HTTP/3 (3 × 120 = 360 ms), then run Tab 2 against your own domain.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'web-http-versions',
      title: 'HTTP/1.1 vs HTTP/2 vs HTTP/3, Status Codes & Headers',
      summary: 'What an HTTP message actually looks like, how each protocol version fixed the previous one\'s head-of-line blocking, and how to use status codes and headers precisely.',
      difficulty: 'Beginner',
      minutes: 22,
      xp: 90,
      analogy:
        "HTTP/1.1 is a single-lane drive-through: each car (request) waits for the one in front, so browsers open six lanes. HTTP/2 is one wide lane where many orders travel interleaved, but if one tray is dropped (a lost TCP packet) everyone waits while it is replaced. HTTP/3 gives every order its own conveyor belt (QUIC streams), so one dropped tray only delays that order.",
      intuition: [
        { title: 'HTTP is text with a strict shape', body: "A request line (`GET /cart HTTP/1.1`), headers (`Host`, `Accept`, `Cookie` …), a blank line, then an optional body. A response has a status line (`HTTP/1.1 200 OK`), headers and a body. Header names are case-insensitive." },
        { title: 'HTTP/1.1: one request at a time per connection', body: "Responses must come back in order, so a slow response blocks the ones behind it (head-of-line blocking). Browsers work around it with ~6 connections per origin, which is why old advice said to bundle and sprite everything." },
        { title: 'HTTP/2: binary frames and multiplexing', body: "Many streams share one TCP connection, with compressed headers (HPACK). No more 6-connection limit; but because TCP delivers bytes in order, a single lost packet stalls every stream on the connection." },
        { title: 'HTTP/3: QUIC over UDP', body: "QUIC implements reliable streams itself, so loss on one stream does not block others, and it combines the transport and TLS 1.3 handshakes. It also survives network changes (Wi-Fi → mobile) using connection IDs." },
        { title: 'Status codes are an API contract', body: "2xx success (200, 201 Created, 204 No Content), 3xx redirects (301/308 permanent, 302/307 temporary, 304 Not Modified), 4xx client errors (400 malformed, 401 not authenticated, 403 authenticated but forbidden, 404, 409 conflict, 422 validation failed, 429 rate limited), 5xx server errors (500, 502 bad gateway, 503 unavailable with `Retry-After`)." },
        { title: 'Headers that matter daily', body: "`Content-Type`, `Cache-Control`, `ETag` + `If-None-Match` (→ 304), `Authorization`, `Set-Cookie`, `Location` (with 201/3xx), `Retry-After`, `Vary`, and security headers such as `Strict-Transport-Security` and `Content-Security-Policy`." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Where head-of-line blocking lives', body: 'Each version moved the blocking one layer down, and HTTP/3 removed it from the transport.', flow: ['HTTP/1.1: blocked per connection (in-order responses)', 'HTTP/2: multiplexed, but TCP loss blocks all streams', 'HTTP/3: QUIC streams recover independently'] },
        { kind: 'tip', title: 'See it in DevTools', body: 'Network panel → right-click the column header → enable "Protocol". You will see h2 or h3 per request; the Timing tab breaks each request into DNS, connection, TLS, waiting (TTFB) and download.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'http_from_scratch.ts',
          explanation: 'Runnable TypeScript: a minimal HTTP/1.1 request parser (request line, case-insensitive headers, Content-Length body), a timing model of head-of-line blocking for HTTP/1.1 vs HTTP/2 vs HTTP/3 under packet loss, and a status-code chooser. All results are asserted.',
          code: raw`//  ONE CONNECTION, THREE RESPONSES (B is slow / loses a packet)
//
//   HTTP/1.1 : [A]---[B.........]---[C]          C waits for B
//   HTTP/2   : [A][B..lost..retransmit][C]       TCP loss stalls A, B and C
//   HTTP/3   : [A]  [B..lost..retx]  [C]         only B waits (QUIC streams)
import assert from 'node:assert/strict';

function parseRequest(raw: string) {
  const [head, body = ''] = raw.split('\r\n\r\n');
  const [requestLine, ...headerLines] = head.split('\r\n');
  const [method, target, version] = requestLine.split(' ');
  const headers = new Map<string, string>();
  for (const line of headerLines) {
    const i = line.indexOf(':');
    headers.set(line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim());   // names are case-insensitive
  }
  const length = Number(headers.get('content-length') ?? 0);
  return { method, target, version, headers, body: body.slice(0, length) };
}

const req = parseRequest(
  'POST /api/orders HTTP/1.1\r\nHost: shop.example.com\r\nContent-Type: application/json\r\n' +
  'CONTENT-LENGTH: 13\r\n\r\n{"sku":"A-1"}EXTRA');
assert.equal(req.method, 'POST');
assert.equal(req.headers.get('content-length'), '13');
assert.equal(req.body, '{"sku":"A-1"}');                     // bytes after Content-Length are ignored

// completion times (ms) for three responses on ONE connection; B suffers a 100 ms loss
const durations = { A: 20, B: 30, C: 20 };
const lossPenalty = 100;
function finishTimes(protocol: 'h1' | 'h2' | 'h3') {
  if (protocol === 'h1') {                                   // strictly sequential
    const a = durations.A, b = a + durations.B + lossPenalty, c = b + durations.C;
    return { A: a, B: b, C: c };
  }
  // h2 and h3 multiplex; under h2 a TCP loss stalls the whole connection
  const stall = protocol === 'h2' ? lossPenalty : 0;
  return { A: durations.A + stall, B: durations.B + lossPenalty, C: durations.C + stall };
}
assert.deepEqual(finishTimes('h1'), { A: 20, B: 150, C: 170 });
assert.deepEqual(finishTimes('h2'), { A: 120, B: 130, C: 120 });
assert.deepEqual(finishTimes('h3'), { A: 20, B: 130, C: 20 });

type Outcome = 'created' | 'invalid' | 'unauthenticated' | 'forbidden' | 'conflict' | 'rate-limited' | 'unchanged';
const STATUS: Record<Outcome, number> = {
  created: 201, invalid: 422, unauthenticated: 401, forbidden: 403, conflict: 409, 'rate-limited': 429, unchanged: 304,
};
assert.equal(STATUS.unauthenticated, 401);                   // "who are you?"
assert.equal(STATUS.forbidden, 403);                         // "I know you, and no"
console.log(req.method, req.target, '| h1', finishTimes('h1'), '| h3', finishTimes('h3'));`,
        },
        production: {
          language: 'ts',
          filename: 'products-handler.ts',
          explanation: 'Production Node.js handler (built-in http module): precise status codes, a JSON error envelope, Location on 201, strong ETags with If-None-Match → 304, Cache-Control, Retry-After on 503 and a baseline of security headers.',
          code: raw`import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';

// baseline security headers sent on every response
const SECURITY_HEADERS = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

function send(res: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8', ...headers });
  res.end(payload);
}

const problem = (code: string, message: string) => ({ error: { code, message } });   // one envelope everywhere

// GET /api/products/:id with conditional requests (ETag -> 304)

async function getProduct(req: IncomingMessage, res: ServerResponse, id: string) {
  if (await db.isOverloaded()) {
    return send(res, 503, problem('unavailable', 'Try again shortly'), { 'retry-after': '5' });
  }
  const product = await db.products.find(id);
  if (!product) return send(res, 404, problem('not_found', 'No product ' + id));

  const json = JSON.stringify(product);
  const etag = '"' + createHash('sha256').update(json).digest('base64url').slice(0, 27) + '"';
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { etag, 'cache-control': 'private, max-age=0, must-revalidate' });
    return res.end();                                                    // no body: client reuses its copy
  }
  send(res, 200, product, { etag, 'cache-control': 'private, max-age=0, must-revalidate' });
}

async function createProduct(res: ServerResponse, input: unknown, user: { role: string } | null) {
  if (!user) return send(res, 401, problem('unauthenticated', 'Sign in first'), { 'www-authenticate': 'Bearer' });
  if (user.role !== 'admin') return send(res, 403, problem('forbidden', 'Admins only'));
  const parsed = parseProduct(input);                                    // see the TypeScript module
  if (!parsed.ok) return send(res, 422, problem('validation_failed', parsed.message));
  const created = await db.products.insert(parsed.value);
  send(res, 201, created, { location: '/api/products/' + created.id });
}

createServer(router({ getProduct, createProduct })).listen(3000);`,
        },
        bug: {
          explanation:
            'Returning 200 for failures (with an error buried in the body) breaks every layer that trusts status codes: caches store the error, retries and alerts never fire, fetch() resolves happily, and clients must parse bodies to discover failure. Use the status code that matches the outcome and a consistent error envelope.',
          buggy: {
            language: 'ts',
            filename: 'orders-handler.ts',
            code: raw`// ❌ Everything is "200 OK"; even a server crash
app.post('/api/orders', async (req, res) => {
  try {
    if (!req.body.items?.length) return res.status(200).json({ success: false, error: 'No items' });
    const order = await orders.create(req.body);
    res.status(200).json({ success: true, order });
  } catch (e) {
    res.status(200).json({ success: false, error: String(e) });   // also leaks internals
  }
});`,
          },
          fixed: {
            language: 'ts',
            filename: 'orders-handler.ts',
            code: raw`// ✅ Status codes carry the outcome; one error envelope; no internal details leaked
app.post('/api/orders', async (req, res) => {
  if (!req.body.items?.length) {
    return res.status(422).json({ error: { code: 'validation_failed', message: 'items must not be empty' } });
  }
  try {
    const order = await orders.create(req.body);
    res.status(201).location('/api/orders/' + order.id).json(order);
  } catch (e) {
    req.log.error({ err: e }, 'order creation failed');                 // details go to logs
    res.status(500).json({ error: { code: 'internal', message: 'Something went wrong' } });
  }
});`,
          },
        },
      },
      takeaways: [
        'HTTP messages are a start line, case-insensitive headers, a blank line and a body.',
        'HTTP/2 multiplexes over one TCP connection; HTTP/3 (QUIC) removes transport head-of-line blocking.',
        'Status codes are a contract: 401 vs 403, 409, 422, 429 + Retry-After, 304 with ETags.',
        'Never return 200 for failures; use one consistent error envelope.',
        'Practice drill: in Tab 1, set the loss penalty to 0 and predict all three protocols\' finish times before running it (h1: 20/50/70, h2 and h3: 20/30/20).',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'web-cors-cookies',
      title: 'CORS Preflight Mechanics & Cookies (HttpOnly, SameSite, Secure)',
      summary: 'Exactly when the browser sends a preflight, which response headers unlock a cross-origin call, and how cookie attributes decide whether a session survives (or leaks).',
      difficulty: 'Beginner',
      minutes: 22,
      xp: 100,
      analogy:
        "The browser is a strict building receptionist. Same-origin requests are staff walking between their own offices. A cross-origin request is a visitor: for simple errands the receptionist lets them deliver a letter but will not hand the reply back unless the other office says it is allowed (CORS). For anything unusual, the receptionist first phones the other office to ask permission (the preflight). Cookies are visitor badges, and their attributes say which doors the badge works on.",
      intuition: [
        { title: 'Origin = scheme + host + port', body: "`https://app.example.com` and `https://api.example.com` are different origins (different host). The same-origin policy stops scripts on one origin from reading responses from another, unless the server opts in with CORS." },
        { title: 'Simple requests skip the preflight', body: "GET, HEAD or POST with only safelisted headers and a Content-Type of `text/plain`, `multipart/form-data` or `application/x-www-form-urlencoded`. The request is sent; the browser only hides the response unless `Access-Control-Allow-Origin` matches." },
        { title: 'Everything else is preflighted', body: "A PUT/DELETE/PATCH, a custom header such as `Authorization`, or `Content-Type: application/json` triggers an OPTIONS request with `Access-Control-Request-Method/Headers`. The real request is sent only if the reply allows the origin, method and headers. `Access-Control-Max-Age` caches that permission." },
        { title: 'Credentials change the rules', body: "With `credentials: 'include'` the server must return the exact origin (never `*`) and `Access-Control-Allow-Credentials: true`. Responses that vary by Origin need `Vary: Origin` so caches don't serve one origin's answer to another." },
        { title: 'Cookie attributes', body: "`HttpOnly`: invisible to JavaScript (`document.cookie`), which limits XSS session theft. `Secure`: only sent over HTTPS. `SameSite=Strict`: never sent on cross-site requests; `Lax` (the browser default): sent on top-level GET navigations from other sites; `None`: always sent, and requires `Secure`." },
        { title: 'Prefixes and scope', body: "`__Host-session` cookies must be Secure, have `Path=/` and no `Domain`, so a sibling subdomain cannot overwrite them. Keep session cookies host-only and short-lived, and rotate them at login." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Preflighted cross-origin request', body: 'The OPTIONS round trip happens before the real request and can be cached with Access-Control-Max-Age.', flow: ['fetch(PUT, JSON, Authorization)', 'OPTIONS + Access-Control-Request-*', '204 + Allow-Origin/Methods/Headers', 'real PUT request', 'response readable by JS'] },
        { kind: 'security', title: 'CORS is not authentication', body: 'CORS controls which browser scripts may read responses; it does not stop curl, servers or attackers from calling your API. Authenticate and authorize every request on the server, and use SameSite cookies plus CSRF tokens for cookie-based sessions.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'cors_and_cookies_from_scratch.ts',
          explanation: 'Runnable TypeScript implementing the browser\'s decisions: whether a request needs a preflight, whether the server\'s headers allow it (including the credentials rules), and whether a cookie is attached to a given request based on SameSite, Secure and the navigation type.',
          code: raw`//  BROWSER DECISIONS
//
//   fetch() --> simple? --yes--> send --> Allow-Origin ok? --> JS can read
//                 |no
//                 +--> OPTIONS preflight --> allowed? --no--> blocked (request never sent)
//   cookie --> Secure && http? drop --> SameSite vs cross-site? --> attach / skip
import assert from 'node:assert/strict';

const SAFE_METHODS = ['GET', 'HEAD', 'POST'];
const SAFE_TYPES = ['text/plain', 'multipart/form-data', 'application/x-www-form-urlencoded'];
const SAFE_HEADERS = ['accept', 'accept-language', 'content-language', 'content-type'];

function needsPreflight(method: string, headers: Record<string, string>): boolean {
  if (!SAFE_METHODS.includes(method)) return true;
  for (const [name, value] of Object.entries(headers)) {
    const n = name.toLowerCase();
    if (!SAFE_HEADERS.includes(n)) return true;
    if (n === 'content-type' && !SAFE_TYPES.includes(value.split(';')[0].trim())) return true;
  }
  return false;
}

assert.equal(needsPreflight('GET', {}), false);
assert.equal(needsPreflight('POST', { 'Content-Type': 'application/x-www-form-urlencoded' }), false);
assert.equal(needsPreflight('POST', { 'Content-Type': 'application/json' }), true);
assert.equal(needsPreflight('GET', { Authorization: 'Bearer x' }), true);
assert.equal(needsPreflight('DELETE', {}), true);

function corsAllows(origin: string, credentials: boolean, res: Record<string, string>): boolean {
  const allow = res['access-control-allow-origin'];
  if (credentials) {
    return allow === origin && res['access-control-allow-credentials'] === 'true';   // '*' is NOT enough
  }
  return allow === '*' || allow === origin;
}
assert.equal(corsAllows('https://app.example.com', false, { 'access-control-allow-origin': '*' }), true);
assert.equal(corsAllows('https://app.example.com', true, { 'access-control-allow-origin': '*', 'access-control-allow-credentials': 'true' }), false);
assert.equal(corsAllows('https://app.example.com', true, { 'access-control-allow-origin': 'https://app.example.com', 'access-control-allow-credentials': 'true' }), true);

type Cookie = { name: string; sameSite: 'Strict' | 'Lax' | 'None'; secure: boolean; httpOnly: boolean };
type Ctx = { crossSite: boolean; topLevelGet: boolean; https: boolean };
function attaches(c: Cookie, ctx: Ctx): boolean {
  if (c.secure && !ctx.https) return false;
  if (c.sameSite === 'None') return c.secure;                // None without Secure is rejected
  if (!ctx.crossSite) return true;
  return c.sameSite === 'Lax' && ctx.topLevelGet;            // Strict: never cross-site
}
const session: Cookie = { name: '__Host-session', sameSite: 'Lax', secure: true, httpOnly: true };
assert.equal(attaches(session, { crossSite: false, topLevelGet: false, https: true }), true);
assert.equal(attaches(session, { crossSite: true, topLevelGet: true, https: true }), true);   // link click
assert.equal(attaches(session, { crossSite: true, topLevelGet: false, https: true }), false); // evil.com POST
assert.equal(attaches({ ...session, sameSite: 'Strict' }, { crossSite: true, topLevelGet: true, https: true }), false);
assert.equal(attaches({ ...session, sameSite: 'None', secure: false }, { crossSite: false, topLevelGet: false, https: true }), false);
console.log('preflight(JSON POST) =', needsPreflight('POST', { 'Content-Type': 'application/json' }));`,
        },
        production: {
          language: 'ts',
          filename: 'cors-and-session.ts',
          explanation: 'Production Node.js middleware: an exact-match origin allowlist, Vary: Origin, a cached 204 preflight, credentials only for trusted origins, and a __Host- session cookie with HttpOnly, Secure, SameSite=Lax and a bounded lifetime.',
          code: raw`import type { IncomingMessage, ServerResponse } from 'node:http';

const ALLOWED_ORIGINS = new Set(['https://app.example.com', 'https://admin.example.com']);
const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE';
const ALLOWED_HEADERS = 'content-type, authorization, idempotency-key';

export function cors(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = req.headers.origin;
  res.setHeader('vary', 'Origin');                          // responses differ per origin: tell caches
  if (origin && ALLOWED_ORIGINS.has(origin)) {              // exact match, never a regex on user input
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('access-control-allow-credentials', 'true');
    res.setHeader('access-control-expose-headers', 'location, retry-after');
  }
  if (req.method === 'OPTIONS') {                           // preflight: answer and stop
    res.setHeader('access-control-allow-methods', ALLOWED_METHODS);
    res.setHeader('access-control-allow-headers', ALLOWED_HEADERS);
    res.setHeader('access-control-max-age', '600');         // browser may cache this for 10 minutes
    res.writeHead(204).end();
    return true;                                            // handled
  }
  return false;
}

export function setSessionCookie(res: ServerResponse, sessionId: string) {
  res.setHeader('set-cookie', [
    '__Host-session=' + sessionId,                          // __Host-: Secure, Path=/, no Domain
    'Path=/',
    'HttpOnly',                                             // not readable by document.cookie
    'Secure',                                               // HTTPS only
    'SameSite=Lax',                                         // not sent on cross-site POST/fetch
    'Max-Age=' + 60 * 60 * 8,                               // 8-hour session
  ].join('; '));
}`,
        },
        bug: {
          explanation:
            'Reflecting whatever Origin arrives together with Allow-Credentials: true means any website the user visits can call your API with the user\'s cookies and read the response, a full cross-origin data leak. Only echo origins from an exact allowlist, and add Vary: Origin.',
          buggy: {
            language: 'ts',
            filename: 'cors.ts',
            code: raw`// ❌ "Works in dev": every origin is trusted, with cookies
app.use((req, res, next) => {
  res.setHeader('access-control-allow-origin', req.headers.origin ?? '*');
  res.setHeader('access-control-allow-credentials', 'true');
  next();
});`,
          },
          fixed: {
            language: 'ts',
            filename: 'cors.ts',
            code: raw`// ✅ Exact allowlist; unknown origins get no CORS headers at all
const ALLOWED = new Set(['https://app.example.com']);
app.use((req, res, next) => {
  res.setHeader('vary', 'Origin');
  const origin = req.headers.origin;
  if (origin && ALLOWED.has(origin)) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('access-control-allow-credentials', 'true');
  }
  next();
});`,
          },
        },
      },
      takeaways: [
        'Origin = scheme + host + port; CORS lets a server opt in to cross-origin reads.',
        'JSON bodies, custom headers like Authorization, and non-simple methods trigger an OPTIONS preflight.',
        'With credentials, Allow-Origin must be the exact origin, never *, and add Vary: Origin.',
        'Session cookies: __Host- prefix, HttpOnly, Secure, SameSite=Lax (or Strict), short Max-Age.',
        'Practice drill: predict whether fetch("https://api.example.com/x", { method: "POST", body: "hi" }) is preflighted (no: POST with text/plain) and check it in Tab 1.',
      ],
    },
  ],
};
