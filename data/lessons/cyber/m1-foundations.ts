import type { Module } from '../../types';

// String.raw keeps backslashes (\n, \x41) exactly as written inside code samples.
const raw = String.raw;

export const foundationsModule: Module = {
  id: 'cyber-foundations',
  title: 'Security Foundations & Threat Modeling',
  level: 'Scratch',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'cyber-cia-attack-surface',
      title: 'CIA Triad, Attack Surfaces & Privilege Boundaries',
      summary: 'What "secure" actually means, where attackers can touch your system, and the lines where privilege changes hands.',
      difficulty: 'Scratch',
      minutes: 15,
      xp: 70,
      analogy:
        "Think of a bank branch. Confidentiality is the vault door, integrity is the tamper-evident seal on every cash bag, and availability is the branch actually being open. The attack surface is every door, window, and mail slot. Privilege boundaries are the points where a visitor needs a different badge: the lobby, the teller line, the back office, the vault.",
      intuition: [
        { title: 'Confidentiality: only the right eyes', body: "Data must not be readable by anyone who should not see it. In bytes: a password row in a database, a session cookie in transit, a private key on disk. Breaking confidentiality means those exact bytes reach the wrong process, network, or person." },
        { title: 'Integrity: nothing changes silently', body: "Data must not be modified without detection. An attacker flipping one byte (`amount=100` → `amount=900`) or swapping a downloaded binary breaks integrity. Hashes, MACs and signatures exist to detect exactly this." },
        { title: 'Availability: it still works under pressure', body: "The service must keep answering. A regex that takes 30 seconds on a crafted input, an unbounded upload, or a crash on malformed JSON are all availability bugs even if no data leaks." },
        { title: 'Attack surface: every input that crosses a boundary', body: "List every place untrusted bytes enter: HTTP paths, query strings, headers, cookies, JSON bodies, file uploads, environment variables, message queues, and even DNS answers. Each one is a parser that an attacker controls the input to." },
        { title: 'Privilege boundaries: where trust changes', body: "Browser → server, user → admin, tenant A → tenant B, app → database, user mode → kernel (`syscall`). Most serious bugs are a missing check exactly at one of these lines: the code on the privileged side trusted something from the unprivileged side." },
        { title: 'Trace one request end to end', body: "A login request is bytes on a TCP socket → TLS decrypts → the HTTP parser builds headers → the router picks a handler → the handler validates input → a parameterized query hits the DB under a least-privilege role. Ask at every arrow: who controls these bytes, and who checks them?" },
      ],
      callouts: [
        { kind: 'architecture', title: 'Trust boundaries in a typical web app', body: 'Each arrow is a boundary where input must be validated and identity re-checked. Privilege generally increases from left to right.', flow: ['Internet (untrusted)', 'TLS / load balancer', 'App server (app user)', 'Database (app role)', 'OS kernel (root)'] },
        { kind: 'tip', title: 'Least privilege + defense in depth', body: 'Give each component the smallest permission it needs (a read-only DB role for reporting, no shell for the web user), and layer controls so one failure is not a breach.' },
        { kind: 'security', title: 'Scope', body: 'Map attack surfaces only for systems you own or are authorised to assess. Port-scanning or probing third-party hosts without permission can be illegal.' },
      ],
      code: {
        basic: {
          language: 'py',
          filename: 'boundaries.py',
          explanation: 'A tiny Flask app annotated with every trust boundary and the CIA property each control protects.',
          code: raw`#  REQUEST PATH (each "||" is a trust boundary)
#
#  [ browser ] || [ TLS ] || [ Flask handler ] || [ SQLite ] || [ filesystem ]
#   untrusted      C+I        validates input      app role       OS user
#
from flask import Flask, request, session, abort
import sqlite3

app = Flask(__name__)
app.secret_key = open("/run/secrets/flask_key", "rb").read()  # C: secret never in source code

@app.get("/notes/<int:note_id>")          # attack surface: path parameter (int-typed by the router)
def read_note(note_id: int):
    user_id = session.get("user_id")      # identity comes from the SERVER-signed session...
    if user_id is None:                   # ...never from a client header or query string
        abort(401)
    db = sqlite3.connect("file:notes.db?mode=ro", uri=True)  # least privilege: read-only handle
    row = db.execute(
        "SELECT body FROM notes WHERE id = ? AND owner_id = ?",  # I: parameterized, C: owner check
        (note_id, user_id),
    ).fetchone()
    if row is None:
        abort(404)                         # same answer for "missing" and "not yours"
    return {"body": row[0][:10_000]}       # A: bounded response size`,
        },
        production: {
          language: 'bash',
          filename: 'surface-inventory.sh',
          explanation: 'How a defender inventories the attack surface of a Linux host they own before a review.',
          code: raw`#!/usr/bin/env bash
# Run on YOUR server (authorised review). Each section answers "what can an attacker touch?"
set -euo pipefail

echo "== Listening sockets (network attack surface) =="
ss -tulpn                       # -t tcp -u udp -l listening -p owning process -n numeric

echo "== SUID/SGID binaries (local privilege boundary) =="
find / -xdev \( -perm -4000 -o -perm -2000 \) -type f 2>/dev/null

echo "== World-writable dirs without sticky bit (integrity risk) =="
find / -xdev -type d -perm -0002 ! -perm -1000 2>/dev/null

echo "== Who can sudo, and to what? (privilege boundary) =="
getent group sudo wheel || true
sudo -l -U www-data 2>/dev/null || echo "www-data: no sudo rules (good)"

echo "== Services running as root (blast radius) =="
ps -eo user,pid,comm --sort=user | awk '$1=="root"' | head -40`,
        },
        bug: {
          explanation:
            'The vulnerable handler decides "admin or not" from a request header the client fully controls, so the privilege boundary is enforced on the wrong side. The fix derives the role from server-side state on every request.',
          buggy: {
            language: 'py',
            filename: 'admin.py',
            code: raw`# ❌ Trusts the client to say who it is
@app.post("/admin/delete-user/<int:uid>")
def delete_user(uid):
    if request.headers.get("X-Role") == "admin":   # attacker just sends X-Role: admin
        db.execute("DELETE FROM users WHERE id = ?", (uid,))
        return {"ok": True}
    abort(403)`,
          },
          fixed: {
            language: 'py',
            filename: 'admin.py',
            code: raw`# ✅ Role comes from the server's own session store, checked at the boundary
def require_role(role: str):
    user = current_user()                  # looks up session id -> user row on the server
    if user is None or role not in user.roles:
        abort(403)
    return user

@app.post("/admin/delete-user/<int:uid>")
def delete_user(uid):
    admin = require_role("admin")
    audit_log.write(actor=admin.id, action="delete_user", target=uid)  # I: tamper-evident trail
    db.execute("DELETE FROM users WHERE id = ?", (uid,))
    return {"ok": True}`,
          },
        },
      },
      takeaways: [
        'CIA = confidentiality, integrity, availability. Name which one a bug breaks.',
        'Attack surface = every place untrusted bytes are parsed.',
        'Check identity and permissions on the privileged side of each boundary, every time.',
        'Practice drill: draw the boundaries for this platform (browser → Supabase → Postgres RLS). For each arrow, write which CIA property its control protects.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'cyber-hash-encrypt-encode',
      title: 'Hashing vs. Encryption vs. Encoding (and MACs)',
      summary: 'Three operations that look similar in a hex dump but give completely different security guarantees.',
      difficulty: 'Scratch',
      minutes: 16,
      xp: 70,
      analogy:
        "Encoding is translating a letter into Morse code: anyone with the chart reads it. Encryption is locking the letter in a box: only someone with the key opens it. Hashing is a fingerprint: you can check that a person matches it, but you cannot rebuild the person from it. A MAC is a wax seal pressed with a signet ring: it proves the sender had the ring and that nobody opened the envelope.",
      intuition: [
        { title: 'Encoding changes representation, not secrecy', body: "Base64 maps every 3 bytes to 4 printable characters. `hi!` = bytes 68 69 21 → `aGkh`. No key is involved, so it is reversible by anyone. It exists so binary data survives text-only channels (JSON, email, URLs)." },
        { title: 'Hashing is one-way and fixed-length', body: "SHA-256 turns any input into 32 bytes. Change one bit of input and roughly half the output bits flip (the avalanche effect). You cannot invert it; you can only guess inputs and compare. That is why fast hashes are useless for passwords: guessing is cheap." },
        { title: 'Encryption is reversible with a key', body: "AES-256-GCM takes a 32-byte key, a 12-byte nonce, and plaintext, and produces ciphertext plus a 16-byte auth tag. Without the key the ciphertext looks random; with it you get the exact plaintext back, and tampering makes decryption fail." },
        { title: 'A MAC proves integrity and authenticity', body: "HMAC-SHA256(key, message) is a tag only key holders can produce. Webhooks (Stripe, GitHub) sign request bodies this way. Verifying means recomputing the tag and comparing in constant time." },
        { title: 'Pick by the question you are answering', body: "Need to transport bytes? Encode. Need to check that something matches without storing it? Hash (slow, salted for passwords). Need to read it back later, secretly? Encrypt. Need to know nobody tampered? MAC or signature." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Same input, four different outputs', body: 'Only encryption and MACs involve a secret key, and only encryption is reversible by design.', flow: ['"hi!"', 'Base64 → aGkh (anyone reverses)', 'SHA-256 → 32 bytes (one-way)', 'AES-GCM → ct + tag (key reverses)', 'HMAC → tag (key verifies)'] },
        { kind: 'warning', title: 'Base64 is not encryption', body: 'Base64 in a cookie, a JWT payload, or a config file is fully readable. If you can see "eyJ" at the start, that is Base64 of {" and anyone can decode it.' },
      ],
      code: {
        basic: {
          language: 'py',
          filename: 'four_ops.py',
          explanation: 'The four operations on the same bytes, so you can compare what each output looks like and what it takes to reverse it.',
          code: raw`#  BYTES:  h=0x68  i=0x69  !=0x21
#  base64 groups 24 bits -> 4 x 6-bit indices:
#    01101000 01101001 00100001
#    011010|000110|100100|100001  ->  26,6,36,33  ->  "a","G","k","h"
import base64, hashlib, hmac, os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

msg = b"hi!"

enc = base64.b64encode(msg)                    # ENCODE: no key, reversible
print(enc, base64.b64decode(enc))              # b'aGkh' b'hi!'

digest = hashlib.sha256(msg).hexdigest()       # HASH: one-way, 32 bytes
print(digest[:16], "...")                      # change one bit of msg -> ~128 of 256 bits flip

key = AESGCM.generate_key(bit_length=256)      # ENCRYPT: needs the key to reverse
nonce = os.urandom(12)                         # 96-bit nonce: NEVER reuse with the same key
ct = AESGCM(key).encrypt(nonce, msg, None)     # ciphertext (3 bytes) + 16-byte tag
print(len(ct), AESGCM(key).decrypt(nonce, ct, None))   # 19 b'hi!'

mac_key = os.urandom(32)                       # MAC: proves who sent it + nothing changed
tag = hmac.new(mac_key, msg, hashlib.sha256).digest()
print(hmac.compare_digest(tag, hmac.new(mac_key, msg, hashlib.sha256).digest()))  # True`,
        },
        production: {
          language: 'py',
          filename: 'webhook_verify.py',
          explanation: 'The researcher/defender pattern for verifying a signed webhook: raw body, timestamp tolerance, constant-time compare.',
          code: raw`import hmac, hashlib, time

TOLERANCE_S = 300   # reject replays older than 5 minutes

def verify_webhook(raw_body: bytes, header: str, secret: bytes) -> bool:
    # header format (Stripe-style): "t=1700000000,v1=<hex hmac>"
    parts = dict(p.split("=", 1) for p in header.split(","))
    ts, sig = int(parts["t"]), parts["v1"]

    if abs(time.time() - ts) > TOLERANCE_S:          # replay protection
        return False

    signed = f"{ts}.".encode() + raw_body            # sign EXACT bytes, before JSON parsing
    expected = hmac.new(secret, signed, hashlib.sha256).hexdigest()

    # constant-time: '==' returns early on the first different byte, leaking timing
    return hmac.compare_digest(expected, sig)`,
        },
        bug: {
          explanation:
            'sha256(secret + body) is vulnerable to length-extension attacks: SHA-256 is a Merkle-Damgard hash, so knowing H(secret||m) lets an attacker compute H(secret||m||padding||extra) without the secret. And == leaks timing. HMAC is designed to resist both.',
          buggy: {
            language: 'py',
            filename: 'verify.py',
            code: raw`# ❌ Homemade MAC + early-exit comparison
import hashlib

def verify(body: bytes, sig_hex: str, secret: bytes) -> bool:
    expected = hashlib.sha256(secret + body).hexdigest()   # length-extendable
    return expected == sig_hex                              # timing side channel`,
          },
          fixed: {
            language: 'py',
            filename: 'verify.py',
            code: raw`# ✅ HMAC + constant-time comparison
import hmac, hashlib

def verify(body: bytes, sig_hex: str, secret: bytes) -> bool:
    expected = hmac.new(secret, body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig_hex)`,
          },
        },
      },
      takeaways: [
        'Encoding ≠ security. Hashing is one-way. Encryption is reversible with a key. MACs prove integrity and authenticity.',
        'Use HMAC, never hash(secret + data), and compare tags in constant time.',
        'AES-GCM output = ciphertext + 16-byte tag; tampering makes decryption fail.',
        'Practice drill: Base64-decode `eyJhbGciOiJub25lIn0` by hand or in a terminal and explain why a JWT payload is not secret.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'cyber-threat-modeling-chains',
      title: 'Threat Modeling & How Small Bugs Chain into Breaches',
      summary: 'Use data-flow diagrams and STRIDE to find risks early, and see how three "low" findings combine into a critical one.',
      difficulty: 'Scratch',
      minutes: 18,
      xp: 80,
      analogy:
        "A burglar rarely smashes through a wall. They notice a ladder left in the garden (info leak), a bathroom window that does not lock (weak control), and a spare key under the mat (exposed secret). Each alone is \"minor\". Together they are a break-in. Threat modeling is walking around your own house with a notebook before the burglar does.",
      intuition: [
        { title: 'Draw the data-flow diagram first', body: "Boxes for processes, cylinders for data stores, arrows for data flows, and dashed lines for trust boundaries. You cannot protect a flow you have not drawn. Every arrow crossing a dashed line is a candidate for threats." },
        { title: 'Apply STRIDE to each element', body: "Spoofing (identity), Tampering (integrity), Repudiation (no audit trail), Information disclosure (confidentiality), Denial of service (availability), Elevation of privilege. Ask each question for every arrow and box." },
        { title: 'Rate by likelihood × impact', body: "A bug reachable only by admins on an internal network is less likely than one any anonymous user can hit. Impact asks what the attacker gains. Fix high×high first, but do not discard \"lows\": they are chain links." },
        { title: 'How a chain works', body: "Step 1: a verbose error page leaks the internal hostname `files.internal`. Step 2: an image-proxy feature fetches any URL (SSRF). Step 3: the proxy reaches the cloud metadata endpoint and returns temporary credentials. Three medium bugs = full cloud account compromise." },
        { title: 'Break the chain at multiple links', body: "Generic errors stop the recon. An SSRF allow-list stops the pivot. IMDSv2 and least-privilege IAM limit the payoff. Defense in depth means an attacker must defeat every layer, not just one." },
      ],
      callouts: [
        { kind: 'architecture', title: 'A real-world style attack chain', body: 'Each step is individually "medium" in a scanner report. The combination is critical.', flow: ['Stack trace leaks internal host', 'SSRF in image proxy', 'Cloud metadata 169.254.169.254', 'Temporary IAM keys', 'Read every S3 bucket'] },
        { kind: 'tip', title: 'Threat model when the design changes', body: 'New endpoint, new third-party integration, new data store, or a new role: redraw the affected part of the diagram and re-run STRIDE. It takes 20 minutes and finds design bugs that no scanner can.' },
      ],
      code: {
        basic: {
          language: 'text',
          filename: 'threat-model.md',
          explanation: 'A minimal written threat model: diagram, assets, and a STRIDE table for one data flow.',
          code: raw`DATA-FLOW DIAGRAM  (- - - = trust boundary)

  [User Browser] --(1) HTTPS POST /upload--> - - -> [API Server] --(2) PUT--> ((Object Storage))
                                                       |
                                                       +--(3) GET avatar_url --> [Internet / any URL]

ASSETS: user files (C), account integrity (I), API uptime (A), cloud credentials (C)

FLOW (3): API fetches a user-supplied URL to build a thumbnail
+----+-----------------------------+------------------------------------------+---------+
| ST | Threat                      | Mitigation                               | Status  |
+----+-----------------------------+------------------------------------------+---------+
| S  | URL spoofs internal service | resolve DNS, block private/link-local IPs| TODO    |
| T  | Response tampered in transit| https only, verify TLS                   | done    |
| R  | No record of fetched URLs   | log url + user id + resolved IP          | TODO    |
| I  | SSRF reads metadata secrets | IMDSv2, egress proxy allow-list          | TODO    |
| D  | 10 GB file / slow loris     | 5 MB cap, 3 s timeout, no redirects      | partial |
| E  | Pivot via IAM role          | role can only PutObject to thumbs/       | done    |
+----+-----------------------------+------------------------------------------+---------+`,
        },
        production: {
          language: 'py',
          filename: 'dfd_check.py',
          explanation: 'A toy "threat model as code" check: flags any flow that crosses a trust boundary without authentication or encryption, the way review tooling does in CI.',
          code: raw`from dataclasses import dataclass

@dataclass
class Flow:
    name: str
    src_zone: str      # e.g. "internet", "app", "data"
    dst_zone: str
    authenticated: bool
    encrypted: bool

TRUST = {"internet": 0, "app": 1, "data": 2}   # higher = more trusted

flows = [
    Flow("browser -> api",      "internet", "app",  True,  True),
    Flow("api -> postgres",     "app",      "data", True,  False),   # plaintext inside VPC
    Flow("webhook -> api",      "internet", "app",  False, True),    # unsigned webhook!
]

for f in flows:
    crosses_up = TRUST[f.dst_zone] > TRUST[f.src_zone]   # data moves into a MORE trusted zone
    if crosses_up and not f.authenticated:
        print(f"[HIGH] {f.name}: unauthenticated flow into a more trusted zone (Spoofing/EoP)")
    if f.src_zone != f.dst_zone and not f.encrypted:
        print(f"[MED]  {f.name}: unencrypted across a boundary (Info disclosure/Tampering)")`,
        },
        bug: {
          explanation:
            'Two "small" bugs from the chain: stack traces shown to users (reconnaissance) and an image proxy that fetches any URL (pivot). The patch fixes both links. Either fix alone would already break this particular chain.',
          buggy: {
            language: 'ts',
            filename: 'server.ts',
            code: raw`// ❌ Link 1: leaks internals. Link 2: fetches anything.
app.use((err, req, res, next) => {
  res.status(500).send(err.stack);          // reveals paths, hostnames, library versions
});

app.get('/thumb', async (req, res) => {
  const r = await fetch(String(req.query.url));   // any URL, incl. http://169.254.169.254/
  res.type(r.headers.get('content-type') ?? 'application/octet-stream');
  res.send(Buffer.from(await r.arrayBuffer()));
});`,
          },
          fixed: {
            language: 'ts',
            filename: 'server.ts',
            code: raw`// ✅ Generic errors + allow-listed outbound fetches
app.use((err, req, res, next) => {
  const id = crypto.randomUUID();
  logger.error({ id, err });                       // full detail stays server-side
  res.status(500).json({ error: 'internal_error', id });
});

const ALLOWED_HOSTS = new Set(['images.examplecdn.com']);
app.get('/thumb', async (req, res) => {
  const u = new URL(String(req.query.url));
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.hostname)) return res.sendStatus(400);
  const r = await fetch(u, { redirect: 'error', signal: AbortSignal.timeout(3000) });
  res.type('image/jpeg').send(Buffer.from(await r.arrayBuffer()).subarray(0, 5_000_000));
});`,
          },
        },
      },
      takeaways: [
        'Draw the data-flow diagram, mark trust boundaries, then run STRIDE per element.',
        'Breaches are usually chains. Low findings are links, not noise.',
        'Break chains at several links: recon, pivot, and payoff.',
        'Practice drill: pick one feature you built (e.g. an upload in a past project) and fill a 6-row STRIDE table for its riskiest data flow.',
      ],
    },
  ],
};
