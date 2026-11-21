import type { Module } from '../../types';

const raw = String.raw;

export const authSecurityModule: Module = {
  id: 'web-auth-security',
  title: 'Authentication, Sessions & Multi-Tenant Security',
  level: 'Advanced',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'web-passwords-sessions-jwt',
      title: 'Password Hashing, Sessions vs JWTs & Refresh-Token Rotation',
      summary: 'Store passwords so a database leak does not leak them, choose between server sessions and stateless tokens, and implement short-lived access tokens with rotating, reuse-detecting refresh tokens.',
      difficulty: 'Advanced',
      minutes: 25,
      xp: 140,
      analogy:
        "A password hash is a fingerprint of the password: you can check whether a finger matches, but you cannot rebuild the finger from the print, and a slow, salted fingerprint machine makes testing billions of guesses impractical. A server session is a coat-check ticket: the ticket is meaningless, the coat stays with the venue, and the venue can refuse it at any time. A JWT is a signed wristband: anyone can verify it without calling the venue, but you cannot take it back until it expires.",
      intuition: [
        { title: 'Never store passwords, store slow salted hashes', body: "Use Argon2id (preferred), scrypt or bcrypt. A unique random salt per user defeats precomputed tables; a deliberately slow, memory-hard function makes offline guessing expensive. Never use fast hashes like SHA-256 alone, and compare with a constant-time function." },
        { title: 'Stateful sessions', body: "After login, the server stores `session_id → user` (database/Redis) and sends the random id in an HttpOnly, Secure, SameSite cookie. Logout and \"sign out everywhere\" are instant: delete the row. This is the right default for first-party web apps." },
        { title: 'Stateless JWTs', body: "A JWT is `base64url(header).base64url(payload).signature`. Any service holding the key can verify it without a database lookup, which suits APIs and service-to-service calls. The payload is only encoded, not encrypted: never put secrets in it." },
        { title: 'Verify everything, allow one algorithm', body: "Verify the signature with an algorithm allowlist (never trust the token's own `alg`, never accept `none`), and check `exp`, `nbf`, `iss` and `aud`. Decoding is not verifying." },
        { title: 'Access + refresh tokens', body: "Access tokens are short-lived (5–15 min) so a leaked one expires quickly. A long-lived refresh token (stored server-side as a hash, sent in an HttpOnly cookie) obtains new access tokens. Rotate it on every use: each refresh returns a new refresh token and invalidates the old one." },
        { title: 'Reuse detection', body: "If an already-used refresh token is presented again, either the user or an attacker has a stolen copy. Revoke the whole token family and force a fresh login. Rotation without reuse detection only slows attackers down." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Refresh-token rotation', body: 'Each refresh token can be used once; a second use revokes the family.', flow: ['login → access (15 min) + refresh R1', 'access expires → POST /refresh with R1', 'server: R1 valid & unused → mark used, issue R2', 'later reuse of R1 detected', 'revoke family → require login'] },
        { kind: 'security', title: 'Where tokens live in the browser', body: 'Tokens in localStorage are readable by any injected script (XSS). Prefer HttpOnly cookies for refresh tokens or a backend-for-frontend that holds tokens server-side, plus a strict Content-Security-Policy.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'auth_from_scratch.ts',
          explanation: 'Runnable TypeScript with node:crypto: scrypt password hashing with per-user salts and timing-safe verification, an HS256 JWT signer/verifier written from the spec (algorithm allowlist, exp/iss/aud checks, alg "none" rejected), and refresh-token rotation with reuse detection that revokes the family. All asserted.',
          code: raw`//  JWT = base64url(header) . base64url(payload) . base64url(HMAC-SHA256(key, header.payload))
//
//   verify: split -> alg in allowlist? -> recompute HMAC -> timingSafeEqual -> exp / iss / aud
//   rotation: R1 --use--> R2 --use--> R3        reuse of R1 --> revoke family {R1, R2, R3}
import assert from 'node:assert/strict';
import { createHmac, randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

// ---- password hashing (scrypt here; Argon2id via a library in production)
function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return ['scrypt', salt.toString('base64'), hash.toString('base64')].join('$');
}
function verifyPassword(password: string, stored: string): boolean {
  const [, saltB64, hashB64] = stored.split('$');
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(actual, expected);                       // constant-time comparison
}
const h1 = hashPassword('correct horse battery staple');
const h2 = hashPassword('correct horse battery staple');
assert.notEqual(h1, h2);                                         // unique salts: same password, different hashes
assert.equal(verifyPassword('correct horse battery staple', h1), true);
assert.equal(verifyPassword('Correct horse battery staple', h1), false);

// ---- HS256 JWT from the spec
const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const KEY = randomBytes(32);
function sign(payload: Record<string, unknown>): string {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  return head + '.' + body + '.' + b64url(createHmac('sha256', KEY).update(head + '.' + body).digest());
}
function verify(token: string, now: number, expect: { iss: string; aud: string }) {
  const [head, body, sig] = token.split('.');
  const header = JSON.parse(Buffer.from(head, 'base64url').toString()) as { alg: string };
  if (header.alg !== 'HS256') throw new Error('alg not allowed');               // allowlist, never trust alg
  const expected = createHmac('sha256', KEY).update(head + '.' + body).digest();
  const given = Buffer.from(sig ?? '', 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new Error('bad signature');
  const claims = JSON.parse(Buffer.from(body, 'base64url').toString()) as { exp: number; iss: string; aud: string; sub: string };
  if (claims.exp <= now) throw new Error('expired');
  if (claims.iss !== expect.iss || claims.aud !== expect.aud) throw new Error('wrong issuer/audience');
  return claims;
}
const now = 1_800_000_000;
const token = sign({ sub: 'user_1', iss: 'auth.example.com', aud: 'api', exp: now + 900 });
assert.equal(verify(token, now, { iss: 'auth.example.com', aud: 'api' }).sub, 'user_1');
assert.throws(() => verify(token, now + 901, { iss: 'auth.example.com', aud: 'api' }), /expired/);
const [h, p] = token.split('.');
const tampered = h + '.' + b64url(JSON.stringify({ sub: 'admin', iss: 'auth.example.com', aud: 'api', exp: now + 900 })) + '.' + token.split('.')[2];
assert.throws(() => verify(tampered, now, { iss: 'auth.example.com', aud: 'api' }), /bad signature/);
const noneToken = b64url(JSON.stringify({ alg: 'none' })) + '.' + p + '.';
assert.throws(() => verify(noneToken, now, { iss: 'auth.example.com', aud: 'api' }), /alg not allowed/);

// ---- refresh rotation with reuse detection (server stores only hashes)
type Rt = { family: string; used: boolean; revoked: boolean };
const store = new Map<string, Rt>();
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function issue(family: string) { const t = randomBytes(32).toString('base64url'); store.set(sha(t), { family, used: false, revoked: false }); return t; }
function refresh(token: string): string {
  const rec = store.get(sha(token));
  if (!rec || rec.revoked) throw new Error('invalid');
  if (rec.used) {                                                 // reuse => theft suspected
    for (const r of store.values()) if (r.family === rec.family) r.revoked = true;
    throw new Error('reuse detected: family revoked');
  }
  rec.used = true;
  return issue(rec.family);
}
const r1 = issue('fam_1');
const r2 = refresh(r1);
assert.throws(() => refresh(r1), /reuse detected/);              // attacker replays the old token
assert.throws(() => refresh(r2), /invalid/);                     // legit user's newer token is revoked too
console.log('password ok, JWT verified, tampering + alg:none rejected, refresh reuse revoked family');`,
        },
        production: {
          language: 'ts',
          filename: 'auth-routes.ts',
          explanation: 'Production Express auth: Argon2id password hashing, login rate limiting and uniform error messages, a 15-minute access JWT signed and verified with jose (algorithm allowlist, issuer, audience), and an HttpOnly refresh cookie whose hashed value rotates on every use with family revocation on reuse.',
          code: raw`import argon2 from 'argon2';
import { SignJWT, jwtVerify } from 'jose';
import { createHash, randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const JWT_KEY = new TextEncoder().encode(process.env.JWT_SECRET!);     // >= 32 random bytes, from a secret store
const ISS = 'https://auth.example.com', AUD = 'https://api.example.com';
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

async function issueTokens(res: Response, userId: string, familyId: string) {
  const access = await new SignJWT({ scope: 'user' })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(userId)
    .setIssuer(ISS).setAudience(AUD).setIssuedAt().setExpirationTime('15m').sign(JWT_KEY);
  const refresh = randomBytes(32).toString('base64url');
  await db.refreshTokens.insert({ hash: sha256(refresh), userId, familyId, expiresAt: new Date(Date.now() + 30 * 864e5) });
  res.cookie('__Host-refresh', refresh, { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 30 * 864e5 });
  return access;
}

export async function login(req: Request, res: Response) {
  const { email, password } = LoginSchema.parse(req.body);
  const user = await db.users.byEmail(email.toLowerCase());
  // same message and similar timing whether or not the user exists
  const ok = user ? await argon2.verify(user.passwordHash, password) : (await argon2.hash(password), false);
  if (!user || !ok) return res.status(401).json({ title: 'Invalid email or password', status: 401 });
  if (argon2.needsRehash(user.passwordHash, { type: argon2.argon2id })) {
    await db.users.setHash(user.id, await argon2.hash(password, { type: argon2.argon2id }));   // upgrade params
  }
  res.json({ accessToken: await issueTokens(res, user.id, randomBytes(16).toString('hex')) });
}

export async function refresh(req: Request, res: Response) {
  const presented = req.cookies['__Host-refresh'];
  const rec = presented && await db.refreshTokens.byHash(sha256(presented));
  if (!rec || rec.revokedAt || rec.expiresAt < new Date()) return res.status(401).json({ title: 'Sign in again', status: 401 });
  if (rec.usedAt) {                                                    // reuse: likely theft
    await db.refreshTokens.revokeFamily(rec.familyId);
    return res.status(401).json({ title: 'Sign in again', status: 401 });
  }
  await db.refreshTokens.markUsed(rec.hash);                           // single use
  res.json({ accessToken: await issueTokens(res, rec.userId, rec.familyId) });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.get('authorization')?.replace(/^Bearer /, '') ?? '';
    const { payload } = await jwtVerify(token, JWT_KEY, { algorithms: ['HS256'], issuer: ISS, audience: AUD });
    req.userId = payload.sub!;
    next();
  } catch {
    res.status(401).set('www-authenticate', 'Bearer').json({ title: 'Unauthorized', status: 401 });
  }
}`,
        },
        bug: {
          explanation:
            'jwt.decode() only base64-decodes the token; it does not check the signature or expiry. Anyone can craft a token with sub: "admin" and be accepted. Always verify with the key and an explicit algorithm allowlist, and check issuer, audience and expiry.',
          buggy: {
            language: 'ts',
            filename: 'auth-middleware.ts',
            code: raw`// ❌ Decoding is not verifying: forged tokens are accepted
import jwt from 'jsonwebtoken';

export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  const claims = jwt.decode(token);              // no signature check, no exp check
  if (!claims) return res.sendStatus(401);
  req.user = { id: claims.sub, role: claims.role };
  next();
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'auth-middleware.ts',
            code: raw`// ✅ Verify signature + algorithm allowlist + issuer/audience/expiry
import { jwtVerify } from 'jose';

export async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
    const { payload } = await jwtVerify(token, JWT_KEY, {
      algorithms: ['HS256'], issuer: ISS, audience: AUD,
    });
    req.user = { id: payload.sub, role: await roles.forUser(payload.sub) };   // authorise from the DB
    next();
  } catch {
    res.sendStatus(401);
  }
}`,
          },
        },
      },
      takeaways: [
        'Hash passwords with Argon2id/scrypt/bcrypt and unique salts; compare in constant time.',
        'Server sessions are the simplest revocable default; JWTs trade revocability for stateless verification.',
        'Verify JWTs with an algorithm allowlist plus exp, iss and aud; decoding is not verification.',
        'Short access tokens + single-use rotating refresh tokens with family revocation on reuse.',
        'Practice drill: in Tab 1, change the tampered token so it keeps the original payload but flips one signature character, and confirm verify() still throws "bad signature".',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'web-oauth-pkce',
      title: 'OAuth 2.0 Authorization Code Flow with PKCE (and OpenID Connect)',
      summary: 'Let users sign in with another provider without your app ever seeing their password: the redirect dance, state and PKCE, the code-for-token exchange, and what OpenID Connect adds.',
      difficulty: 'Advanced',
      minutes: 22,
      xp: 130,
      analogy:
        "OAuth is a hotel valet key. You (the user) never hand the app your master key (password). Instead the front desk (authorization server) checks your ID and gives the app a valet key (access token) that only opens certain doors. PKCE is a sealed envelope: the app shows the desk a fingerprint of a secret when it asks, and must later produce the secret itself, so someone who intercepts the claim ticket (the code) cannot use it.",
      intuition: [
        { title: 'Roles', body: "Resource owner (the user), client (your app), authorization server (Google, Auth0, Keycloak…), resource server (the API). The client redirects the user to the authorization server; the user signs in there, never on your site." },
        { title: 'Authorization code flow', body: "1) Redirect to `/authorize?response_type=code&client_id&redirect_uri&scope&state&code_challenge`. 2) The user consents; the server redirects back with `?code=…&state=…`. 3) The client POSTs the code (plus `code_verifier`) to `/token` and receives tokens. The code is short-lived and single-use." },
        { title: 'state stops login CSRF', body: "Generate a random `state`, store it (cookie/session), and reject the callback unless it matches exactly. Otherwise an attacker can make a victim complete a login with the attacker's code." },
        { title: 'PKCE binds the code to the requester', body: "The client creates a random `code_verifier`, sends `code_challenge = base64url(SHA-256(verifier))` with the authorize request, and the verifier with the token request. An intercepted code is useless without the verifier. PKCE is required for public clients (SPAs, mobile) and recommended for all." },
        { title: 'OpenID Connect adds identity', body: "With `scope=openid`, the token response includes an ID token (a JWT about the user: `sub`, `email`, `nonce`). Validate its signature (provider JWKS), `iss`, `aud` (your client id), `exp` and `nonce`. Use the access token for APIs, the ID token only to learn who logged in." },
        { title: 'Prefer a backend-for-frontend', body: "For browser apps, let your server perform the code exchange and keep tokens server-side, issuing your own HttpOnly session cookie. Redirect URIs must match exactly; never use wildcards." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Authorization code + PKCE', body: 'The browser only ever carries the short-lived code; tokens are exchanged server-to-server.', flow: ['app: create state + code_verifier', 'redirect → /authorize (code_challenge, state)', 'user signs in at provider', 'callback ?code&state → check state', 'POST /token with code + code_verifier', 'validate ID token → create session'] },
        { kind: 'security', title: 'The implicit flow is deprecated', body: 'Returning tokens directly in the redirect URL (response_type=token) leaks them via history, logs and referrers. OAuth 2.1 removes it: always use the authorization code flow with PKCE.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'pkce_from_scratch.ts',
          explanation: 'Runnable TypeScript: PKCE S256 checked against the RFC 7636 test vector, and an in-memory authorization server that enforces exact redirect URIs, single-use short-lived codes and verifier matching, while the client enforces state. An intercepted code and a forged callback are both rejected. All asserted.',
          code: raw`//  AUTHORIZATION CODE + PKCE
//
//   client: verifier (secret) -> challenge = base64url(sha256(verifier))
//   /authorize?challenge&state  -->  user logs in  -->  redirect ?code&state
//   /token  code + verifier  --> server checks sha256(verifier) == stored challenge
//   attacker with only the code (no verifier) --> rejected
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';

const challengeOf = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');
assert.equal(challengeOf('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
  'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');                   // RFC 7636 Appendix B

// ---- a tiny authorization server
const CLIENT = { id: 'web-app', redirectUri: 'https://app.example.com/callback' };
const codes = new Map<string, { challenge: string; redirectUri: string; user: string; expires: number; used: boolean }>();
function authorize(q: { client_id: string; redirect_uri: string; code_challenge: string; state: string }, user: string, now: number) {
  if (q.client_id !== CLIENT.id || q.redirect_uri !== CLIENT.redirectUri) throw new Error('invalid redirect_uri');  // exact match
  const code = randomBytes(16).toString('base64url');
  codes.set(code, { challenge: q.code_challenge, redirectUri: q.redirect_uri, user, expires: now + 60_000, used: false });
  return q.redirect_uri + '?code=' + code + '&state=' + q.state;
}
function token(body: { code: string; code_verifier: string; redirect_uri: string }, now: number) {
  const rec = codes.get(body.code);
  if (!rec || rec.used || rec.expires < now) throw new Error('invalid_grant');
  rec.used = true;                                                 // single use, even on failure below
  if (rec.redirectUri !== body.redirect_uri) throw new Error('invalid_grant');
  if (challengeOf(body.code_verifier) !== rec.challenge) throw new Error('invalid_grant: pkce');
  return { access_token: 'at_' + rec.user, token_type: 'Bearer', expires_in: 900 };
}

// ---- the client
const verifier = randomBytes(32).toString('base64url');
const state = randomBytes(16).toString('base64url');
const callbackUrl = new URL(authorize({ client_id: 'web-app', redirect_uri: CLIENT.redirectUri, code_challenge: challengeOf(verifier), state }, 'ada', 0));
assert.equal(callbackUrl.searchParams.get('state'), state);           // client MUST compare state
const code = callbackUrl.searchParams.get('code')!;

// attacker intercepts the code but lacks the verifier
assert.throws(() => token({ code, code_verifier: 'guess', redirect_uri: CLIENT.redirectUri }, 1000), /pkce/);
// the code is now burned, so even the legitimate client must restart the flow
assert.throws(() => token({ code, code_verifier: verifier, redirect_uri: CLIENT.redirectUri }, 1000), /invalid_grant/);

const fresh = new URL(authorize({ client_id: 'web-app', redirect_uri: CLIENT.redirectUri, code_challenge: challengeOf(verifier), state }, 'ada', 2000));
const tokens = token({ code: fresh.searchParams.get('code')!, code_verifier: verifier, redirect_uri: CLIENT.redirectUri }, 3000);
assert.equal(tokens.access_token, 'at_ada');
assert.throws(() => authorize({ client_id: 'web-app', redirect_uri: 'https://evil.example/cb', code_challenge: 'x', state }, 'ada', 0), /redirect_uri/);
const expired = new URL(authorize({ client_id: 'web-app', redirect_uri: CLIENT.redirectUri, code_challenge: challengeOf(verifier), state }, 'ada', 0));
assert.throws(() => token({ code: expired.searchParams.get('code')!, code_verifier: verifier, redirect_uri: CLIENT.redirectUri }, 61_000), /invalid_grant/);
console.log('PKCE vector ok; intercepted code rejected; tokens issued:', tokens.token_type, tokens.expires_in + 's');`,
        },
        production: {
          language: 'ts',
          filename: 'oidc-bff.ts',
          explanation: 'Production backend-for-frontend login with OpenID Connect: state, nonce and PKCE verifier kept in a short-lived signed HttpOnly cookie, the code exchanged server-to-server, the ID token validated against the provider\'s JWKS with jose, and the browser receiving only your own session cookie.',
          code: raw`import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Request, Response } from 'express';

const ISSUER = 'https://accounts.example-idp.com';
const CLIENT_ID = process.env.OIDC_CLIENT_ID!;
const CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET!;              // confidential client: server-side only
const REDIRECT_URI = 'https://app.example.com/auth/callback';       // registered exactly, no wildcards
const JWKS = createRemoteJWKSet(new URL(ISSUER + '/.well-known/jwks.json'));
const rand = () => randomBytes(32).toString('base64url');

export function startLogin(_req: Request, res: Response) {
  const tx = { state: rand(), nonce: rand(), verifier: rand() };
  res.cookie('oidc_tx', JSON.stringify(tx), { httpOnly: true, secure: true, sameSite: 'lax', signed: true, maxAge: 10 * 60_000 });
  const url = new URL(ISSUER + '/authorize');
  url.search = new URLSearchParams({
    response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI,
    scope: 'openid email profile', state: tx.state, nonce: tx.nonce,
    code_challenge: createHash('sha256').update(tx.verifier).digest('base64url'),
    code_challenge_method: 'S256',
  }).toString();
  res.redirect(url.toString());
}

export async function callback(req: Request, res: Response) {
  const tx = JSON.parse(req.signedCookies.oidc_tx ?? 'null') as { state: string; nonce: string; verifier: string } | null;
  res.clearCookie('oidc_tx');
  if (!tx || req.query.state !== tx.state) return res.status(400).send('Invalid login state');   // login CSRF

  const tokenRes = await fetch(ISSUER + '/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded',
               authorization: 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64') },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: String(req.query.code),
                                redirect_uri: REDIRECT_URI, code_verifier: tx.verifier }),
  });
  if (!tokenRes.ok) return res.status(401).send('Login failed');
  const { id_token } = (await tokenRes.json()) as { id_token: string };

  const { payload } = await jwtVerify(id_token, JWKS, { issuer: ISSUER, audience: CLIENT_ID });
  if (payload.nonce !== tx.nonce) return res.status(401).send('Login failed');             // replay protection

  const user = await users.upsertFromOidc({ sub: payload.sub!, email: String(payload.email) });
  const session = await sessions.create(user.id);                     // tokens stay server-side
  res.cookie('__Host-session', session.id, { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
  res.redirect('/');
}`,
        },
        bug: {
          explanation:
            'The callback accepts any code without checking state or using PKCE, so an attacker can send a victim a link to /callback?code=ATTACKER_CODE and log the victim into the attacker\'s account (login CSRF), and an intercepted code can be redeemed by anyone holding the client credentials. Verify state and send the PKCE verifier.',
          buggy: {
            language: 'ts',
            filename: 'callback.ts',
            code: raw`// ❌ No state check, no PKCE: any code from anywhere is exchanged
app.get('/auth/callback', async (req, res) => {
  const tokens = await exchangeCode({ code: String(req.query.code) });
  req.session.userId = (await userFromIdToken(tokens.id_token)).id;
  res.redirect('/');
});`,
          },
          fixed: {
            language: 'ts',
            filename: 'callback.ts',
            code: raw`// ✅ State must match the value we stored; the code is bound to our PKCE verifier
app.get('/auth/callback', async (req, res) => {
  const tx = readSignedTxCookie(req);                      // { state, nonce, verifier } from startLogin
  if (!tx || req.query.state !== tx.state) return res.status(400).send('Invalid login state');
  const tokens = await exchangeCode({ code: String(req.query.code), code_verifier: tx.verifier });
  const claims = await verifyIdToken(tokens.id_token, { nonce: tx.nonce });
  await regenerateSession(req, claims.sub);                // new session id after login
  res.redirect('/');
});`,
          },
        },
      },
      takeaways: [
        'OAuth delegates sign-in: the app gets a short-lived code, then exchanges it server-to-server for tokens.',
        'state prevents login CSRF; PKCE binds the code to the client that started the flow.',
        'OIDC adds an ID token: verify signature (JWKS), iss, aud, exp and nonce.',
        'Use exact redirect URIs, no implicit flow, and keep tokens server-side behind a session cookie (BFF).',
        'Practice drill: in Tab 1, try the token request with the right verifier but redirect_uri "https://app.example.com/other" and confirm it fails with invalid_grant.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'web-rbac-rls',
      title: 'RBAC & PostgreSQL Row Level Security for Multi-Tenant Apps',
      summary: 'Model roles and permissions, enforce them in middleware, and add a database-level safety net with Row Level Security so one tenant can never read another tenant\'s rows, even when application code has a bug.',
      difficulty: 'Advanced',
      minutes: 25,
      xp: 150,
      analogy:
        "RBAC is the job titles in an office building: managers can open the finance cabinet, interns cannot. Row Level Security is a filing cabinet that checks your company badge on every drawer: even if the receptionist (your API code) sends you to the wrong floor, the drawers only open for your own company's files.",
      intuition: [
        { title: 'Authentication vs authorization', body: "Authentication answers who you are; authorization answers what you may do to which object. Most real breaches are authorization bugs (IDOR: changing `/invoices/42` to `/invoices/43`), not broken logins." },
        { title: 'RBAC', body: "Users get roles (per tenant), roles grant permissions (`invoice:read`, `invoice:approve`). Code checks permissions, not role names, so adding a role never requires code changes. Add ownership or attribute checks (\"only the invoice's creator may edit drafts\") on top." },
        { title: 'Tenant isolation is a must-have', body: "In a shared-schema multi-tenant app, every query must include `tenant_id = $current`. One forgotten WHERE clause leaks another customer's data. Row Level Security makes the database enforce it." },
        { title: 'How RLS works', body: "`ALTER TABLE invoices ENABLE ROW LEVEL SECURITY` plus a policy `USING (tenant_id = current_setting('app.tenant_id')::uuid)` filters every SELECT/UPDATE/DELETE; `WITH CHECK` validates INSERT/UPDATE. The app sets the tenant per transaction with `set_config('app.tenant_id', $1, true)`." },
        { title: 'Who bypasses RLS', body: "Superusers and roles with BYPASSRLS always bypass it; the table owner bypasses it unless you use `FORCE ROW LEVEL SECURITY`. Connect the application as a dedicated non-owner role, and keep migrations on a separate owner role." },
        { title: 'Transaction-local settings', body: "With connection pooling, a session-level `SET app.tenant_id` survives on the pooled connection and leaks into the next request. Use `set_config(..., true)` inside a transaction so the setting disappears at COMMIT/ROLLBACK." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Two layers of authorization', body: 'The API checks permissions; the database guarantees tenant isolation.', flow: ['request + session', 'middleware: requirePermission("invoice:read")', 'BEGIN; set_config(app.tenant_id, …, true)', 'query (RLS policy filters rows)', 'COMMIT (setting discarded)'] },
        { kind: 'tip', title: 'Supabase uses exactly this', body: 'Supabase exposes Postgres through an API and relies on RLS policies (with auth.uid()) for all data access. This project\'s supabase_schema.sql enables RLS on every table and only allows writes through security-definer functions.' },
      ],
      code: {
        basic: {
          language: 'sql',
          filename: 'rbac_rls_from_scratch.sql',
          explanation: 'Runs as-is on PostgreSQL (verified in PGlite, Postgres 18): RBAC tables with a has_permission() function, tenant-isolated invoices protected by ENABLE + FORCE ROW LEVEL SECURITY with USING and WITH CHECK, and a non-owner app role. DO blocks with ASSERT prove each tenant sees only its rows, cross-tenant inserts fail, and an unset tenant sees nothing.',
          code: raw`--  ROW LEVEL SECURITY
--
--   app_user --SELECT * FROM invoices--> policy: tenant_id = app.tenant_id
--            tenant 1 -> rows {1, 2}        tenant 2 -> row {3}        unset -> {}
--   INSERT with another tenant_id --> WITH CHECK fails (SQLSTATE 42501)

-- ---------- RBAC
CREATE TABLE tenants (id int PRIMARY KEY, name text NOT NULL);
CREATE TABLE users   (id int PRIMARY KEY, email text UNIQUE NOT NULL);
CREATE TABLE role_permissions (role text NOT NULL, permission text NOT NULL, PRIMARY KEY (role, permission));
CREATE TABLE memberships (user_id int REFERENCES users(id), tenant_id int REFERENCES tenants(id),
                          role text NOT NULL, PRIMARY KEY (user_id, tenant_id));

INSERT INTO tenants VALUES (1, 'Acme'), (2, 'Globex');
INSERT INTO users VALUES (10, 'ana@acme.test'), (20, 'gus@globex.test');
INSERT INTO role_permissions VALUES ('admin', 'invoice:read'), ('admin', 'invoice:approve'), ('viewer', 'invoice:read');
INSERT INTO memberships VALUES (10, 1, 'admin'), (20, 2, 'viewer');

CREATE FUNCTION has_permission(p_user int, p_tenant int, p_perm text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships m JOIN role_permissions rp ON rp.role = m.role
    WHERE m.user_id = p_user AND m.tenant_id = p_tenant AND rp.permission = p_perm)
$$;

DO $$ BEGIN
  ASSERT has_permission(10, 1, 'invoice:approve'), 'admin can approve';
  ASSERT NOT has_permission(20, 2, 'invoice:approve'), 'viewer cannot approve';
  ASSERT NOT has_permission(10, 2, 'invoice:read'), 'no access to another tenant';
END $$;

-- ---------- tenant data protected by RLS
CREATE TABLE invoices (
  id serial PRIMARY KEY,
  tenant_id int NOT NULL REFERENCES tenants(id),
  amount_cents int NOT NULL CHECK (amount_cents > 0)
);
INSERT INTO invoices (tenant_id, amount_cents) VALUES (1, 1000), (1, 2500), (2, 9900);

CREATE ROLE app_user NOLOGIN;                              -- the API connects as this non-owner role
GRANT SELECT, INSERT, UPDATE, DELETE ON invoices TO app_user;
GRANT USAGE ON SEQUENCE invoices_id_seq TO app_user;

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;             -- apply to the table owner too
CREATE POLICY tenant_isolation ON invoices
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int);

SET ROLE app_user;

SELECT set_config('app.tenant_id', '1', false);
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM invoices) = 2, 'tenant 1 sees exactly its 2 invoices';
  ASSERT (SELECT sum(amount_cents) FROM invoices) = 3500;
  BEGIN
    INSERT INTO invoices (tenant_id, amount_cents) VALUES (2, 1);        -- write into another tenant
    RAISE EXCEPTION 'cross-tenant insert should have failed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;                       -- 42501: RLS WITH CHECK
  END;
  UPDATE invoices SET amount_cents = 1 WHERE tenant_id = 2;               -- silently matches 0 rows
  ASSERT NOT FOUND, 'cannot update rows of another tenant';
