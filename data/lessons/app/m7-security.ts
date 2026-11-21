import type { Module } from '../../types';

const raw = String.raw;

export const securityModule: Module = {
  id: 'app-security',
  title: 'Mobile Security & On-Device Auth',
  level: 'Advanced',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'app-secure-storage-keychain',
      title: 'iOS Keychain & Android Keystore vs Plain Storage, and Biometric Gating',
      summary: 'Why tokens in AsyncStorage, MMKV or SharedPreferences leak through backups, rooted devices and file dumps, how the Keychain and Keystore protect secrets with hardware-backed keys, and how to gate sensitive actions with biometrics correctly.',
      difficulty: 'Advanced',
      minutes: 22,
      xp: 140,
      analogy:
        "Plain app storage is a notebook in your desk drawer: anyone who gets the desk (a backup, a rooted phone, a forensic copy) can read it. The Keychain and Keystore are a bank's safe-deposit box: the key that opens it never leaves the bank's vault (the Secure Enclave / TEE), you can require ID (biometrics) at the counter, and copying the box's contents elsewhere gives you nothing readable.",
      intuition: [
        { title: 'Plain storage is plaintext on disk', body: "AsyncStorage, unencrypted MMKV, SharedPreferences and UserDefaults are files in the app sandbox. The sandbox stops other apps, not a rooted/jailbroken device, malware with elevated access, debug builds, or backups (Android Auto Backup and unencrypted iOS backups may include them)." },
        { title: 'Keychain and Keystore', body: "iOS Keychain stores items encrypted with keys protected by the Secure Enclave; Android Keystore keeps keys in the TEE or StrongBox so they cannot be extracted, and libraries encrypt data with them. In React Native use expo-secure-store or react-native-keychain." },
        { title: 'Accessibility classes', body: "Choose when an item is readable: `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (only while unlocked, never migrated to another device via backup) suits auth tokens. `AFTER_FIRST_UNLOCK` is needed if background tasks must read it while the phone is locked." },
        { title: 'What belongs there', body: "Refresh tokens, session tokens, encryption keys for the local database, private keys. Not large data: store the key in the Keychain and encrypt the bulk data with it. Short-lived access tokens can live in memory only." },
        { title: 'Biometrics: gate, don\'t pretend', body: "A local biometric prompt that only returns `true` is easy to bypass on a compromised device. For real protection, bind the secret to biometrics so the OS releases it only after authentication (Keychain access control / Keystore keys requiring user authentication; `requireAuthentication` in expo-secure-store), and keep a device-passcode fallback." },
        { title: 'Clear on logout and on reinstall', body: "Delete tokens and keys on logout. iOS Keychain items can survive an app uninstall, so on first launch after install (detected with a flag in normal storage) clear stale Keychain entries." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Where secrets live', body: 'Hardware protects the key; the key protects the data.', flow: ['access token → memory only', 'refresh token → Keychain / Keystore (THIS_DEVICE_ONLY)', 'DB encryption key → Keychain / Keystore', 'bulk data → SQLite encrypted with that key', 'sensitive action → biometric-bound key release'] },
        { kind: 'security', title: 'Threat model, briefly', body: 'Assume stolen unlocked phones, rooted devices, malicious backups and debug-built apps. Secure storage limits what an attacker can extract from disk; server-side session revocation and short token lifetimes limit what they can do with anything stolen.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'secure_storage_model.ts',
          explanation: 'Runnable TypeScript model using node:crypto: an attacker scanning a dumped app sandbox finds a refresh token stored as plain JSON, but not one stored as an AES-256-GCM blob whose key is held by a non-exportable "keystore"; tampering is detected by the auth tag; and a biometric-bound key refuses to decrypt until authentication succeeds. All asserted.',
          code: raw`//  WHAT AN ATTACKER WITH A FILE DUMP SEES
//
//   /data/.../AsyncStorage/manifest.json : {"refreshToken":"rt_live_8f2c..."}   <- readable
//   keychain blob                        : 9a1f...c3 (AES-256-GCM)              <- useless without the key
//   key                                  : inside Secure Enclave / TEE, cannot be exported
//   biometric-bound key: decrypt() refuses until the OS verifies Face ID / fingerprint
import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const TOKEN = 'rt_live_8f2c4b7d1e9a6f3c';

// 1) plain storage: a JSON file in the sandbox
const plainFile = JSON.stringify({ refreshToken: TOKEN, theme: 'dark' });

// 2) a "keystore": keys are created inside and never returned to the caller
function createKeystore() {
  const keys = new Map<string, { key: Buffer; requiresBiometrics: boolean }>();
  let biometricOkUntil = 0;
  return {
    generateKey(alias: string, requiresBiometrics: boolean) { keys.set(alias, { key: randomBytes(32), requiresBiometrics }); },
    authenticate(success: boolean, now: number) { if (success) biometricOkUntil = now + 10_000; },
    encrypt(alias: string, plaintext: string) {
      const { key } = keys.get(alias)!;
      const iv = randomBytes(12);
      const c = createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([c.update(plaintext, 'utf8'), c.final()]);
      return Buffer.concat([iv, c.getAuthTag(), data]).toString('base64');
    },
    decrypt(alias: string, blob: string, now: number) {
      const entry = keys.get(alias)!;
      if (entry.requiresBiometrics && now > biometricOkUntil) throw new Error('user authentication required');
      const buf = Buffer.from(blob, 'base64');
      const d = createDecipheriv('aes-256-gcm', entry.key, buf.subarray(0, 12));
      d.setAuthTag(buf.subarray(12, 28));
      return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');   // throws if tampered
    },
  };
}

const keystore = createKeystore();
keystore.generateKey('auth', false);
keystore.generateKey('payments', true);
const secureBlob = keystore.encrypt('auth', TOKEN);

// attacker dumps the sandbox and greps for tokens
const dump = plainFile + '\n' + secureBlob;
const found = dump.match(/rt_live_[a-z0-9]+/g) ?? [];
assert.deepEqual(found, [TOKEN]);                                // only the plaintext copy leaks
assert.ok(!secureBlob.includes(TOKEN));
assert.equal(keystore.decrypt('auth', secureBlob, 0), TOKEN);    // the app itself can read it

// tampering with the ciphertext is detected
const tampered = Buffer.from(secureBlob, 'base64'); tampered[tampered.length - 1] ^= 0x01;
assert.throws(() => keystore.decrypt('auth', tampered.toString('base64'), 0), /unable to authenticate|auth/i);

// biometric-bound key: no authentication, no plaintext
const cardBlob = keystore.encrypt('payments', 'card-token-4417');
assert.throws(() => keystore.decrypt('payments', cardBlob, 1000), /user authentication required/);
keystore.authenticate(true, 2000);
assert.equal(keystore.decrypt('payments', cardBlob, 3000), 'card-token-4417');
assert.throws(() => keystore.decrypt('payments', cardBlob, 20_000), /user authentication required/);   // validity window expired
console.log('leaked from dump:', found, '| keystore blob length', secureBlob.length);`,
        },
        production: {
          language: 'ts',
          filename: 'tokenStore.ts',
          explanation: 'Production React Native with expo-secure-store and expo-local-authentication: the refresh token is stored in the Keychain/Keystore with WHEN_UNLOCKED_THIS_DEVICE_ONLY, access tokens stay in memory, a biometric-protected item (requireAuthentication) guards high-risk actions, and stale Keychain items from a previous install are cleared on first launch.',
          code: raw`import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { MMKV } from 'react-native-mmkv';

const REFRESH = 'auth.refreshToken';
const PAYMENT_KEY = 'payments.signingKey';
const flags = new MMKV({ id: 'flags' });                         // non-secret flags only
let accessToken: string | null = null;                           // memory only, minutes long

const secureOpts: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,  // not in backups, not when locked
};

// iOS keeps Keychain items after uninstall: clear leftovers on the first launch of a fresh install
export async function clearStaleSecretsOnFreshInstall() {
  if (flags.getBoolean('installed')) return;
  await Promise.all([SecureStore.deleteItemAsync(REFRESH, secureOpts), SecureStore.deleteItemAsync(PAYMENT_KEY)]);
  flags.set('installed', true);
}

export async function saveSession(tokens: { access: string; refresh: string }) {
  accessToken = tokens.access;
  await SecureStore.setItemAsync(REFRESH, tokens.refresh, secureOpts);
}

export async function getRefreshToken() {
  return SecureStore.getItemAsync(REFRESH, secureOpts);
}

export const getAccessToken = () => accessToken;

// A key that the OS releases only after Face ID / fingerprint / device passcode
export async function enablePaymentProtection(signingKey: string) {
  const ok = (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  if (!ok) throw new Error('Set up Face ID / fingerprint or a device passcode first');
  await SecureStore.setItemAsync(PAYMENT_KEY, signingKey, {
    requireAuthentication: true,                                  // bound to biometrics by the OS
    authenticationPrompt: 'Confirm to enable secure payments',
    keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
  });
}

export async function readPaymentKey() {
  // the OS shows the biometric prompt; on failure this throws instead of returning a value
  return SecureStore.getItemAsync(PAYMENT_KEY, { requireAuthentication: true, authenticationPrompt: 'Confirm payment' });
}

export async function logout(revokeOnServer: (refresh: string) => Promise<void>) {
  const refresh = await getRefreshToken();
  if (refresh) await revokeOnServer(refresh).catch(() => {});      // best effort; server revocation matters
  accessToken = null;
  await Promise.all([SecureStore.deleteItemAsync(REFRESH, secureOpts), SecureStore.deleteItemAsync(PAYMENT_KEY)]);
}`,
        },
        bug: {
          explanation:
            'AsyncStorage writes the refresh token in plaintext to the app sandbox, where it can be extracted from rooted devices, debug builds, file dumps and (on Android) backups. A long-lived refresh token is a full account takeover. Store it in the Keychain/Keystore via expo-secure-store and keep access tokens in memory.',
          buggy: {
            language: 'ts',
            filename: 'auth.ts',
            code: raw`// ❌ Long-lived credentials in plaintext app storage
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function onLogin(tokens: { access: string; refresh: string }) {
  await AsyncStorage.setItem('accessToken', tokens.access);
  await AsyncStorage.setItem('refreshToken', tokens.refresh);   // readable from a file dump / backup
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'auth.ts',
            code: raw`// ✅ Hardware-backed secure storage for the refresh token; access token in memory
import * as SecureStore from 'expo-secure-store';

let accessToken: string | null = null;
export async function onLogin(tokens: { access: string; refresh: string }) {
  accessToken = tokens.access;
  await SecureStore.setItemAsync('refreshToken', tokens.refresh, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}`,
          },
        },
      },
      takeaways: [
        'AsyncStorage, MMKV (unencrypted), SharedPreferences and UserDefaults are plaintext files: no secrets there.',
        'Store refresh tokens and encryption keys in the Keychain/Keystore with THIS_DEVICE_ONLY accessibility.',
        'Bind high-risk secrets to biometrics in the OS (requireAuthentication) instead of trusting a boolean prompt.',
        'Keep access tokens in memory, revoke on logout, and clear stale Keychain items after reinstall.',
        'Practice drill: in Tab 1, store the theme preference in the keystore too and explain why that is unnecessary (it is not a secret; use plain storage).',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'app-encryption-pinning',
      title: 'SQLite Encryption at Rest & TLS Certificate Pinning',
      summary: 'Encrypt the local database with a per-install key held in the Keychain/Keystore, and understand certificate pinning: how SPKI pins are computed, why backup pins and rotation plans are mandatory, and when not to pin.',
      difficulty: 'Advanced',
      minutes: 22,
      xp: 140,
      analogy:
        "Encrypting the database is locking the filing cabinet and keeping its key in the bank's safe-deposit box (the Keychain), not taped to the cabinet (a key hard-coded in the app). Certificate pinning is a bouncer who not only checks that a visitor's ID is genuine (normal TLS) but also that it is one of the specific faces on the guest list. Forget to add tomorrow's face (a backup pin) and you lock out your own staff.",
      intuition: [
        { title: 'Why encrypt the database', body: "Offline-first apps keep messages, health or financial data on the device. OS file encryption protects a locked, powered-off phone, but not data copied from an unlocked or compromised device or a backup. SQLCipher (supported by op-sqlite and others) encrypts every database page with AES." },
        { title: 'The key is everything', body: "Generate a random 256-bit key per install on first launch, store it in the Keychain/Keystore, and pass it when opening the database. A key embedded in the JavaScript bundle is public: anyone can unzip the app and read it." },
        { title: 'How TLS trust works', body: "Normally the OS trusts any certificate that chains to one of ~100 trusted root CAs and matches the hostname. A mis-issued certificate, a malicious CA or a user-installed root (corporate proxies, attackers' tooling) can therefore intercept traffic." },
        { title: 'Pinning', body: "Pinning additionally requires the server's public key to match a known value: the SHA-256 hash of the certificate's SubjectPublicKeyInfo (SPKI), base64-encoded. Pinning the public key (not the whole certificate) survives certificate renewals that reuse the key." },
        { title: 'Always ship backup pins', body: "Include at least one backup pin for a key you control but have not deployed yet (or your CA's intermediate). If the only pinned key is lost or rotated, every installed app version stops talking to your server until users update, a self-inflicted outage." },
        { title: 'When to pin', body: "Pinning helps high-risk apps (banking, health, enterprise) but adds operational risk. Configure it declaratively (Android network security config, iOS NSPinnedDomains) with an expiry, monitor it, and never pin third-party domains you don't control." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Data at rest and in transit', body: 'Both layers rely on keys the app cannot leak.', flow: ['first launch: random 32-byte key → Keychain/Keystore', 'open SQLCipher DB with that key', 'TLS handshake → OS validates chain + hostname', 'pin check: sha256(SPKI) ∈ {primary, backup}', 'mismatch → fail closed + report'] },
        { kind: 'warning', title: 'Pinning is not a substitute for backend security', body: 'Attackers can still reverse-engineer and call your API directly with their own client. Authenticate, authorise and rate-limit every request on the server regardless of pinning.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'pins_and_encryption.ts',
          explanation: 'Runnable TypeScript with node:crypto: real SPKI pins computed from generated EC key pairs, a pin validator that accepts the primary or backup key and rejects an attacker\'s key that would pass normal CA validation, a rotation to the backup key without an app update, and AES-GCM page encryption showing why a key hard-coded in the bundle protects nothing. All asserted.',
          code: raw`//  PIN CHECK DURING THE TLS HANDSHAKE
//
//   server cert --> public key (SPKI DER) --> sha256 --> base64 = "pin-sha256"
//   pinset { primary: AAA=, backup: BBB= }
//   CA-valid attacker cert (pin CCC=) --> chain OK, pin NOT in set --> connection refused
//   rotate server to backup key       --> pin BBB= in set           --> keeps working
import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, createHash, generateKeyPairSync, randomBytes } from 'node:crypto';

const spkiPin = (publicKey: import('node:crypto').KeyObject) =>
  createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('base64');

const primary = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const backup = generateKeyPairSync('ec', { namedCurve: 'P-256' });      // generated, stored offline, not deployed yet
const attacker = generateKeyPairSync('ec', { namedCurve: 'P-256' });    // e.g. a mis-issued but CA-valid certificate

const PINSET = new Set([spkiPin(primary.publicKey), spkiPin(backup.publicKey)]);
assert.equal(PINSET.size, 2);
assert.match([...PINSET][0], /^[A-Za-z0-9+/]{43}=$/);                    // 32-byte SHA-256, base64

function connect(serverKey: import('node:crypto').KeyObject, chainValid: boolean) {
  if (!chainValid) return 'rejected: untrusted chain';
  return PINSET.has(spkiPin(serverKey)) ? 'connected' : 'rejected: pin mismatch';
}
assert.equal(connect(primary.publicKey, true), 'connected');
assert.equal(connect(attacker.publicKey, true), 'rejected: pin mismatch');   // normal TLS would have accepted it
assert.equal(connect(backup.publicKey, true), 'connected');                   // rotation without an app update
assert.equal(spkiPin(primary.publicKey), spkiPin(primary.publicKey));        // renewing a cert with the same key keeps the pin

// encryption at rest: per-install random key vs a key hard-coded in the bundle
function encryptPage(key: Buffer, page: string) {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(page), c.final()]);
  return { iv, tag: c.getAuthTag(), data };
}
function decryptPage(key: Buffer, p: { iv: Buffer; tag: Buffer; data: Buffer }) {
  const d = createDecipheriv('aes-256-gcm', key, p.iv); d.setAuthTag(p.tag);
  return Buffer.concat([d.update(p.data), d.final()]).toString();
}
const page = 'patient: Rahim, diagnosis: confidential';
const hardCoded = createHash('sha256').update('my-app-secret-2026').digest();   // visible in the JS bundle
const perInstall = randomBytes(32);                                              // would live in the Keychain
const leakedA = encryptPage(hardCoded, page), leakedB = encryptPage(perInstall, page);
assert.equal(decryptPage(createHash('sha256').update('my-app-secret-2026').digest(), leakedA), page);   // attacker reads it
assert.throws(() => decryptPage(randomBytes(32), leakedB));                                            // cannot without the key
assert.ok(!leakedB.data.toString('latin1').includes('diagnosis'));
console.log('pinset:', [...PINSET].map((p) => p.slice(0, 12) + '...').join(', '));`,
        },
        production: {
          language: 'ts',
          filename: 'secureDb.ts',
          explanation: 'Production React Native: a per-install 256-bit database key generated with expo-crypto and kept in the Keychain/Keystore, an op-sqlite database opened with SQLCipher encryption, and the declarative pinning configuration for both platforms (with backup pins and an expiry) shown alongside.',
          code: raw`// package.json: "op-sqlite": { "sqlcipher": true }   (builds op-sqlite against SQLCipher)
import { open, type DB } from '@op-engineering/op-sqlite';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const KEY_ALIAS = 'db.encryptionKey';
const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

async function getOrCreateDbKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_ALIAS);
  if (existing) return existing;
  const key = toHex(await Crypto.getRandomBytesAsync(32));        // 256-bit, unique per install
  await SecureStore.setItemAsync(KEY_ALIAS, key, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,   // background sync can open the DB
  });
  return key;
}

