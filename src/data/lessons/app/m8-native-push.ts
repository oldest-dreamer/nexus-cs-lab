import type { Module } from '../../types';

const raw = String.raw;

export const nativePushModule: Module = {
  id: 'app-native-push',
  title: 'Native Hardware, Push & Deep Linking',
  level: 'Intermediate',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'app-permissions-jit',
      title: 'Just-in-Time Permissions UX (Camera, Location, Notifications)',
      summary: 'Ask for sensitive permissions at the moment they make sense, explain why first, handle every state (undetermined, granted, limited, denied, blocked) and recover gracefully through Settings.',
      difficulty: 'Beginner',
      minutes: 18,
      xp: 90,
      analogy:
        "Asking for every permission on the first launch is a stranger asking for your house keys, car keys and phone the moment you meet. Asking just in time is a friend who, when you both reach the front door carrying shopping, asks \"want me to hold the door?\". The context makes the yes obvious, and if you say no, they don't keep asking every five minutes.",
      intuition: [
        { title: 'The system prompt is a one-shot resource', body: "On iOS, the system dialog for a permission appears once; after \"Don't Allow\", only the Settings app can change it. On Android, after one denial you may ask again with a rationale; after a second denial (or \"Don't ask again\") the request returns denied immediately." },
        { title: 'Ask in context', body: "Request camera access when the user taps \"Scan receipt\", location when they tap \"Find stores near me\", notifications after they opt into order updates. Acceptance rates are dramatically higher than on cold launch." },
        { title: 'Pre-prompt, then system prompt', body: "Show your own short explanation screen first (what you will do, what you won't). Only if the user continues do you trigger the system dialog, so a \"not now\" doesn't burn the one-shot system prompt." },
        { title: 'Handle every state', body: "Undetermined (ask), granted (proceed), limited/approximate (photos subset, approximate location: degrade gracefully), denied but can ask again (explain, ask later), blocked (show a button that opens Settings). Re-check status when the app returns to the foreground." },
        { title: 'Ask for less', body: "Prefer approximate location, the system photo picker (needs no permission), \"while using the app\" instead of \"always\" location, and one-time permissions. Store reviewers reject unnecessary or poorly justified permissions." },
        { title: 'Declare usage strings', body: "iOS requires `NSCameraUsageDescription`-style purpose strings in Info.plist (configured via app.json plugins in Expo); Android requires manifest declarations. Missing strings crash the request (iOS) or fail review." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Permission flow at the moment of need', body: 'The system prompt is only shown after the user opted in.', flow: ['user taps "Scan receipt"', 'status? granted → open camera', 'undetermined → pre-prompt → system prompt', 'denied & canAskAgain → explain → ask later', 'blocked → "Open Settings" button', 'app returns active → re-check status'] },
        { kind: 'tip', title: 'Provide a no-permission path', body: 'Manual address entry instead of location, picking a photo from the library instead of the camera, an in-app inbox instead of push. Users who say no should still be able to finish their task.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'permission_state_machine.ts',
          explanation: 'Runnable TypeScript model of iOS and Android permission semantics: the one-shot iOS prompt, Android\'s second-denial block, a pre-prompt that protects the system prompt from a "not now", the decision of what to show for each status, and acceptance-rate arithmetic for contextual vs cold-launch prompts. All asserted.',
          code: raw`//  PERMISSION STATES
//
//   undetermined --system prompt--> granted
//        |                     \--> denied (iOS: final; Android: canAskAgain once)
//        +-- pre-prompt "Not now" --> still undetermined (system prompt not burned)
//   Android: denied --ask again--> denied + "don't ask again" --> blocked --> Settings only
import assert from 'node:assert/strict';

type Status = 'undetermined' | 'granted' | 'denied' | 'blocked';
class PermissionSim {
  status: Status = 'undetermined';
  private androidDenials = 0;
  constructor(private platform: 'ios' | 'android') {}
  get canAskAgain() { return this.status === 'undetermined' || (this.platform === 'android' && this.status === 'denied'); }
  systemPrompt(userAccepts: boolean): Status {
    if (!this.canAskAgain) return this.status;                         // request returns immediately, no dialog
    if (userAccepts) return (this.status = 'granted');
    if (this.platform === 'ios') return (this.status = 'blocked');      // iOS: Settings only from now on
    this.androidDenials++;
    return (this.status = this.androidDenials >= 2 ? 'blocked' : 'denied');
  }
}

function uiFor(p: PermissionSim): 'proceed' | 'pre-prompt' | 'explain-and-retry' | 'open-settings' {
  if (p.status === 'granted') return 'proceed';
  if (p.status === 'undetermined') return 'pre-prompt';
  return p.canAskAgain ? 'explain-and-retry' : 'open-settings';
}

const ios = new PermissionSim('ios');
assert.equal(uiFor(ios), 'pre-prompt');
// user taps "Not now" on OUR pre-prompt: no system dialog was shown, so we can still ask later
assert.equal(ios.status, 'undetermined');
assert.equal(ios.systemPrompt(false), 'blocked');
assert.equal(uiFor(ios), 'open-settings');
assert.equal(ios.systemPrompt(true), 'blocked');                       // further requests are silent no-ops

const android = new PermissionSim('android');
assert.equal(android.systemPrompt(false), 'denied');
assert.equal(uiFor(android), 'explain-and-retry');
assert.equal(android.systemPrompt(false), 'blocked');
assert.equal(uiFor(android), 'open-settings');
const android2 = new PermissionSim('android');
android2.systemPrompt(false);
assert.equal(android2.systemPrompt(true), 'granted');                  // a good rationale can still win

// why context matters (illustrative rates): 1,000 users
const coldLaunch = Math.round(1000 * 0.35), inContext = Math.round(1000 * 0.8);
assert.equal(inContext - coldLaunch, 450);                              // extra users who can use the feature
console.log('ios after denial:', uiFor(ios), '| android after 1 denial:', uiFor(new PermissionSim('android')));`,
        },
        production: {
          language: 'tsx',
          filename: 'ScanReceiptButton.tsx',
          explanation: 'Production React Native with expo-camera: the permission is requested only when the user taps Scan, a pre-prompt explains the purpose first, blocked users get an Open Settings path, status is re-checked when the app returns to the foreground, and a library-picker fallback keeps the task possible without camera access.',
          code: raw`import { useEffect, useState } from 'react';
import { Alert, AppState, Button, Linking, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

// app.json (Expo config plugin) declares the purpose string shown in the iOS dialog:
// ["expo-camera", { "cameraPermission": "Scan receipts to add expenses automatically." }]

export function ScanReceiptButton({ onPhotoFromLibrary }: { onPhotoFromLibrary: () => void }) {
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);

  // the user may change the setting in Settings and come back: re-check on foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void getPermission(); });
    return () => sub.remove();
  }, [getPermission]);

  const start = async () => {
    if (permission?.granted) return setScanning(true);
    if (permission && !permission.canAskAgain) {                  // blocked: only Settings can help
      Alert.alert('Camera access is off', 'Turn on camera access in Settings to scan receipts, or pick a photo instead.', [
        { text: 'Pick a photo', onPress: onPhotoFromLibrary },
        { text: 'Open Settings', onPress: () => void Linking.openSettings() },
      ]);
      return;
    }
    // pre-prompt: our explanation first, so "Not now" doesn't burn the one-shot system dialog
    Alert.alert('Scan receipts with your camera', 'We only use the camera while you scan. Photos stay on your device until you save them.', [
      { text: 'Not now', style: 'cancel' },
      { text: 'Continue', onPress: async () => { const r = await requestPermission(); if (r.granted) setScanning(true); } },
    ]);
  };

  if (scanning) {
    return <CameraView style={{ flex: 1 }} facing="back" onBarcodeScanned={() => setScanning(false)} />;
  }
  return (
    <View style={{ gap: 8 }}>
      <Button title="Scan receipt" onPress={start} />
      <Button title="Choose from library" onPress={onPhotoFromLibrary} />
      {permission?.status === 'denied' && <Text>Camera is off. You can still add receipts from your photos.</Text>}
    </View>
  );
}`,
        },
        bug: {
          explanation:
            'Requesting camera, location, contacts and notifications the moment the app opens shows four system dialogs with no context. Most users deny, and on iOS that denial is permanent: the features are dead for those users and reviewers may flag unnecessary permissions. Ask for each permission only when the user starts the feature that needs it, after a short explanation.',
          buggy: {
            language: 'tsx',
            filename: 'App.tsx',
            code: raw`// ❌ Four cold system prompts on launch: high denial rates, permanently burned on iOS
useEffect(() => {
  void Camera.requestCameraPermissionsAsync();
  void Location.requestForegroundPermissionsAsync();
  void Contacts.requestPermissionsAsync();
  void Notifications.requestPermissionsAsync();
}, []);`,
          },
          fixed: {
            language: 'tsx',
            filename: 'App.tsx',
            code: raw`// ✅ Nothing on launch; each feature asks in context when the user starts it
// Scan button      -> camera (pre-prompt -> system prompt -> Settings fallback)
// "Stores near me" -> foreground, approximate location
// "Notify me when shipped" toggle -> notifications
useEffect(() => {
  void Notifications.getPermissionsAsync().then((s) => setCanNotify(s.granted));   // read, don't request
}, []);`,
          },
        },
      },
      takeaways: [
        'Ask at the moment of need, after your own explanation; never on cold launch.',
        'iOS gives one system prompt per permission; Android blocks after the second denial: protect that prompt.',
        'Handle undetermined, granted, limited/approximate, denied and blocked, with a Settings path and re-check on foreground.',
        'Request the least permission that works and always offer a no-permission path.',
        'Practice drill: extend Tab 1 with an iOS "limited" photo-library state and decide what uiFor() should return for it (proceed with the selected photos, plus an option to change the selection).',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'app-push-notifications',
      title: 'Push Notification Architecture: APNs & FCM, Silent vs Visible',
      summary: 'How a push travels from your server through Apple\'s and Google\'s push services to a device, the difference between visible alerts and silent data pushes, payload limits, collapse keys, and keeping device tokens fresh.',
      difficulty: 'Intermediate',
      minutes: 22,
      xp: 120,
      analogy:
        "Push is a postal system where you never know your customers' home addresses. Each phone registers with its national post office (APNs for Apple, FCM for Google) and receives a delivery code (the device token). Your server hands letters with that code to the post office, which delivers them when the phone is reachable. A visible push is a letter the post office pins on the front door; a silent push is a note slipped quietly through the letterbox telling the app to fetch something, which the post office may delay or skip if the household is asleep.",
      intuition: [
        { title: 'The pipeline', body: "The app asks the OS for a device token (after notification permission on iOS and Android 13+), sends it to your backend with the user id, and your backend sends messages to APNs (HTTP/2, token-based auth) or FCM (HTTP v1 API, OAuth). The push service delivers to the device; the OS shows it or wakes the app." },
        { title: 'Visible vs silent', body: "Visible (alert) notifications are displayed by the OS even if the app is killed. Silent/data pushes (`content-available: 1` on iOS with `apns-push-type: background` and low priority; data-only messages on FCM) wake the app briefly to sync. They are throttled heavily, not guaranteed, and not delivered to force-quit iOS apps." },
        { title: 'Payload limits and content', body: "APNs and FCM payloads are limited to 4 KB. Send ids and a short message, then fetch details from your API. Notification text appears on the lock screen: avoid sensitive data (or use generic text and fetch details after unlock)." },
        { title: 'Collapse and channels', body: "Collapse keys (`apns-collapse-id`, FCM `collapse_key`) replace an older undelivered or displayed notification with a newer one (\"3 new messages\" instead of three alerts). Android notification channels let users control categories (orders, marketing) separately; create them before posting." },
        { title: 'Tokens change and die', body: "Tokens rotate after restores, reinstalls and periodically. Re-register on every launch and when the token-refresh listener fires; store tokens per device; delete tokens the push service reports as invalid (APNs 410 Unregistered, FCM UNREGISTERED / 404)." },
        { title: 'Handle taps and foreground', body: "Tapping a notification should deep link to the exact screen (validated like any link). Decide whether to show notifications while the app is in the foreground, and mark items read across devices." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Push delivery path', body: 'Your server never talks to the phone directly.', flow: ['app: permission → device token', 'POST /devices {token, platform, userId}', 'event (order shipped) → your push service', 'APNs (HTTP/2) / FCM (HTTP v1)', 'device: OS shows alert or wakes app (silent)', 'tap → validated deep link → screen'] },
        { kind: 'warning', title: 'Silent push is not a scheduler', body: 'Do not rely on silent pushes for timely background work: the OS may delay, coalesce or drop them based on battery, usage and Low Power Mode. Use them as hints to sync, and sync again on next launch.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'push_fanout_from_scratch.ts',
          explanation: 'Runnable TypeScript model of a push sender: builds APNs payloads for visible and silent pushes with the right headers, enforces the 4 KB payload limit, collapses notifications on the device by collapse id, and prunes tokens that the push service reports as unregistered after a fan-out. All asserted.',
          code: raw`//  FAN-OUT FOR "order shipped" TO ONE USER'S 3 DEVICES
//
//   tokens: iphone(valid)  pixel(valid)  old-ipad(uninstalled)
//   send -> 200 / 200 / 410 Unregistered  --> delete old-ipad token
//   collapse-id "order-42": "Packed" then "Shipped" -> device shows only "Shipped"
//   payload must be <= 4096 bytes: send ids, fetch details from the API
import assert from 'node:assert/strict';

type Visible = { kind: 'visible'; title: string; body: string; data: Record<string, string>; collapseId?: string };
type Silent = { kind: 'silent'; data: Record<string, string> };
const MAX_BYTES = 4096;

function apnsRequest(msg: Visible | Silent) {
  const aps = msg.kind === 'visible'
    ? { alert: { title: msg.title, body: msg.body }, sound: 'default', 'thread-id': 'orders' }
    : { 'content-available': 1 };                                   // no alert, no sound: wakes the app
  const headers: Record<string, string> = {
    'apns-push-type': msg.kind === 'visible' ? 'alert' : 'background',
    'apns-priority': msg.kind === 'visible' ? '10' : '5',           // background pushes must use priority 5
  };
  if (msg.kind === 'visible' && msg.collapseId) headers['apns-collapse-id'] = msg.collapseId;
  const body = JSON.stringify({ aps, ...msg.data });
  if (Buffer.byteLength(body) > MAX_BYTES) throw new Error('payload too large: ' + Buffer.byteLength(body) + ' bytes');
  return { headers, body };
}

const shipped = apnsRequest({ kind: 'visible', title: 'Order shipped', body: 'Arriving Thursday', data: { orderId: '42' }, collapseId: 'order-42' });
assert.equal(shipped.headers['apns-push-type'], 'alert');
assert.deepEqual(JSON.parse(shipped.body).orderId, '42');
const silent = apnsRequest({ kind: 'silent', data: { sync: 'orders' } });
assert.deepEqual(silent.headers, { 'apns-push-type': 'background', 'apns-priority': '5' });
assert.equal(JSON.parse(silent.body).aps['content-available'], 1);
assert.throws(() => apnsRequest({ kind: 'visible', title: 'Invoice', body: 'x'.repeat(5000), data: {} }), /payload too large/);

// device-side collapse: the newest notification with the same collapse id replaces the older one
const tray = new Map<string, string>();
const deliver = (id: string, text: string) => tray.set(id, text);
deliver('order-42', 'Packed'); deliver('order-42', 'Shipped'); deliver('msg-7', 'New message from Ana');
assert.deepEqual([...tray.values()], ['Shipped', 'New message from Ana']);

// fan-out with token pruning
const tokens = new Map([['iphone', 'user-1'], ['pixel', 'user-1'], ['old-ipad', 'user-1']]);
const pushService = (token: string) => (token === 'old-ipad' ? { status: 410, reason: 'Unregistered' } : { status: 200 });
function fanOut(userId: string) {
  const results: Record<string, number> = {};
  for (const [token, owner] of tokens) {
    if (owner !== userId) continue;
    const r = pushService(token);
    results[token] = r.status;
    if (r.status === 410) tokens.delete(token);                     // stop sending to dead devices
  }
  return results;
}
assert.deepEqual(fanOut('user-1'), { iphone: 200, pixel: 200, 'old-ipad': 410 });
assert.deepEqual([...tokens.keys()], ['iphone', 'pixel']);
console.log('visible headers', shipped.headers, '| remaining tokens', [...tokens.keys()]);`,
        },
        production: {
          language: 'ts',
          filename: 'registerPush.ts',
          explanation: 'Production React Native client with expo-notifications: an Android channel created before asking, permission requested in context, the native device token (APNs/FCM) registered with the backend on every launch and whenever the OS rotates it, foreground presentation rules, and tap handling that routes through the deep-link validator.',
          code: raw`import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// Show alerts while the app is in the foreground only for order updates
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const isOrder = n.request.content.data?.type === 'order';
    return { shouldShowBanner: isOrder, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false };
  },
});

async function sendTokenToBackend(token: string, apiToken: string) {
  await fetch('https://api.example.com/devices', {
    method: 'PUT',                                                 // idempotent upsert by token
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + apiToken },
    body: JSON.stringify({ token, platform: Platform.OS, app: 'shop', locale: 'en-BD' }),
  });
}

// Call after the user opted in (e.g. "Notify me when my order ships")
export async function enablePush(apiToken: string) {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('orders', {    // channel before the prompt on Android 13+
      name: 'Order updates',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const { granted } = await Notifications.requestPermissionsAsync();
  if (!granted) return false;
  const { data: token } = await Notifications.getDevicePushTokenAsync();   // raw APNs / FCM token
  await sendTokenToBackend(String(token), apiToken);
  return true;
}

// On every launch (if already granted) and on rotation
export function keepTokenFresh(apiToken: string) {
  void Notifications.getPermissionsAsync().then(async (p) => {
    if (p.granted) await sendTokenToBackend(String((await Notifications.getDevicePushTokenAsync()).data), apiToken);
  });
  const sub = Notifications.addPushTokenListener((t) => void sendTokenToBackend(String(t.data), apiToken));
  return () => sub.remove();
}

// Tap -> validated deep link (see the deep-link hardening chapter)
export function handleTaps(open: (url: string) => void) {
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    const url = r.notification.request.content.data?.url;
    if (typeof url === 'string') open(url);                        // open() runs the allowlist validator
  });
  return () => sub.remove();
}`,
        },
        bug: {
          explanation:
            'The token is registered once, guarded by a "registered" flag. Push tokens rotate after app restores, reinstalls and periodically; the backend keeps sending to a dead token, notifications silently stop for that user, and nobody notices. Re-send the current token on every launch and subscribe to token changes, and prune tokens the push service rejects.',
          buggy: {
            language: 'ts',
            filename: 'push.ts',
            code: raw`// ❌ Registered once, never refreshed: pushes stop after the token rotates
export async function setupPush() {
  if (storage.getBoolean('pushRegistered')) return;
  const { data } = await Notifications.getDevicePushTokenAsync();
  await api.registerDevice(String(data));
  storage.set('pushRegistered', true);
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'push.ts',
            code: raw`// ✅ Upsert the current token on every launch and whenever it changes
export async function setupPush() {
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return () => {};
  const { data } = await Notifications.getDevicePushTokenAsync();
  await api.registerDevice(String(data));                           // PUT /devices: idempotent upsert
  const sub = Notifications.addPushTokenListener((t) => void api.registerDevice(String(t.data)));
  return () => sub.remove();
}`,
          },
        },
      },
      takeaways: [
        'App → device token → your backend → APNs/FCM → device; your server never contacts phones directly.',
        'Visible pushes are shown by the OS; silent pushes (content-available, priority 5) are throttled hints to sync.',
        'Keep payloads small (≤ 4 KB) and non-sensitive; use collapse ids and Android channels.',
        'Re-register tokens every launch and on rotation; prune tokens reported as unregistered.',
        'Practice drill: in Tab 1, send a visible push whose body is 4,000 characters and compute whether it fits (it doesn\'t once the aps wrapper and data are added; truncate to ~150 characters and fetch the rest).',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'app-universal-links-background',
      title: 'Universal Links / App Links & OS Background-Execution Budgets',
      summary: 'Make https links open your app reliably with verified domain association files, and schedule background work the way iOS and Android actually allow it: opportunistic, budgeted and deferrable.',
      difficulty: 'Advanced',
      minutes: 22,
      xp: 130,
      analogy:
        "Universal Links are a notarised letter between your website and your app: the website publishes a signed statement \"this app may open my links\", and the phone checks it, so no other app can impersonate yours. Background execution is like asking a strict building manager for after-hours access: you can ask, but the manager decides when (and whether) you get in, based on how often you have been useful and how much power the building has left.",
      intuition: [
        { title: 'Verified links beat custom schemes', body: "Universal Links (iOS) and App Links (Android) are normal https URLs. If the app is installed and verified for the domain, the OS opens it directly; otherwise the website loads. No other app can claim them, which makes them the right choice for auth redirects, emails and marketing." },
        { title: 'apple-app-site-association', body: "Served at `https://domain/.well-known/apple-app-site-association` as JSON (no redirects, `application/json`, publicly accessible). It lists app IDs (`TEAMID.bundle.id`) and URL components, evaluated in order, with `exclude` rules. The app declares `applinks:domain` in Associated Domains." },
        { title: 'assetlinks.json', body: "Served at `https://domain/.well-known/assetlinks.json` with the package name and the SHA-256 fingerprints of the signing certificates (include the Play App Signing key, not only your upload key). Intent filters use `autoVerify=\"true\"`." },
        { title: 'Background execution is a privilege', body: "iOS: background app refresh (BGAppRefreshTask) and processing tasks (BGProcessingTask, often only while charging) run when the system decides, based on usage patterns and battery. Android: WorkManager periodic work has a 15-minute minimum interval and respects Doze, App Standby buckets and constraints." },
        { title: 'Design for deferral', body: "Background tasks must be short, resumable and idempotent; they may run hours late or not at all (Low Power Mode, force-quit iOS apps). Always sync again when the app opens; never rely on a background task for correctness." },
        { title: 'Choose the right mechanism', body: "User-visible ongoing work (navigation, a call, an upload the user is watching) uses foreground services / audio / location modes with visible UI; periodic refresh uses the OS schedulers; urgent server events use push." },
      ],
      callouts: [
        { kind: 'architecture', title: 'How a verified link opens the app', body: 'Verification happens at install/update time, not per tap.', flow: ['app installed → OS fetches AASA / assetlinks.json', 'domain verified for this app id + certificate', 'user taps https://shop.example.com/orders/42', 'OS matches path rules → opens app (else browser)', 'app validates path → navigates'] },
        { kind: 'tip', title: 'Debug verification', body: 'Android: adb shell pm get-app-links <package> shows verification state per domain. iOS: check the file is served without redirects and with HTTP 200 from Apple\'s CDN; Safari\'s "open in app" banner and the Notes app are quick manual tests.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'links_and_background_budget.ts',
          explanation: 'Runnable TypeScript: an AASA components matcher (ordered rules, * and ? wildcards, exclude), an assetlinks.json fingerprint check computed from certificate bytes with node:crypto (upload key vs Play signing key), and a background scheduler model showing WorkManager\'s 15-minute floor and how Low Power Mode and app usage reduce granted runs. All asserted.',
          code: raw`//  AASA COMPONENTS (evaluated in order, first match wins)
//
//   { "/": "/orders/*" }                    -> open app
//   { "/": "/account/*", "exclude": true }  -> stay in browser
//   { "/": "/promo/??" }                    -> open app (exactly two characters)
//   assetlinks.json: sha256(signing cert) must match the PLAY signing key, not just your upload key
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

type Component = { '/': string; exclude?: boolean };
const globToRegex = (g: string) => new RegExp('^' + g.replace(/[.+^$()|[\]{}\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
function opensApp(components: Component[], path: string): boolean {
  for (const c of components) if (globToRegex(c['/']).test(path)) return !c.exclude;
  return false;
}
const AASA: Component[] = [
  { '/': '/account/*', exclude: true },                      // order matters: exclusions first
  { '/': '/orders/*' },
  { '/': '/promo/??' },
];
assert.deepEqual(['/orders/42', '/account/password', '/promo/ab', '/promo/abc', '/blog/post'].map((p) => opensApp(AASA, p)),
  [true, false, true, false, false]);

// assetlinks.json fingerprints
const fingerprint = (der: Buffer) => createHash('sha256').update(der).digest('hex').toUpperCase().match(/../g)!.join(':');
const uploadCert = Buffer.from('upload-key-certificate-der-bytes');
const playSigningCert = Buffer.from('play-app-signing-certificate-der-bytes');   // what users actually install
const assetlinks = [{ relation: ['delegate_permission/common.handle_all_urls'],
  target: { namespace: 'android_app', package_name: 'com.example.shop', sha256_cert_fingerprints: [fingerprint(uploadCert)] } }];
const verified = (installedCert: Buffer) => assetlinks.some((s) => s.target.sha256_cert_fingerprints.includes(fingerprint(installedCert)));
assert.match(fingerprint(uploadCert), /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
assert.equal(verified(uploadCert), true);                     // works for your local release build...
assert.equal(verified(playSigningCert), false);               // ...but NOT for Play Store installs: add this fingerprint
assetlinks[0].target.sha256_cert_fingerprints.push(fingerprint(playSigningCert));
assert.equal(verified(playSigningCert), true);

// background budget model over 24 hours
function grantedRuns(requestedEveryMin: number, opts: { lowPower: boolean; usageBucket: 'active' | 'rare' }) {
  const interval = Math.max(15, requestedEveryMin);           // WorkManager periodic minimum
  let runs = Math.floor((24 * 60) / interval);
  if (opts.usageBucket === 'rare') runs = Math.min(runs, 24); // rarely used apps: roughly hourly at best
  if (opts.lowPower) runs = 0;                                // deferred until power is restored
  return runs;
}
assert.equal(grantedRuns(5, { lowPower: false, usageBucket: 'active' }), 96);    // asked for 5 min, got 15
assert.equal(grantedRuns(15, { lowPower: false, usageBucket: 'rare' }), 24);
assert.equal(grantedRuns(60, { lowPower: true, usageBucket: 'active' }), 0);
console.log('AASA /orders/42 opens app:', opensApp(AASA, '/orders/42'), '| play fingerprint', fingerprint(playSigningCert).slice(0, 17) + '...');`,
        },
        production: {
          language: 'ts',
          filename: 'backgroundSync.ts',
          explanation: 'Production Expo/React Native: a background sync task registered with expo-background-task (WorkManager on Android, BGTaskScheduler on iOS) that does short, idempotent work and reports success or failure, plus the app config for verified links (associatedDomains / intentFilters with autoVerify) and the shape of both association files.',
          code: raw`import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

const SYNC_TASK = 'background-sync';

// Must be defined at module scope (it may run without any UI mounted)
TaskManager.defineTask(SYNC_TASK, async () => {
  try {
    const started = Date.now();
    await flushOutbox({ deadlineMs: 20_000 });               // short, resumable, idempotent work only
    await syncOrdersDelta();
    console.log('background sync ok in', Date.now() - started, 'ms');
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;        // the OS may back off future runs
  }
});

export async function registerBackgroundSync() {
  const status = await BackgroundTask.getStatusAsync();
  if (status === BackgroundTask.BackgroundTaskStatus.Restricted) return false;   // user / OS disabled it
  await BackgroundTask.registerTaskAsync(SYNC_TASK, { minimumInterval: 60 });    // minutes; a hint, not a promise
  return true;
}

declare function flushOutbox(opts: { deadlineMs: number }): Promise<void>;
declare function syncOrdersDelta(): Promise<void>;

/* app.json (Expo) - verified links
{
  "expo": {
    "ios": { "bundleIdentifier": "com.example.shop", "associatedDomains": ["applinks:shop.example.com"] },
    "android": {
      "package": "com.example.shop",
      "intentFilters": [{
        "action": "VIEW", "autoVerify": true, "category": ["BROWSABLE", "DEFAULT"],
        "data": [{ "scheme": "https", "host": "shop.example.com", "pathPrefix": "/orders" }]
      }]
    }
  }
}

https://shop.example.com/.well-known/apple-app-site-association   (200, application/json, no redirect)
{ "applinks": { "details": [{ "appIDs": ["ABCDE12345.com.example.shop"],
    "components": [{ "/": "/account/*", "exclude": true }, { "/": "/orders/*" }] }] } }

https://shop.example.com/.well-known/assetlinks.json
[{ "relation": ["delegate_permission/common.handle_all_urls"],
   "target": { "namespace": "android_app", "package_name": "com.example.shop",
               "sha256_cert_fingerprints": ["<PLAY APP SIGNING KEY SHA-256>", "<UPLOAD KEY SHA-256>"] } }]
*/`,
        },
        bug: {
          explanation:
            'The association file sits behind the site\'s login redirect and catch-all HTML route, so the OS receives a 302 or an HTML page instead of JSON, verification fails, and every https link opens in the browser. The association files must be served directly over HTTPS with status 200, the JSON content type, no redirects and no authentication.',
          buggy: {
            language: 'ts',
            filename: 'server.ts',
            code: raw`// ❌ Auth middleware and the SPA fallback swallow the association files
app.use(requireLogin);                                 // 302 -> /login for anonymous requests (Apple's crawler is anonymous)
app.use(express.static('public'));                     // file has no extension -> wrong content type
app.get('*', (_req, res) => res.sendFile('index.html', { root: 'dist' }));   // HTML for unknown paths`,
          },
          fixed: {
            language: 'ts',
            filename: 'server.ts',
            code: raw`// ✅ Public, exact routes registered first; JSON content type; no redirects
import aasa from './well-known/apple-app-site-association.json';
import assetlinks from './well-known/assetlinks.json';

app.get('/.well-known/apple-app-site-association', (_req, res) => res.type('application/json').json(aasa));
app.get('/.well-known/assetlinks.json', (_req, res) => res.type('application/json').json(assetlinks));
app.use(requireLogin);                                 // everything else may require auth
app.get('*', (_req, res) => res.sendFile('index.html', { root: 'dist' }));`,
          },
        },
      },
      takeaways: [
        'Universal Links / App Links are verified https links: no other app can hijack them.',
        'Serve AASA and assetlinks.json publicly, as JSON, without redirects; include the Play App Signing fingerprint.',
        'Background work runs when the OS allows (15-minute floor on Android, opportunistic on iOS, none in Low Power Mode).',
        'Keep background tasks short, resumable and idempotent; always sync again on launch.',
        'Practice drill: in Tab 1, move the /account/* exclusion after a catch-all { "/": "*" } rule and predict what /account/password does now (opens the app: the first matching rule wins).',
      ],
    },
  ],
};
