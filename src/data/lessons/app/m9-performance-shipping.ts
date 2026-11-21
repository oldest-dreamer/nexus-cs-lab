import type { Module } from '../../types';

const raw = String.raw;

export const performanceShippingModule: Module = {
  id: 'app-performance-shipping',
  title: '60/120fps Profiling & Store Shipping',
  level: 'Advanced',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'app-list-virtualization-jank',
      title: 'Eliminating Jank: Virtualized Lists for 10,000+ Rows',
      summary: 'Why rendering every row kills scrolling and memory, how virtualized lists mount only a window of rows, and the row, key and layout optimisations that keep 10,000-item lists at 60/120fps.',
      difficulty: 'Intermediate',
      minutes: 22,
      xp: 130,
      analogy:
        "A virtualised list is a theatre that only builds the scenery the audience can currently see. As the play moves on, the crew takes down scenery that has scrolled out of view and reuses the same flats for the next scene. Rendering 10,000 rows in a ScrollView is building all 10,000 sets before the curtain rises: the audience waits, and the stage collapses under the weight.",
      intuition: [
        { title: 'Where jank comes from', body: "A dropped frame happens when the UI thread or the JS thread misses the 16.67 ms (60 Hz) / 8.33 ms (120 Hz) deadline. Long lists hit both: too many native views to lay out and draw, and too many React components to render, reconcile and keep in memory." },
        { title: 'ScrollView renders everything', body: "`<ScrollView>{items.map(...)}</ScrollView>` mounts every row immediately: 10,000 rows means 10,000 component trees, a multi-second first render, hundreds of megabytes of views, and long garbage-collection pauses." },
        { title: 'Virtualisation renders a window', body: "FlatList/SectionList (and FlashList, which recycles views) render only the rows near the viewport. FlatList's default `windowSize` of 21 keeps about 10 screens above and below plus the visible one; rows outside are unmounted or recycled and replaced by blank space of the right size." },
        { title: 'Tell the list the layout', body: "If every row has the same height, `getItemLayout` lets the list compute any row's offset (index × height) without measuring, which makes scrollToIndex instant and avoids blank areas while flinging." },
        { title: 'Cheap, stable rows', body: "Memoise row components, pass primitive props, use a stable `keyExtractor` (ids, never indexes), avoid inline objects/functions that defeat memo, keep images sized and cached, and move heavy formatting out of render." },
        { title: 'Profile in release builds', body: "Debug builds are much slower. Measure with the performance monitor (UI and JS fps), React Native DevTools' profiler, Android Studio / Xcode Instruments, on a mid-range Android device in a release build." },
      ],
      callouts: [
        { kind: 'architecture', title: 'What a virtualised list keeps mounted', body: 'Memory and render cost scale with the window, not the data.', flow: ['data: 10,000 items', 'viewport: ~12 rows visible', 'render window (windowSize 21): ~250 rows', 'rows outside → unmounted / recycled', 'getItemLayout → offsets without measuring'] },
        { kind: 'tip', title: 'Measure the right thing', body: 'Watch both counters in the performance monitor: UI fps (native scrolling and drawing) and JS fps (React work). Blank cells while flinging usually mean JS is too slow to render rows: simplify rows, memoise, or increase the batch sizes carefully.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'virtualization_math.ts',
          explanation: 'Runnable TypeScript: the render window for fixed-height rows (FlatList\'s windowSize model), offsets via getItemLayout, the visible range for variable-height rows using prefix sums and binary search, and the mounted-row counts for a ScrollView vs a virtualised list over 10,000 items. All asserted.',
          code: raw`//  10,000 ROWS x 72 pt, VIEWPORT 844 pt, windowSize 21
//
//   ScrollView:   mounts 10,000 rows (720,000 pt of content)
//   FlatList:     mounts ~ windowSize x viewport / rowHeight = 21 x 844 / 72 = 246 (+ partial edge rows = 248)
//   getItemLayout(i) = { length: 72, offset: 72 * i }  -> scrollToIndex(5000) needs no measuring
import assert from 'node:assert/strict';

const ROWS = 10_000, ROW = 72, VIEWPORT = 844, WINDOW_SIZE = 21;

function renderWindow(scrollOffset: number) {
  const half = ((WINDOW_SIZE - 1) / 2) * VIEWPORT;             // 10 viewports above and below
  const first = Math.max(0, Math.floor((scrollOffset - half) / ROW));
  const last = Math.min(ROWS - 1, Math.ceil((scrollOffset + VIEWPORT + half) / ROW));
  return { first, last, mounted: last - first + 1 };
}
const top = renderWindow(0);
const middle = renderWindow(360_000);                        // halfway down the list
assert.deepEqual(top, { first: 0, last: 129, mounted: 130 });   // nothing above the top
assert.equal(middle.mounted, 248);                           // 246.2 full rows + partial rows at both edges
assert.ok(middle.mounted / ROWS < 0.025);                    // under 2.5% of the rows exist at once

const getItemLayout = (_: unknown, index: number) => ({ length: ROW, offset: ROW * index, index });
assert.deepEqual(getItemLayout(null, 5000), { length: 72, offset: 360_000, index: 5000 });

// variable heights: prefix sums + binary search find the first visible row in O(log n)
const heights = Array.from({ length: ROWS }, (_, i) => (i % 10 === 0 ? 120 : 64));   // every 10th row is a header
const prefix = [0];
for (const h of heights) prefix.push(prefix[prefix.length - 1] + h);
function firstVisible(offset: number) {
  let lo = 0, hi = ROWS - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (prefix[mid] <= offset) lo = mid; else hi = mid - 1; }
  return lo;
}
assert.equal(prefix[10], 120 + 9 * 64);                      // 696 pt for the first 10 rows
assert.equal(firstVisible(0), 0);
assert.equal(firstVisible(696), 10);
assert.equal(firstVisible(700), 10);
assert.equal(firstVisible(prefix[ROWS] - 1), ROWS - 1);

// cost model: mounting rows at ~0.15 ms each on a mid-range phone (illustrative)
const msFor = (rows: number) => rows * 0.15;
assert.equal(msFor(10_000), 1500);                           // 1.5 s of blocked JS before first paint
assert.ok(msFor(top.mounted) < 20);                          // the virtualised first window
console.log('mounted at top', top.mounted, '| mid', middle.mounted, '| first visible at 700pt:', firstVisible(700));`,
        },
        production: {
          language: 'tsx',
          filename: 'TransactionsList.tsx',
          explanation: 'Production React Native FlatList for 10,000+ rows: getItemLayout for fixed heights, a memoised row with primitive props and a stable callback, stable id keys, tuned initial/batch rendering, sized cached images, and a pull-to-refresh/end-reached setup. (FlashList, which recycles native views, is a drop-in alternative for very large or complex lists.)',
          code: raw`import { memo, useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, type ListRenderItem } from 'react-native';
import { Image } from 'expo-image';

type Txn = { id: string; merchant: string; amountCents: number; date: string; logoUrl: string };
const ROW_HEIGHT = 72;
const money = new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT' });   // created once, not per row

const Row = memo(function Row({ id, merchant, amountCents, date, logoUrl, onOpen }: Txn & { onOpen: (id: string) => void }) {
  return (
    <Pressable onPress={() => onOpen(id)} style={styles.row} accessibilityRole="button">
      <Image source={{ uri: logoUrl + '?w=120' }} recyclingKey={id} cachePolicy="memory-disk" style={styles.logo} />
      <View style={styles.text}>
        <Text numberOfLines={1}>{merchant}</Text>
        <Text style={styles.date}>{date}</Text>
      </View>
      <Text>{money.format(amountCents / 100)}</Text>
    </Pressable>
  );
});

export function TransactionsList({ data, onOpen, onEndReached, refreshing, onRefresh }: {
  data: Txn[]; onOpen: (id: string) => void; onEndReached: () => void; refreshing: boolean; onRefresh: () => void;
}) {
  const open = useCallback((id: string) => onOpen(id), [onOpen]);          // stable reference for memo
  const renderItem: ListRenderItem<Txn> = useCallback(({ item }) => <Row {...item} onOpen={open} />, [open]);

  return (
    <FlatList
      data={data}
      renderItem={renderItem}
      keyExtractor={(t) => t.id}                                            // stable ids, never indexes
      getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
      initialNumToRender={14}                                               // ~ one screen
      maxToRenderPerBatch={10}
      windowSize={11}                                                       // 5 screens above/below: less memory
      removeClippedSubviews                                                 // detach off-screen native views (Android)
      onEndReachedThreshold={0.5}
      onEndReached={onEndReached}
      refreshing={refreshing}
      onRefresh={onRefresh}
    />
  );
}

const styles = StyleSheet.create({
  row: { height: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12 },
  logo: { width: 40, height: 40, borderRadius: 20 },
  text: { flex: 1 },
  date: { opacity: 0.6, fontSize: 12 },
});`,
        },
        bug: {
          explanation:
            'Mapping 5,000 rows inside a ScrollView mounts every row up front: the screen takes seconds to appear, memory balloons (every row\'s views and images exist at once), scrolling stutters during garbage collection, and on low-end Android devices the app can be killed. Use a virtualised list with stable keys and a fixed item layout.',
          buggy: {
            language: 'tsx',
            filename: 'Contacts.tsx',
            code: raw`// ❌ 5,000 rows mounted at once: slow first render, huge memory, janky scroll
export function Contacts({ contacts }: { contacts: Contact[] }) {
  return (
    <ScrollView>
      {contacts.map((c, i) => (
        <ContactRow key={i} contact={c} onPress={() => open(c.id)} />   /* index key + new callback each render */
      ))}
    </ScrollView>
  );
}`,
          },
          fixed: {
            language: 'tsx',
            filename: 'Contacts.tsx',
            code: raw`// ✅ Only the visible window is mounted; layout is known without measuring
const ContactRowMemo = memo(ContactRow);
export function Contacts({ contacts, open }: { contacts: Contact[]; open: (id: string) => void }) {
  const renderItem = useCallback(({ item }: { item: Contact }) => <ContactRowMemo contact={item} onPress={open} />, [open]);
  return (
    <FlatList
      data={contacts}
      keyExtractor={(c) => c.id}
      renderItem={renderItem}
      getItemLayout={(_, i) => ({ length: 64, offset: 64 * i, index: i })}
      initialNumToRender={15}
      windowSize={11}
    />
  );
}`,
          },
        },
      },
      takeaways: [
        'Jank = missing the 16.67/8.33 ms frame deadline on the UI or JS thread.',
        'Never map large collections inside ScrollView; virtualised lists mount only a window of rows.',
        'Provide getItemLayout for fixed heights, stable id keys, memoised rows with stable props.',
        'Profile release builds on mid-range Android devices, watching both UI and JS fps.',
        'Practice drill: with Tab 1\'s model, compute how many rows stay mounted mid-list with windowSize 11 (11 × 844 / 72 ≈ 129 full rows, 131 with edge rows) and the memory saved if each mounted row costs 40 kB ((248 − 131) × 40 kB ≈ 4.7 MB).',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'app-memory-battery-profiling',
      title: 'Memory Leak & Battery Profiling',
      summary: 'Find and fix the leaks that slowly kill long sessions (listeners, timers, subscriptions, closures holding screens) and the battery drains users notice (GPS, wake-ups, polling, animations off-screen).',
      difficulty: 'Advanced',
      minutes: 22,
      xp: 130,
      analogy:
        "A memory leak is a hotel guest who checks out but leaves the tap running: the room is \"empty\", yet water (memory) keeps flowing until the building floods. A battery drain is leaving the car engine idling in the car park: each minute seems harmless, but by the end of the day the tank is empty and the driver blames the car.",
      intuition: [
        { title: 'Leaks on mobile', body: "Every listener, timer, subscription or native observer registered by a screen must be removed when the screen unmounts. Otherwise its callback, and everything that callback closes over (state setters, the whole screen's data), stays reachable forever. Each navigation adds another copy." },
        { title: 'How to find them', body: "Navigate to and away from a screen 10–20 times, then compare heap snapshots (Hermes heap snapshots in React Native DevTools; Android Studio Memory Profiler; Xcode Memory Graph / Leaks). Growing counts of the same objects or listeners point to the leak." },
        { title: 'Battery: what costs energy', body: "Screen and GPU (animations that keep running off-screen), radio wake-ups (polling, chatty analytics), GPS at high accuracy, wake locks and frequent background work. The CPU spinning on JS while idle (an interval re-rendering a hidden screen) also adds up." },
        { title: 'Location is the classic drain', body: "Continuous high-accuracy GPS can drain a battery in hours. Use the lowest accuracy that works (balanced/significant-change), distance and time filters, stop watching when the screen is not visible or the app is backgrounded, and only use background location with a clear user-facing reason." },
        { title: 'Pause when not visible', body: "Stop timers, animations, sensors, video and polling when the app goes to the background or the screen loses focus (`useFocusEffect` in React Navigation). Resume on focus." },
        { title: 'Measure energy', body: "Xcode's Energy gauge and Instruments, Android Studio's Power Profiler and Battery Historian show CPU, network, location and wake-ups over time. Test long sessions and background periods, not just a quick tap-through." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Resource lifecycle for a screen', body: 'Everything acquired on focus is released on blur/unmount.', flow: ['screen focus → subscribe (location, sockets, timers)', 'app background → pause', 'app foreground → resume', 'screen blur / unmount → remove every subscription', 'heap snapshot after 20 visits: flat'] },
        { kind: 'warning', title: 'Background location needs a reason', body: 'Stores review background location closely and users see indicators and periodic reminders. Use it only for features that genuinely need it (navigation, fitness tracking), and explain it in the permission pre-prompt.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'leaks_and_energy_model.ts',
          explanation: 'Runnable TypeScript: an event emitter with listener counting that exposes a screen leaking one listener (and its captured data) per visit versus a screen that cleans up, a retained-bytes estimate after 20 visits, and an illustrative energy model comparing continuous high-accuracy GPS with a balanced, foreground-only strategy. All asserted.',
          code: raw`//  20 VISITS TO A MAP SCREEN
//
//   leaky:  mount -> subscribe(location)  unmount -> (nothing)    listeners: 1,2,3 ... 20   retained: 20 x screen data
//   clean:  mount -> subscribe(location)  unmount -> remove()     listeners: 1,0,1,0 ... 0
//   energy: high-accuracy GPS always on  vs  balanced + paused in background
import assert from 'node:assert/strict';

class Emitter<T> {
  private ls = new Set<(v: T) => void>();
  on(fn: (v: T) => void) { this.ls.add(fn); return { remove: () => { this.ls.delete(fn); } }; }
  emit(v: T) { this.ls.forEach((fn) => fn(v)); }
  get count() { return this.ls.size; }
}

const location = new Emitter<{ lat: number; lng: number }>();
type Screen = { unmount: () => void; updates: () => number };
function mountMapScreen(clean: boolean): Screen {
  const bigData = new Array(10_000).fill(0);                   // ~80 kB captured by the callback
  let updates = 0;
  const sub = location.on(() => { updates += bigData.length > 0 ? 1 : 0; });
  return { unmount: () => { if (clean) sub.remove(); }, updates: () => updates };
}

function visits(n: number, clean: boolean) {
  const screens: Screen[] = [];
  for (let i = 0; i < n; i++) { const s = mountMapScreen(clean); screens.push(s); s.unmount(); }
  location.emit({ lat: 23.81, lng: 90.41 });                  // one GPS update after leaving the screen
  const count = location.count;
  const zombieUpdates = screens.reduce((sum, s) => sum + s.updates(), 0);
  // reset for the next experiment
  for (const s of screens) void s;
  return { listeners: count, zombieUpdates };
}
const leaky = visits(20, false);
assert.deepEqual(leaky, { listeners: 20, zombieUpdates: 20 });   // 20 dead screens still receiving GPS
const retainedBytes = leaky.listeners * 10_000 * 8;
assert.equal(retainedBytes, 1_600_000);                          // 1.6 MB held by closures (and growing)

const location2 = new Emitter<number>();
let leakFreeCount = 0;
for (let i = 0; i < 20; i++) { const sub = location2.on(() => {}); leakFreeCount = Math.max(leakFreeCount, location2.count); sub.remove(); }
assert.equal(location2.count, 0);
assert.equal(leakFreeCount, 1);

// illustrative energy model (mW): one hour, user actively looks at the map for 10 minutes
const GPS_HIGH = 140, GPS_BALANCED = 35;                         // assumed average draw
const alwaysOnHigh = GPS_HIGH * 60;                              // mW-minutes for 60 min
const smart = GPS_BALANCED * 10;                                 // only while the screen is visible
assert.equal(alwaysOnHigh / smart, 24);                          // 24x less location energy
console.log('leaky listeners after 20 visits:', leaky.listeners, '| retained ~', retainedBytes / 1e6, 'MB | GPS energy ratio', alwaysOnHigh / smart);`,
        },
        production: {
          language: 'tsx',
          filename: 'NearbyMap.tsx',
          explanation: 'Production React Native screen that is leak-free and battery-aware: location is watched only while the screen is focused and the app is active (React Navigation useFocusEffect + AppState), with balanced accuracy and distance/time filters, and every subscription and timer is removed on blur, background or unmount.',
          code: raw`import { useCallback, useRef, useState } from 'react';
import { AppState, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';

type Coords = { latitude: number; longitude: number };

export function NearbyMap() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const watcher = useRef<Location.LocationSubscription | null>(null);

  const start = useCallback(async () => {
    if (watcher.current) return;
    const { granted } = await Location.getForegroundPermissionsAsync();   // asked earlier, in context
    if (!granted) return;
    watcher.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, distanceInterval: 50, timeInterval: 10_000 },   // not "BestForNavigation"
      (loc) => setCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude }),
    );
  }, []);

  const stop = useCallback(() => {
    watcher.current?.remove();                                   // releases the GPS and the closure
    watcher.current = null;
  }, []);

  // only while this screen is focused...
  useFocusEffect(useCallback(() => {
    void start();
    // ...and only while the app is in the foreground
    const sub = AppState.addEventListener('change', (s) => (s === 'active' ? void start() : stop()));
    const refresh = setInterval(() => { /* refresh nearby stores from cache */ }, 60_000);
    return () => {                                               // blur or unmount: release everything
      sub.remove();
      clearInterval(refresh);
      stop();
    };
  }, [start, stop]));

  return <Text>{coords ? coords.latitude.toFixed(3) + ', ' + coords.longitude.toFixed(3) : 'Locating…'}</Text>;
}`,
        },
        bug: {
          explanation:
            'The location watcher is started but its subscription is never removed. After leaving the screen, the GPS keeps running at high accuracy (a major battery drain), the callback keeps calling setState on an unmounted component, and each visit adds another watcher holding the screen\'s data in memory. Keep the subscription and remove it in the cleanup.',
          buggy: {
            language: 'tsx',
            filename: 'RunTracker.tsx',
            code: raw`// ❌ GPS never released: battery drain + one leaked watcher per visit
export function RunTracker() {
  const [path, setPath] = useState<Coords[]>([]);
  useEffect(() => {
    void Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation }, (loc) => {
      setPath((p) => [...p, loc.coords]);
    });                                                    // subscription discarded
  }, []);
  return <PathView path={path} />;
}`,
          },
          fixed: {
            language: 'tsx',
            filename: 'RunTracker.tsx',
            code: raw`// ✅ Keep the subscription, remove it on unmount (and handle unmount-before-resolve)
export function RunTracker() {
  const [path, setPath] = useState<Coords[]>([]);
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    void Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 10 },
      (loc) => setPath((p) => [...p, loc.coords]),
    ).then((s) => { if (cancelled) s.remove(); else sub = s; });
    return () => { cancelled = true; sub?.remove(); };
  }, []);
  return <PathView path={path} />;
}`,
          },
        },
      },
      takeaways: [
        'Every subscription, listener, timer and native watcher needs a matching removal on blur/unmount.',
        'Find leaks by repeating navigation and comparing heap snapshots; listener counts should return to zero.',
        'GPS, radio wake-ups, off-screen animations and polling are the usual battery drains.',
        'Use the lowest accuracy that works, filter updates, and pause everything when not visible.',
        'Practice drill: in Tab 1, mount 50 leaky screens and compute the retained memory (50 × 80 kB = 4 MB) and how many callbacks one GPS update triggers (50).',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'app-ota-store-release',
      title: 'OTA Updates vs Native Binary Releases & App Store / Google Play Compliance',
      summary: 'Ship JavaScript fixes over the air safely with runtime-version compatibility, staged rollouts and rollbacks, know what still requires a store release, and pass App Store and Google Play review.',
      difficulty: 'Advanced',
      minutes: 22,
      xp: 140,
      analogy:
        "A native binary release is shipping a new car from the factory: it goes through inspection (store review) and every owner must collect it. An over-the-air update is a software update the dealer pushes to cars already on the road: fast, but it must only change things the existing hardware supports. Push a feature that needs a part the old cars don't have and they break down on the motorway.",
      intuition: [
        { title: 'Two layers in every React Native app', body: "The native binary (Objective-C/Swift/Kotlin code, native modules, permissions, icons, SDK versions) ships through the stores. The JavaScript bundle and assets can be replaced over the air (EAS Update / expo-updates or similar) without review." },
        { title: 'Runtime version = compatibility contract', body: "An OTA update may only run on binaries with exactly the same native layer. The runtime version (ideally a fingerprint hash of native dependencies and config) is embedded in both; the update service only serves matching updates. Adding a native module means a new runtime version and a store release." },
        { title: 'Roll out gradually', body: "Release to a small percentage (deterministically bucketed by device or user id), watch crash-free sessions and key metrics, then expand. Keep a one-command rollback (republish the previous update), and use the embedded bundle as the emergency fallback if an update crashes on launch." },
        { title: 'What OTA may and may not do', body: "Bug fixes, copy changes and features within the reviewed app are normal OTA use. Stores do not allow updates that change the app's primary purpose, add features that would have needed review, or bypass store policies (for example unlocking digital purchases outside in-app purchase rules)." },
        { title: 'Store compliance essentials', body: "Accurate privacy declarations (App Store privacy details, Play Data safety form), iOS privacy manifests for required-reason APIs, in-app account deletion if users can create accounts, justified permissions with clear purpose strings, target recent Android API levels, a working demo account for reviewers, and no hidden or unfinished features." },
        { title: 'Versioning and signing', body: "User-facing version (1.4.0) plus a build number (iOS CFBundleVersion, Android versionCode) that must strictly increase for every upload. Protect signing keys (Play App Signing, App Store Connect API keys in CI secrets) and automate builds and submissions (EAS Build/Submit, fastlane)." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Release decision', body: 'Native changes decide the channel.', flow: ['change touches native code / permissions / SDKs?', 'yes → new runtime version → store build + review', 'no → OTA update for the current runtime version', 'staged rollout 5% → 25% → 100%', 'monitor crash-free sessions → expand or roll back'] },
        { kind: 'tip', title: 'Make reviewers\' lives easy', body: 'Provide demo credentials, explain non-obvious permissions and background modes in the review notes, and make sure every feature works without special server flags. Most rejections are missing information, not policy disputes.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'ota_compatibility_and_rollout.ts',
          explanation: 'Runnable TypeScript: a native fingerprint (hash of native dependencies and config) used as the runtime version, an update server that only serves compatible updates, deterministic percentage rollouts by hashing user ids, monotonic build-number checks for store uploads, and a crash-rate rollback rule. All asserted.',
          code: raw`//  WHICH BINARIES MAY RUN WHICH UPDATE?
//
//   [binary 1.4.0 | runtime fp:a1b2] <--- update #57 (fp:a1b2)                         served
//   [binary 1.4.0 | runtime fp:a1b2] <-X- update #58 (fp:c3d4, adds a native module)   NOT served
//   [binary 1.5.0 | runtime fp:c3d4] <--- update #58                                   served
//   rollout 10%: bucket = hash(userId) % 100 < 10 -> the same users stay in the cohort
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const fingerprint = (nativeDeps: Record<string, string>, config: Record<string, unknown>) =>
  createHash('sha256').update(JSON.stringify({ nativeDeps, config })).digest('hex').slice(0, 8);

const v140 = fingerprint({ 'react-native': '0.88.1', 'expo-camera': '58.0.0' }, { permissions: ['CAMERA'] });
const v150 = fingerprint({ 'react-native': '0.88.1', 'expo-camera': '58.0.0', 'expo-location': '58.0.0' }, { permissions: ['CAMERA', 'LOCATION'] });
assert.notEqual(v140, v150);                                       // a new native module changes the runtime
assert.equal(v140, fingerprint({ 'react-native': '0.88.1', 'expo-camera': '58.0.0' }, { permissions: ['CAMERA'] }));   // JS-only changes don't

type Update = { id: number; runtimeVersion: string; rolloutPct: number };
const updates: Update[] = [
  { id: 57, runtimeVersion: v140, rolloutPct: 100 },
  { id: 58, runtimeVersion: v150, rolloutPct: 100 },
  { id: 59, runtimeVersion: v140, rolloutPct: 10 },              // a JS fix being rolled out gradually
];
const bucket = (userId: string) => createHash('sha256').update(userId).digest().readUInt32BE(0) % 100;
function updateFor(runtime: string, userId: string): number | null {
  const eligible = updates.filter((u) => u.runtimeVersion === runtime && bucket(userId) < u.rolloutPct);
  return eligible.length ? Math.max(...eligible.map((u) => u.id)) : null;
}
const users = Array.from({ length: 10_000 }, (_, i) => 'user-' + i);
const got59 = users.filter((u) => updateFor(v140, u) === 59).length;
assert.ok(got59 > 850 && got59 < 1150, 'about 10% get update 59: ' + got59);
assert.ok(users.every((u) => updateFor(v140, u) !== 58));        // old binaries never receive the native-dependent update
assert.equal(updateFor(v140, 'user-42'), updateFor(v140, 'user-42'));   // stable cohort membership

// store uploads: build numbers must strictly increase
const canUpload = (previous: number[], next: number) => previous.every((b) => next > b);
assert.equal(canUpload([140, 141, 150], 151), true);
assert.equal(canUpload([140, 141, 150], 150), false);

// rollback rule: compare crash-free sessions of the new update with the baseline
const shouldRollBack = (baseline: number, candidate: number, sessions: number) => sessions >= 1000 && baseline - candidate > 0.005;
assert.equal(shouldRollBack(0.998, 0.991, 4000), true);          // 0.7 percentage points worse
assert.equal(shouldRollBack(0.998, 0.996, 4000), false);
console.log('runtime 1.4.0', v140, '| 1.5.0', v150, '| users on #59 at 10%:', got59);`,
        },
        production: {
          language: 'ts',
          filename: 'updates.ts',
          explanation: 'Production Expo setup: app config with a fingerprint runtime-version policy (so OTA updates only reach compatible binaries), and an in-app update flow with expo-updates that checks on launch and foreground, downloads in the background and applies the update at a safe moment rather than interrupting the user.',
          code: raw`import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

/* app.config.ts
import type { ExpoConfig } from 'expo/config';
const config: ExpoConfig = {
  name: 'Shop', slug: 'shop', version: '1.5.0',
  runtimeVersion: { policy: 'fingerprint' },        // hash of native deps + config: changes => new store build
  updates: { url: 'https://u.expo.dev/<project-id>', checkAutomatically: 'ON_LOAD', fallbackToCacheTimeout: 0 },
  ios: { bundleIdentifier: 'com.example.shop', buildNumber: '151' },
  android: { package: 'com.example.shop', versionCode: 151 },
};
export default config;

Release commands (CI):
  eas build --platform all --profile production      # new runtime: store binaries
  eas submit --platform all
  eas update --channel production --message "Fix checkout total rounding"   # JS-only fix, same runtime
*/

let pending = false;

export async function checkForUpdate() {
  if (!Updates.isEnabled || __DEV__) return;            // dev builds and Expo Go use the local bundle
  try {
    const check = await Updates.checkForUpdateAsync();   // only updates for THIS runtime version are offered
    if (!check.isAvailable) return;
    const result = await Updates.fetchUpdateAsync();     // downloads in the background
    pending = result.isNew;
  } catch (e) {
    console.warn('update check failed; keeping the current bundle', e);   // never block the app on updates
  }
}

// Apply at a safe moment: next cold start, or when the user returns after a while
export function startUpdateLoop() {
  void checkForUpdate();
  let backgroundedAt = 0;
  const sub = AppState.addEventListener('change', (s) => {
    if (s === 'background') backgroundedAt = Date.now();
    if (s === 'active') {
      if (pending && Date.now() - backgroundedAt > 10 * 60_000) void Updates.reloadAsync();   // not mid-task
      else void checkForUpdate();
    }
  });
  return () => sub.remove();
}

export const currentBuildInfo = () => ({
  runtimeVersion: Updates.runtimeVersion, updateId: Updates.updateId,
  channel: Updates.channel, emergencyLaunch: Updates.isEmergencyLaunch,   // true if the last update crashed on launch
});`,
        },
        bug: {
          explanation:
            'The runtime version is a hand-maintained constant that was not bumped when a native module (expo-location) was added. The OTA update is therefore delivered to old binaries that do not contain the module, and the new JavaScript crashes when it calls into native code that isn\'t there. Derive the runtime version from a fingerprint of the native layer so incompatible updates are never served.',
          buggy: {
            language: 'ts',
            filename: 'app.config.ts',
            code: raw`// ❌ Static runtime version: JS that needs a new native module reaches old binaries
export default {
  name: 'Shop', version: '1.5.0',
  runtimeVersion: '1.0.0',                      // unchanged since launch
  plugins: ['expo-camera', 'expo-location'],    // expo-location added in 1.5.0 -> crash on 1.4.x via OTA
};`,
          },
          fixed: {
            language: 'ts',
            filename: 'app.config.ts',
            code: raw`// ✅ Runtime version derived from the native layer: changes automatically when native code changes
export default {
  name: 'Shop', version: '1.5.0',
  runtimeVersion: { policy: 'fingerprint' },
  plugins: ['expo-camera', 'expo-location'],    // new fingerprint -> new store build; 1.4.x keeps its own updates
};`,
          },
        },
      },
      takeaways: [
        'OTA updates replace JS and assets; anything native (modules, permissions, SDKs) needs a store release.',
        'Tie updates to a runtime version derived from a native fingerprint so incompatible bundles are never served.',
        'Roll out gradually with stable bucketing, watch crash-free sessions, and keep a fast rollback.',
        'Pass review: honest privacy declarations, account deletion, justified permissions, increasing build numbers, demo credentials.',
        'Practice drill: in Tab 1, raise update #59 to 50% and check the share of users who receive it (≈ 5,000), then explain why none of them receive #58.',
      ],
    },
  ],
};