END $$;

SELECT set_config('app.tenant_id', '2', false);
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM invoices) = 1, 'tenant 2 sees 1 invoice';
  ASSERT (SELECT amount_cents FROM invoices) = 9900, 'and its value was not modified';
END $$;

SELECT set_config('app.tenant_id', '', false);
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM invoices) = 0, 'no tenant set: fail closed';
END $$;

RESET ROLE;`,
        },
        production: {
          language: 'ts',
          filename: 'tenant-db.ts',
          explanation: 'Production Node.js + node-postgres: a permission middleware backed by the RBAC tables, and a withTenant() helper that runs each request in a transaction with a transaction-local tenant setting, so RLS applies and nothing leaks between pooled connections. The pool connects as the non-owner app role.',
          code: raw`import pg from 'pg';
import type { NextFunction, Request, Response } from 'express';

// connects as app_user (non-owner, no BYPASSRLS); migrations use a different role
const pool = new pg.Pool({ connectionString: process.env.APP_DATABASE_URL });

export async function withTenant<T>(tenantId: string, fn: (db: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);   // true = transaction-local
    const result = await fn(client);
    await client.query('COMMIT');                         // the setting disappears here
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export const requirePermission = (permission: string) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const { rows } = await pool.query('SELECT has_permission($1, $2, $3) AS ok',
      [req.session.userId, req.session.tenantId, permission]);
    if (!rows[0]?.ok) return res.status(403).json({ title: 'Forbidden', status: 403 });
    next();
  };