let db: DB | null = null;
export async function openSecureDb(): Promise<DB> {
  if (db) return db;
  db = open({ name: 'app.sqlite', encryptionKey: await getOrCreateDbKey() });   // every page AES-encrypted
  await db.execute('PRAGMA journal_mode = WAL');
  await db.execute('CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, body TEXT NOT NULL)');
  return db;
}

/* ---------- Certificate pinning (declarative, no JS involved) ----------

Android: res/xml/network_security_config.xml (referenced from AndroidManifest.xml)
  <network-security-config>
    <domain-config cleartextTrafficPermitted="false">
      <domain includeSubdomains="true">api.example.com</domain>
      <pin-set expiration="2027-06-01">
        <pin digest="SHA-256">PRIMARY_SPKI_PIN_BASE64=</pin>
        <pin digest="SHA-256">BACKUP_SPKI_PIN_BASE64=</pin>
      </pin-set>
    </domain-config>
  </network-security-config>

iOS: Info.plist -> NSAppTransportSecurity -> NSPinnedDomains -> api.example.com
  NSIncludesSubdomains = YES
  NSPinnedLeafIdentities = [ { SPKI-SHA256-BASE64 = PRIMARY... }, { SPKI-SHA256-BASE64 = BACKUP... } ]

Compute a pin from a live server (run on a trusted network):
  openssl s_client -connect api.example.com:443 -servername api.example.com </dev/null \
    | openssl x509 -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64
*/`,
        },
        bug: {
          explanation:
            'The database "encryption" key is a string literal in the JavaScript bundle. Anyone can download the app, extract the bundle and read the key, so every user\'s encrypted database can be decrypted with it: the protection is cosmetic. Generate a random key per install and keep it in the Keychain/Keystore.',
          buggy: {
            language: 'ts',
            filename: 'db.ts',
            code: raw`// ❌ The same key for every install, readable by unzipping the app
