import type { Module } from '../../types';

const raw = String.raw;

export const platformModule: Module = {
  id: 'app-platform',
  title: 'Mobile OS Lifecycle & Rendering Engines',
  level: 'Scratch',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'app-lifecycle-process-death',
      title: 'App Lifecycle States & Surviving OS Process Death',
      summary: 'What iOS and Android do to your app when the user switches away, why the OS may kill the process without warning, and where to save state so nothing typed is ever lost.',
      difficulty: 'Scratch',
      minutes: 18,
      xp: 80,
      analogy:
        "A phone is a small hotel with very few rooms (memory). Your app is a guest. While the guest is in the lobby (foreground) they get full service. When they go upstairs (background) they get a few minutes, then the lights are switched off (suspended). If a VIP arrives and the hotel is full, the manager quietly empties a sleeping guest's room (process death), with no knock on the door. A smart guest writes notes on the way upstairs, so they can pick up exactly where they left off when they come back.",
      intuition: [
        { title: 'The states', body: "Not running → foreground active (visible, receiving input) → inactive (visible but interrupted: incoming call, Control Center, app switcher) → background (not visible, briefly allowed to run) → suspended (frozen in memory, no CPU) → killed. React Native exposes the common ones as `AppState`: `active`, `inactive` (iOS) and `background`." },
        { title: 'Background time is short', body: "iOS gives a backgrounded app a few seconds (longer only with an explicit background task); Android stops ordinary work quickly and defers it to the OS schedulers (WorkManager). Assume any code after the app leaves the screen may not finish." },
        { title: 'Suspended apps can be killed silently', body: "When memory is low, the OS terminates suspended processes without calling any of your code. There is no \"onKill\" event. Android users also lose state when the system kills the process and later recreates the activity; iOS users see a cold launch." },
        { title: 'Process death erases memory', body: "Everything in JavaScript memory is gone: component state, Redux/Zustand stores, in-flight requests, timers. Only what was written to disk (MMKV, SQLite, files, the platform's saved-instance state) survives." },
        { title: 'Save at the right moment', body: "Persist drafts and navigation state when the app goes to `background` (and debounced while the user types), not on unmount: unmount never runs when the process is killed. Persist small, versioned snapshots, not giant object graphs." },
        { title: 'Test it deliberately', body: "On Android enable \"Don't keep activities\" or run `adb shell am kill <package>` while the app is in the background; on iOS, background the app and stop it from Xcode. Then relaunch: the user should land on the same screen with the same draft." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Lifecycle and what to do at each step', body: 'The last guaranteed moment to save is the transition to background.', flow: ['active (user typing → debounced autosave)', 'inactive (pause timers/video)', 'background → flush drafts + nav state to disk', 'suspended (no CPU)', 'killed by OS (no callback)', 'cold start → restore from disk'] },
        { kind: 'warning', title: 'Never rely on unmount or onDestroy', body: 'Component unmount, componentWillUnmount and Activity.onDestroy are not called when the OS kills a suspended process. Treat them as cleanup hooks, not as save hooks.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'lifecycle_from_scratch.ts',
          explanation: 'Runnable TypeScript model of the mobile lifecycle: a validated state machine, in-memory JS state that is wiped by process death, and two save strategies. Saving on unmount loses the draft when the OS kills the app; saving on the background transition restores it after a cold start. All asserted.',
          code: raw`//  LIFECYCLE (save points marked *)
//
//   [not running] -> [active] <-> [inactive] -> [background]* -> [suspended] --(low memory)--> [killed]
//        ^                                                                                       |
//        +----------------------------- cold start: restore from disk <--------------------------+
//   JS memory (stores, timers, component state) dies with the process; disk survives
import assert from 'node:assert/strict';

type State = 'not-running' | 'active' | 'inactive' | 'background' | 'suspended';
const ALLOWED: Record<State, State[]> = {
  'not-running': ['active'],
  active: ['inactive', 'background'],
  inactive: ['active', 'background'],
  background: ['active', 'suspended', 'not-running'],
  suspended: ['active', 'not-running'],                       // not-running here = killed, no callback
};

class FakeOs {
  disk = new Map<string, string>();                           // survives process death
  state: State = 'not-running';
  private listeners: Array<(s: State) => void> = [];
  memory: { draft: string } | null = null;                     // the JS heap
  launch(app: (os: FakeOs) => void) { this.listeners = []; this.memory = { draft: '' }; this.go('active'); app(this); }
  onChange(fn: (s: State) => void) { this.listeners.push(fn); }
  go(next: State) {
    assert.ok(this.state === next || ALLOWED[this.state].includes(next), this.state + ' -> ' + next + ' is not a legal transition');
    this.state = next;
    if (next !== 'suspended') this.listeners.forEach((fn) => fn(next));   // suspended apps get no CPU
  }
  killWhileSuspended() { this.go('not-running'); this.memory = null; this.listeners = []; }   // silent
}

function runScenario(strategy: 'save-on-unmount' | 'save-on-background') {
  const os = new FakeOs();
  const app = (o: FakeOs) => {
    const saved = o.disk.get('draft');
    if (saved !== undefined) o.memory!.draft = saved;          // restore on cold start
    o.onChange((s) => {
      if (strategy === 'save-on-background' && s === 'background') o.disk.set('draft', o.memory!.draft);
      // 'save-on-unmount' would save in a cleanup that the OS never calls on kill
    });
  };
  os.launch(app);
  os.memory!.draft = 'Meeting notes: ship v2 on Friday';      // user types
  os.go('inactive'); os.go('background'); os.go('suspended');  // user switches to the camera app
  os.killWhileSuspended();                                     // OS needs memory: no callback
  os.launch(app);                                              // user returns: cold start
  return os.memory!.draft;
}

assert.equal(runScenario('save-on-unmount'), '');             // draft lost
assert.equal(runScenario('save-on-background'), 'Meeting notes: ship v2 on Friday');
assert.throws(() => { const o = new FakeOs(); o.go('suspended'); }, /not a legal transition/);
console.log('unmount-save restored:', JSON.stringify(runScenario('save-on-unmount')),
  '| background-save restored:', JSON.stringify(runScenario('save-on-background')));`,
        },
        production: {
          language: 'tsx',
          filename: 'useDraftPersistence.tsx',
          explanation: 'Production React Native: a hook that autosaves a draft (debounced while typing) and flushes it synchronously to MMKV when AppState changes to background, restores it on cold start, and clears it after a successful send. MMKV writes are synchronous, so the flush completes inside the brief background window.',
          code: raw`import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, TextInput, type AppStateStatus } from 'react-native';
import { MMKV } from 'react-native-mmkv';            // v3 API (v4: createMMKV())

const storage = new MMKV({ id: 'drafts' });
type Draft = { v: 1; text: string; updatedAt: number };

export function useDraftPersistence(key: string) {
  // 1) restore synchronously on first render (cold start after process death)
  const [text, setText] = useState(() => {
    const raw = storage.getString(key);
    if (!raw) return '';
    const d = JSON.parse(raw) as Draft;
    return d.v === 1 ? d.text : '';                  // ignore snapshots from incompatible versions
  });
  const latest = useRef(text);
  latest.current = text;

  const flush = useCallback(() => {
    const draft: Draft = { v: 1, text: latest.current, updatedAt: Date.now() };
    if (latest.current) storage.set(key, JSON.stringify(draft));
    else storage.delete(key);
  }, [key]);

  // 2) debounced autosave while typing (survives crashes too)
  useEffect(() => {
    const t = setTimeout(flush, 500);
    return () => clearTimeout(t);
  }, [text, flush]);

  // 3) guaranteed flush when leaving the foreground: the last moment we are sure to run
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'background' || s === 'inactive') flush();
    });
    return () => sub.remove();
  }, [flush]);

  const clear = useCallback(() => { storage.delete(key); setText(''); }, [key]);
  return { text, setText, clear };
}

// usage: the composer never loses text, even after the OS kills the app
export function Composer({ threadId }: { threadId: string }) {
  const draft = useDraftPersistence('draft:' + threadId);
  return <TextInput value={draft.text} onChangeText={draft.setText} multiline placeholder="Message" />;
}`,
        },
        bug: {
          explanation:
            'The draft is only written in the effect cleanup, which runs on unmount. When the OS kills the suspended process, no JavaScript runs at all, so the cleanup never fires and everything the user typed is gone on the next launch. Save when the app moves to the background (and periodically while typing).',
          buggy: {
            language: 'tsx',
            filename: 'Composer.tsx',
            code: raw`// ❌ Cleanup never runs on process death: the draft disappears
export function Composer({ threadId }: { threadId: string }) {
  const [text, setText] = useState(() => storage.getString('draft:' + threadId) ?? '');
  const latest = useRef(text);
  latest.current = text;
  useEffect(() => () => storage.set('draft:' + threadId, latest.current), [threadId]);  // unmount only
  return <TextInput value={text} onChangeText={setText} multiline />;
}`,
          },
          fixed: {
            language: 'tsx',
            filename: 'Composer.tsx',
            code: raw`// ✅ Flush on background + debounced autosave
export function Composer({ threadId }: { threadId: string }) {
  const [text, setText] = useState(() => storage.getString('draft:' + threadId) ?? '');
  const latest = useRef(text);
  latest.current = text;
  useEffect(() => {
    const save = () => storage.set('draft:' + threadId, latest.current);
    const sub = AppState.addEventListener('change', (s) => { if (s !== 'active') save(); });
    const t = setTimeout(save, 500);
    return () => { clearTimeout(t); sub.remove(); };
  }, [threadId, text]);
  return <TextInput value={text} onChangeText={setText} multiline />;
}`,
          },
        },
      },
      takeaways: [
        'Apps move between active, inactive, background and suspended; suspended apps can be killed with no callback.',
        'Process death wipes all JS memory; only disk survives.',
        'Persist drafts and navigation state on the transition to background and while typing, never on unmount.',
        'Test process death deliberately on both platforms.',
        'Practice drill: in Tab 1, add a second field (a selected tab index) to the saved snapshot and assert that it is restored after killWhileSuspended().',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'app-rendering-architectures',
      title: 'Native (SwiftUI/Compose) vs React Native New Architecture vs Flutter',
      summary: 'How each approach turns your code into pixels: platform UI toolkits, React Native\'s JSI/Fabric/TurboModules on native views, and Flutter\'s Impeller renderer drawing every pixel itself.',
      difficulty: 'Beginner',
      minutes: 22,
      xp: 100,
      analogy:
        "Three ways to furnish a flat. Pure native is buying furniture from the building's own workshop: perfect fit, but you need a carpenter for each building (iOS and Android). React Native is one designer giving instructions, in one language, to each building's workshop, which still makes real local furniture; the New Architecture replaced the slow message-passing letters with a direct phone line. Flutter brings its own 3D printer and prints every piece itself, so the flats look identical everywhere.",
      intuition: [
        { title: 'Pure native', body: "SwiftUI (iOS) and Jetpack Compose (Android) are declarative UI frameworks running on the platform's own UI toolkit. You get immediate access to every new OS API and the platform look and feel, at the cost of two codebases and two teams." },
        { title: 'React Native: the old bridge', body: "JavaScript ran on its own thread and talked to native code by serialising messages to JSON and sending them asynchronously in batches. Every native call cost at least one frame of latency and serialisation time, and large data was expensive to move." },
        { title: 'React Native New Architecture', body: "JSI (JavaScript Interface) lets JS hold direct references to C++ host objects and call them synchronously. Fabric is the new renderer: React's shadow tree is built in C++, can be read synchronously and supports concurrent React features. TurboModules are lazily loaded, type-safe native modules generated by Codegen from a TypeScript spec. It is the default in current React Native releases (bridgeless)." },
        { title: 'Flutter', body: "Dart code builds a widget tree; Flutter lays it out and paints every pixel with its own renderer (Impeller, which precompiles shaders to avoid first-run jank) onto a platform surface. Pixel-identical UI across platforms; native platform views are embedded when needed." },
        { title: 'The frame budget is the same for all', body: "60 Hz leaves 16.67 ms per frame, 120 Hz (ProMotion and many Android phones) only 8.33 ms. Whatever the framework, input handling, layout and drawing for each frame must fit, so heavy work moves off the UI thread." },
        { title: 'Choosing', body: "Team skills and code sharing with the web favour React Native; pixel-perfect custom UI and one rendering engine favour Flutter; deep platform integration, widgets, watch/car apps and maximum polish favour native. Many large apps mix: native shells with React Native or Flutter screens." },
      ],
      callouts: [
        { kind: 'architecture', title: 'React Native New Architecture', body: 'JS talks to C++ directly; native views are created by Fabric.', flow: ['React (JS, Hermes)', 'JSI: synchronous C++ host objects', 'Fabric renderer (C++ shadow tree, Yoga layout)', 'TurboModules (Codegen typed specs)', 'native views on the UI thread'] },
        { kind: 'tip', title: 'Use the same mental model everywhere', body: 'Whatever the framework: a UI thread that must hit 16.67/8.33 ms, a place where your app logic runs, and a boundary between them. Most performance work is about what crosses that boundary and how often.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'bridge_vs_jsi_model.ts',
          explanation: 'Runnable TypeScript cost model: frame budgets at 60/90/120 Hz, the old asynchronous bridge (JSON-serialised calls flushed once per frame, results arriving a frame later) vs synchronous JSI calls, measuring real serialisation sizes for a 1,000-item payload. All results asserted.',
          code: raw`//  OLD BRIDGE (async, batched)                    NEW ARCHITECTURE (JSI)
//
//   JS thread --JSON batch--> | queue | --> native   JS --direct C++ call--> native host object
//   frame N: enqueue          | flush |  frame N+1   same frame, no serialisation, sync result
//   result <--JSON------------------------ frame N+2
import assert from 'node:assert/strict';

const budget = (hz: number) => Math.round((1000 / hz) * 100) / 100;
assert.deepEqual([60, 90, 120].map(budget), [16.67, 11.11, 8.33]);

// a payload crossing the boundary: 1,000 contacts
const contacts = Array.from({ length: 1000 }, (_, i) => ({ id: i, name: 'Contact ' + i, phone: '+880170000' + String(i).padStart(4, '0') }));
const json = JSON.stringify(contacts);
const bytes = Buffer.byteLength(json);
assert.ok(bytes > 50_000, 'serialised payload is tens of kB');
assert.deepEqual(JSON.parse(json)[999], contacts[999]);        // the bridge copies, both sides own a copy

type Call = { method: string; args: unknown[] };
class OldBridge {
  queue: Call[] = []; frame = 0; delivered: Array<{ method: string; frame: number }> = [];
  call(method: string, ...args: unknown[]) { this.queue.push({ method, args }); }   // async: returns nothing now
  endFrame() {                                                  // flushed once per frame
    const batch = JSON.parse(JSON.stringify(this.queue)) as Call[];
    this.queue = [];
    this.frame++;
    for (const c of batch) this.delivered.push({ method: c.method, frame: this.frame });
  }
}
const bridge = new OldBridge();
bridge.call('measureLayout', 42);
assert.equal(bridge.delivered.length, 0);                     // nothing happened yet in this frame
bridge.endFrame();
assert.deepEqual(bridge.delivered, [{ method: 'measureLayout', frame: 1 }]);   // >= 1 frame of latency

// JSI: JS holds a reference to a C++ host object and calls it synchronously
const hostObject = { measureLayout: (tag: number) => ({ tag, width: 320, height: 48 }) };
const layout = hostObject.measureLayout(42);                   // result available immediately
assert.deepEqual(layout, { tag: 42, width: 320, height: 48 });

// cost of moving the payload once per frame at 120 Hz with a 5 ms serialise+parse step
const perFrameMs = 5;
assert.ok(perFrameMs / budget(120) > 0.5, 'more than half of a 120 Hz frame spent just copying data');
console.log('payload', bytes, 'bytes | 120 Hz budget', budget(120), 'ms | bridge delivered in frame', bridge.delivered[0].frame);`,
        },
        production: {
          language: 'ts',
          filename: 'NativeDeviceInfo.ts',
          explanation: 'Production React Native New Architecture: a TurboModule spec written in TypeScript. Codegen reads it to generate type-safe C++/Objective-C++/Kotlin glue, synchronous methods are called through JSI, async methods return Promises, and getEnforcing fails fast at startup if the native side is missing.',
          code: raw`// NativeDeviceInfo.ts  (file name must start with "Native" for Codegen)
// package.json:
//   "codegenConfig": { "name": "DeviceInfoSpec", "type": "modules", "jsSrcsDir": "src/specs",
//                      "android": { "javaPackageName": "com.example.deviceinfo" } }
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  // synchronous: runs on the JS thread via JSI and returns immediately; keep it O(1)
  getBatteryLevel(): number;
  isLowPowerModeEnabled(): boolean;
  // asynchronous: heavy work runs on a native background thread
  compressImage(uri: string, maxEdgePx: number, quality: number): Promise<string>;
  // events and constants are typed too
  getConstants(): { model: string; osVersion: string; supports120Hz: boolean };
}

// getEnforcing throws a clear error at startup if the module is not linked,
// instead of returning undefined and crashing later at the first call
export default TurboModuleRegistry.getEnforcing<Spec>('NativeDeviceInfo');

// ---- usage in app code ----
// import DeviceInfo from './specs/NativeDeviceInfo';
// const { supports120Hz } = DeviceInfo.getConstants();
// if (DeviceInfo.isLowPowerModeEnabled()) reduceAnimations();
// const thumbUri = await DeviceInfo.compressImage(photo.uri, 1280, 0.8);`,
        },
        bug: {
          explanation:
            'Legacy NativeModules access is untyped and, in bridgeless New Architecture apps or when the module is not linked, can be undefined, so the app crashes the first time a user taps the feature. A typed TurboModule spec with getEnforcing is checked at build time by Codegen and fails fast at startup.',
          buggy: {
            language: 'ts',
            filename: 'battery.ts',
            code: raw`// ❌ Untyped legacy bridge access: undefined at runtime, any-typed, callback API
import { NativeModules } from 'react-native';

export function readBattery(cb: (level: number) => void) {
  NativeModules.DeviceInfo.getBatteryLevel((level: any) => cb(level));   // TypeError if not linked
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'battery.ts',
            code: raw`// ✅ Typed TurboModule: Codegen-generated glue, synchronous JSI call, fails fast if missing
import DeviceInfo from './specs/NativeDeviceInfo';

export function readBattery(): number {
  return DeviceInfo.getBatteryLevel();       // number, checked by TypeScript and Codegen
}`,
          },
        },
      },
      takeaways: [
        'Native = platform toolkits; React Native = JS driving real native views; Flutter = its own renderer painting every pixel.',
        'The New Architecture replaces the async JSON bridge with JSI (sync C++ calls), Fabric (C++ renderer) and TurboModules (typed, lazy).',
        'Every framework shares the same budget: 16.67 ms per frame at 60 Hz, 8.33 ms at 120 Hz.',
        'Minimise what crosses the JS/native boundary and how often.',
        'Practice drill: compute the 90 Hz and 144 Hz frame budgets (11.11 ms and 6.94 ms) and decide whether a 9 ms JS handler can run every frame at 120 Hz (no: 9 > 8.33).',
      ],
    },
  ],
};