// usage: no tenant_id in the WHERE clause is needed for safety; RLS guarantees it
app.get('/api/invoices/:id', requirePermission('invoice:read'), async (req, res) => {
  const invoice = await withTenant(req.session.tenantId, async (db) =>
    (await db.query('SELECT id, amount_cents FROM invoices WHERE id = $1', [req.params.id])).rows[0]);
  if (!invoice) return res.status(404).json({ title: 'Not Found', status: 404 });   // other tenants' ids look missing
  res.json(invoice);
});

app.post('/api/invoices/:id/approve', requirePermission('invoice:approve'), async (req, res) => {
  await withTenant(req.session.tenantId, (db) =>
    db.query("UPDATE invoices SET status = 'approved' WHERE id = $1", [req.params.id]));
  res.status(204).end();
});`,
        },
        bug: {
          explanation:
            'A session-level SET on a pooled connection outlives the request: the next request that borrows the same connection (possibly for a different tenant, or one that forgot to set it) runs with the previous tenant\'s id and reads their data. Set the tenant with set_config(..., true) inside a transaction so it is discarded at COMMIT/ROLLBACK.',
          buggy: {
            language: 'ts',
            filename: 'tenant.ts',
            code: raw`// ❌ Session-level setting leaks to whoever gets this pooled connection next
export async function queryAsTenant(tenantId: string, sql: string, params: unknown[]) {
  const client = await pool.connect();
  await client.query("SET app.tenant_id = '" + tenantId + "'");   // also SQL injection via tenantId!
  const result = await client.query(sql, params);
  client.release();                                                // setting still attached
  return result;
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'tenant.ts',
            code: raw`// ✅ Parameterised, transaction-local, always released
export async function queryAsTenant(tenantId: string, sql: string, params: unknown[]) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await client.query(sql, params);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}`,
          },
        },
      },
      takeaways: [
        'Authorization bugs (IDOR, missing tenant filters) are more common than broken logins.',
        'RBAC: users → roles (per tenant) → permissions; code checks permissions, plus ownership rules.',
        'RLS enforces tenant isolation in the database; use FORCE RLS and a non-owner app role.',
        'Set the tenant with set_config(…, true) inside a transaction; session-level SET leaks across pooled requests.',
        'Practice drill: add a viewer-only policy so users can SELECT but only admins can UPDATE (hint: a second policy FOR UPDATE using has_permission and a current_setting(\'app.user_id\')).',
      ],
    },
  ],
};