import { open } from '@op-engineering/op-sqlite';

export const db = open({ name: 'app.sqlite', encryptionKey: 'S3cr3t-Key-2026!' });`,
          },
          fixed: {
            language: 'ts',
            filename: 'db.ts',
            code: raw`// ✅ Random per-install key generated on first launch, stored in the Keychain / Keystore
import { open } from '@op-engineering/op-sqlite';

export async function openDb() {
  const key = await getOrCreateDbKey();          // expo-crypto random bytes -> SecureStore
  return open({ name: 'app.sqlite', encryptionKey: key });
}`,
          },
        },
      },
      takeaways: [
        'Encrypt sensitive local databases (SQLCipher) with a random per-install key stored in the Keychain/Keystore.',
        'A key hard-coded in the app bundle is public: it protects nothing.',
        'Pin the SPKI SHA-256 of keys you control, always with backup pins and an expiry, configured declaratively.',
        'Pinning adds outage risk and does not replace server-side authentication and authorization.',
        'Practice drill: in Tab 1, simulate a lost primary key with no backup pin in the set and list what happens to every installed app version (all connections fail until users install an update).',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'app-deep-link-hardening',
      title: 'Hardening Deep Links: Validation, Open Redirects & Confirmations',
      summary: 'Deep links are untrusted input that can come from any website, message or app. Validate every link against an allowlist, never perform actions directly from a link, block open redirects, and prefer verified HTTPS links over hijackable custom schemes.',
      difficulty: 'Advanced',
      minutes: 20,
      xp: 130,
      analogy:
        "A deep link is a note slipped under your front door saying \"go to the kitchen and turn on the oven\". A sensible person reads it, checks it is a room in their own house, and would never turn on the oven just because a note said so: they would look first and decide. And they would not follow a note that says \"leave the house and go to this stranger's address\".",
      intuition: [
        { title: 'Links are attacker-controlled input', body: "Anyone can craft `myapp://transfer?to=attacker&amount=500` or `https://example.com/app/...` and put it on a web page, an ad, an email or a QR code. Treat every parameter like an HTTP request from the internet." },
        { title: 'Custom schemes can be hijacked', body: "Any app can register `myapp://`. On Android, another installed app may claim it; on iOS the first-installed app wins. Use verified Universal Links / App Links (Module 8) for anything sensitive, especially OAuth redirects (with PKCE)." },
        { title: 'Navigate, never act', body: "A link may open a screen; it must not perform a state-changing action (transfer, delete, follow, purchase, change email). Open a confirmation screen pre-filled with validated values and require an explicit tap, plus authentication where appropriate." },
        { title: 'Allowlist routes and validate params', body: "Map URLs to a fixed set of screens; reject everything else. Validate each parameter's format (ids match a pattern, amounts are positive numbers within limits) and re-authorise on the server when the screen loads data." },
        { title: 'No open redirects', body: "Parameters like `?next=` or `?url=` that the app navigates to or opens in a WebView must be relative paths or hosts on an allowlist. Otherwise a trusted-looking link bounces users to a phishing page inside your app's chrome." },
        { title: 'WebViews are powerful', body: "Never load arbitrary URLs from links into a WebView that has a JavaScript bridge or your session cookies. Open external content in the system browser (SFSafariViewController / Custom Tabs) instead." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Safe link handling', body: 'Every incoming URL passes through one validator.', flow: ['incoming URL (cold start or running)', 'scheme/host allowlisted? (prefer https)', 'route in table? params valid?', 'redirect targets relative / allowlisted?', 'navigate to screen (actions → confirmation screen)', 'else → home + log'] },
        { kind: 'security', title: 'Auth state matters', body: 'If a link targets a screen that requires login, store the validated target, complete login, then navigate. Never pass tokens, one-time codes or personal data in link parameters you also log or share.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'link_validator_from_scratch.ts',
          explanation: 'Runnable TypeScript: one validator for every incoming URL with scheme/host allowlists, a route table with parameter validators, conversion of action links into confirmation screens (never direct execution), open-redirect protection for next= parameters, and rejection of javascript:, unknown hosts and malformed values. All asserted.',
          code: raw`//  INCOMING LINK -> DECISION
//
//   https://shop.example.com/orders/42           -> OrderDetail {id: 42}
//   myapp://transfer?to=alice&amount=25           -> ConfirmTransfer (NOT executed)
//   https://shop.example.com/login?next=//evil.io -> Login {next: '/'}   (open redirect blocked)
//   https://evil.io/orders/42, javascript:alert(1) -> Home (rejected)
import assert from 'node:assert/strict';

type Screen = { screen: string; params?: Record<string, string> };
const HOSTS = new Set(['shop.example.com']);
const SCHEMES = new Set(['https:', 'myapp:']);

function safeNext(next: string | null): string {
  if (!next) return '/';
  // only same-app relative paths: must start with exactly one "/" and contain no scheme or backslash
  return /^\/(?!\/)[A-Za-z0-9/_-]*$/.test(next) ? next : '/';
}

const ROUTES: Array<{ pattern: RegExp; build: (m: RegExpMatchArray, q: URLSearchParams) => Screen | null }> = [
  { pattern: /^\/orders\/(\d{1,12})$/, build: (m) => ({ screen: 'OrderDetail', params: { id: m[1] } }) },
  { pattern: /^\/transfer$/, build: (_m, q) => {
      const to = q.get('to') ?? '', amount = Number(q.get('amount'));
      if (!/^[a-z0-9_]{3,30}$/.test(to) || !Number.isFinite(amount) || amount <= 0 || amount > 1000) return null;
      return { screen: 'ConfirmTransfer', params: { to, amount: amount.toFixed(2) } };   // user must confirm
    } },
  { pattern: /^\/login$/, build: (_m, q) => ({ screen: 'Login', params: { next: safeNext(q.get('next')) } }) },
];

function handleLink(raw: string): Screen {
  let url: URL;
  try { url = new URL(raw); } catch { return { screen: 'Home' }; }
  if (!SCHEMES.has(url.protocol)) return { screen: 'Home' };
  // custom scheme: myapp://orders/42 parses with host "orders"; normalise to a path
  const path = url.protocol === 'myapp:' ? '/' + url.host + url.pathname.replace(/\/$/, '') : url.pathname;
  if (url.protocol === 'https:' && !HOSTS.has(url.hostname)) return { screen: 'Home' };
  for (const r of ROUTES) {
    const m = path.match(r.pattern);
    if (m) return r.build(m, url.searchParams) ?? { screen: 'Home' };
  }
  return { screen: 'Home' };
}

assert.deepEqual(handleLink('https://shop.example.com/orders/42'), { screen: 'OrderDetail', params: { id: '42' } });
assert.deepEqual(handleLink('myapp://orders/42'), { screen: 'OrderDetail', params: { id: '42' } });
assert.deepEqual(handleLink('myapp://transfer?to=alice&amount=25'), { screen: 'ConfirmTransfer', params: { to: 'alice', amount: '25.00' } });
assert.deepEqual(handleLink('myapp://transfer?to=alice&amount=-5'), { screen: 'Home' });
assert.deepEqual(handleLink('myapp://transfer?to=alice&amount=999999'), { screen: 'Home' });
assert.deepEqual(handleLink('https://shop.example.com/login?next=/orders/42'), { screen: 'Login', params: { next: '/orders/42' } });
for (const evilNext of ['//evil.io', 'https://evil.io', '/\\evil.io', 'javascript:alert(1)']) {
  assert.deepEqual(handleLink('https://shop.example.com/login?next=' + encodeURIComponent(evilNext)).params, { next: '/' });
}
assert.deepEqual(handleLink('https://evil.io/orders/42'), { screen: 'Home' });            // wrong host
assert.deepEqual(handleLink('javascript:alert(1)'), { screen: 'Home' });                  // wrong scheme
assert.deepEqual(handleLink('https://shop.example.com/orders/42%20OR%201=1'), { screen: 'Home' });
assert.deepEqual(handleLink('not a url'), { screen: 'Home' });
console.log('transfer link ->', JSON.stringify(handleLink('myapp://transfer?to=alice&amount=25')));`,
        },
        production: {
          language: 'tsx',
          filename: 'linking.tsx',
          explanation: 'Production React Navigation linking with validation: getStateFromPath runs every incoming path through the allowlist validator before React Navigation builds state, action links land on a confirmation screen that requires biometrics before calling the server, and external URLs open in the system browser rather than an in-app WebView.',
          code: raw`import { getStateFromPath, type LinkingOptions } from '@react-navigation/native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as WebBrowser from 'expo-web-browser';
import { Button, Text, View } from 'react-native';

type RootParams = {
  Home: undefined;
  OrderDetail: { id: string };
  ConfirmTransfer: { to: string; amount: string };
  Login: { next: string };
};

const VALID: Record<string, (p: Record<string, string>) => boolean> = {
  OrderDetail: (p) => /^\d{1,12}$/.test(p.id ?? ''),
  ConfirmTransfer: (p) => /^[a-z0-9_]{3,30}$/.test(p.to ?? '') && Number(p.amount) > 0 && Number(p.amount) <= 1000,
  Login: (p) => /^\/(?!\/)[A-Za-z0-9/_-]*$/.test(p.next ?? '/'),
};

export const linking: LinkingOptions<RootParams> = {
  prefixes: ['https://shop.example.com', 'myapp://'],          // verified https links first
  config: { screens: { Home: '', OrderDetail: 'orders/:id', ConfirmTransfer: 'transfer', Login: 'login' } },
  getStateFromPath(path, options) {
    const state = getStateFromPath(path, options);
    const route = state?.routes.at(-1);
    if (!route) return undefined;
    const check = VALID[route.name];
    const params = (route.params ?? {}) as Record<string, string>;
    if (check && !check(params)) return getStateFromPath('', options);   // invalid -> Home, never a broken screen
    return state;
  },
};

// Links only ever open this screen; the transfer happens after explicit confirmation
export function ConfirmTransferScreen({ route }: { route: { params: RootParams['ConfirmTransfer'] } }) {
  const { to, amount } = route.params;
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Text accessibilityRole="header">Send {amount} BDT to @{to}?</Text>
      <Button title="Confirm with Face ID" onPress={async () => {
        const auth = await LocalAuthentication.authenticateAsync({ promptMessage: 'Confirm transfer' });
        if (!auth.success) return;
        await fetch('https://shop.example.com/api/transfers', {   // server re-validates limits and ownership
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to, amount }),
        });
      }} />
    </View>
  );
}

// External content: system browser (isolated from our session), never our WebView with a JS bridge
export const openExternal = (url: string) => WebBrowser.openBrowserAsync(url);`,
        },
        bug: {
          explanation:
            'The handler executes a money transfer straight from URL parameters and loads any next= URL into a WebView. A malicious web page or QR code can trigger transfers without the user\'s intent, and a trusted-looking link can show a phishing page inside the app. Validate, route to a confirmation screen, and only allow relative redirects.',
          buggy: {
            language: 'ts',
            filename: 'deepLinks.ts',
            code: raw`// ❌ Links perform actions and open arbitrary URLs in the app
Linking.addEventListener('url', async ({ url }) => {
  const u = new URL(url);
  if (u.host === 'transfer') {
    await api.transfer(u.searchParams.get('to')!, Number(u.searchParams.get('amount')));   // no confirmation
  }
  const next = u.searchParams.get('next');
  if (next) navigation.navigate('WebView', { uri: next });     // open redirect into an authenticated WebView
});`,
          },
          fixed: {
            language: 'ts',
            filename: 'deepLinks.ts',
            code: raw`// ✅ One validator; actions become confirmation screens; redirects stay inside the app
Linking.addEventListener('url', ({ url }) => {
  const target = handleLink(url);                               // allowlist + param validation + safeNext()
  navigation.navigate(target.screen as never, target.params as never);   // ConfirmTransfer requires a tap + biometrics
});`,
          },
        },
      },
      takeaways: [
        'Deep links are untrusted input from anywhere: validate scheme, host, route and every parameter.',
        'Links navigate; they never perform state-changing actions without explicit confirmation.',
        'Block open redirects: only relative, allowlisted targets; external pages go to the system browser.',
        'Prefer verified Universal Links / App Links over hijackable custom schemes, especially for auth.',
        'Practice drill: add a route /invite/:code to Tab 1 that only accepts 8 uppercase letters or digits, and assert that /invite/abc and /invite/ABCD1234?next=https://evil.io are handled safely.',
      ],
    },
  ],
};
