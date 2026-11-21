import type { Module } from '../../types';

const raw = String.raw;

export const uiNavigationModule: Module = {
  id: 'app-ui-navigation',
  title: 'Mobile UI, Navigation & Gesture Ergonomics',
  level: 'Beginner',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'app-navigation-trees',
      title: 'Navigation Trees: Stacks, Tabs, Drawers & Modals',
      summary: 'Model mobile navigation as a tree of navigators, predict exactly what the back button does, and map deep links onto nested navigation state without passing functions around.',
      difficulty: 'Beginner',
      minutes: 20,
      xp: 90,
      analogy:
        "Navigation in a mobile app is a building with several wings (tabs). Each wing has its own stack of rooms you walked through, so leaving the Settings wing and coming back puts you in the same room. A modal is a pop-up kiosk in the lobby that covers everything until you close it. The back button always means \"undo my last step\": close the kiosk first, then walk back one room, then go to the main wing, and only then leave the building.",
      intuition: [
        { title: 'Navigators are nested', body: "A typical app: a root stack containing the tab navigator plus full-screen modals; each tab has its own stack. The navigation state is a tree of `{ index, routes[] }` objects, which is what you persist, restore and deep-link into." },
        { title: 'Stack', body: "Push adds a screen on top with a slide transition; pop goes back. Native stacks (UINavigationController, Android Fragments) give platform-correct transitions and swipe-back gestures for free." },
        { title: 'Tabs and drawers', body: "Tabs switch between parallel sections and keep each section's stack alive; tapping the active tab usually pops it to the top. Drawers hold less frequent destinations; on phones, bottom tabs are more reachable than a hamburger menu." },
        { title: 'Modals', body: "Modals interrupt for a focused task (compose, filter, checkout step) and are presented above the tab bar from the root stack. They should be dismissible with a swipe or a clear Close/Cancel." },
        { title: 'Back behaviour', body: "Android's system back (and predictive back gesture) must: close the modal, else pop the current stack, else return to the initial tab, else leave the app. iOS has no global back button, so every pushed screen needs a visible back affordance and edge-swipe." },
        { title: 'Params must be serialisable', body: "Route params are part of the state tree: they get persisted, restored after process death, and built from deep links. Pass ids (`{ orderId: '42' }`), never functions or class instances; load data by id on the screen." },
      ],
      callouts: [
        { kind: 'architecture', title: 'A typical navigation tree', body: 'Modals live in the root stack so they cover the tab bar.', flow: ['RootStack', 'Tabs (Home, Orders, Profile)', 'each tab: its own Stack', 'Modal group: Compose, Filters', 'deep link myapp://orders/42 → Tabs/Orders/OrderDetail{id:42}'] },
        { kind: 'tip', title: 'Design for one-handed use', body: 'Primary actions belong in the bottom half of the screen (bottom tabs, bottom sheets, floating buttons). Top-corner buttons are hard to reach on large phones.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'navigation_state_from_scratch.ts',
          explanation: 'Runnable TypeScript: an immutable navigation-state reducer for a root stack with tabs (each with its own stack) and modals, Android back-button semantics, tab re-tap pop-to-top, and a deep-link parser that builds the nested state. All transitions asserted.',
          code: raw`//  NAVIGATION STATE TREE
//
//   root: [ Tabs | Compose(modal) ]
//            |
//            +-- home:    [ Feed, Post{id:7} ]
//            +-- orders:  [ OrderList, OrderDetail{id:42} ]     <- active tab
//   back: close modal -> pop stack -> go to home tab -> exit app
import assert from 'node:assert/strict';

type Route = { name: string; params?: Record<string, string> };
type Tab = 'home' | 'orders' | 'profile';
type Nav = { modals: Route[]; activeTab: Tab; stacks: Record<Tab, Route[]> };

const initial: Nav = {
  modals: [], activeTab: 'home',
  stacks: { home: [{ name: 'Feed' }], orders: [{ name: 'OrderList' }], profile: [{ name: 'Profile' }] },
};

type Action = { type: 'push'; route: Route } | { type: 'tab'; tab: Tab } | { type: 'modal'; route: Route } | { type: 'back' };
function reduce(s: Nav, a: Action): Nav | 'exit' {
  switch (a.type) {
    case 'push':
      return { ...s, stacks: { ...s.stacks, [s.activeTab]: [...s.stacks[s.activeTab], a.route] } };
    case 'tab':
      if (a.tab === s.activeTab) return { ...s, stacks: { ...s.stacks, [a.tab]: s.stacks[a.tab].slice(0, 1) } };   // re-tap: pop to top
      return { ...s, activeTab: a.tab };                                  // other stacks are preserved
    case 'modal':
      return { ...s, modals: [...s.modals, a.route] };
    case 'back':
      if (s.modals.length) return { ...s, modals: s.modals.slice(0, -1) };
      if (s.stacks[s.activeTab].length > 1) return { ...s, stacks: { ...s.stacks, [s.activeTab]: s.stacks[s.activeTab].slice(0, -1) } };
      if (s.activeTab !== 'home') return { ...s, activeTab: 'home' };
      return 'exit';
  }
}
const run = (s: Nav, ...actions: Action[]) => actions.reduce<Nav | 'exit'>((acc, a) => (acc === 'exit' ? acc : reduce(acc, a)), s);

const s1 = run(initial, { type: 'push', route: { name: 'Post', params: { id: '7' } } }, { type: 'tab', tab: 'orders' },
  { type: 'push', route: { name: 'OrderDetail', params: { id: '42' } } }, { type: 'modal', route: { name: 'Compose' } }) as Nav;
assert.equal(s1.activeTab, 'orders');
assert.deepEqual(s1.stacks.home.map((r) => r.name), ['Feed', 'Post']);           // home stack kept alive

const backs: Array<Nav | 'exit'> = [];
let cur: Nav | 'exit' = s1;
while (cur !== 'exit') { cur = reduce(cur, { type: 'back' }); backs.push(cur); }
const describe = (n: Nav | 'exit') => (n === 'exit' ? 'exit' : n.modals.length ? 'modal' : n.activeTab + ':' + n.stacks[n.activeTab].at(-1)!.name);
assert.deepEqual(backs.map(describe), ['orders:OrderDetail', 'orders:OrderList', 'home:Post', 'home:Feed', 'exit']);

const retap = run(s1, { type: 'tab', tab: 'orders' }) as Nav;
assert.deepEqual(retap.stacks.orders.map((r) => r.name), ['OrderList']);

// deep link -> nested state (params are strings: serialisable by design)
function fromUrl(url: string): Nav {
  const { host, pathname } = new URL(url);
  const [section, id] = [host, ...pathname.split('/').filter(Boolean)];
  if (section === 'orders' && id) return { ...initial, activeTab: 'orders', stacks: { ...initial.stacks, orders: [{ name: 'OrderList' }, { name: 'OrderDetail', params: { id } }] } };
  return initial;
}
const linked = fromUrl('myapp://orders/42');
assert.deepEqual(linked.stacks.orders.at(-1), { name: 'OrderDetail', params: { id: '42' } });
assert.equal(describe(reduce(linked, { type: 'back' })), 'orders:OrderList');   // back works naturally after a deep link
assert.doesNotThrow(() => JSON.parse(JSON.stringify(linked)));                     // persistable
console.log('back sequence:', backs.map(describe).join(' -> '));`,
        },
        production: {
          language: 'tsx',
          filename: 'navigation.tsx',
          explanation: 'Production React Navigation 7 (static API): a root native stack with a bottom-tab navigator and a modal group, per-screen linking paths with param parsing, typed params derived from the config, and navigation by id.',
          code: raw`import { createStaticNavigation, useNavigation, type StaticParamList } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Button, Text, View } from 'react-native';

function FeedScreen() { return <View><Text>Feed</Text></View>; }
function OrderListScreen() {
  const navigation = useNavigation();
  return <Button title="Open order 42" onPress={() => navigation.navigate('OrderDetail', { id: '42' })} />;  // ids, not objects
}
function OrderDetailScreen({ route }: { route: { params: { id: string } } }) {
  return <Text>Order {route.params.id}</Text>;           // load the order by id here (query cache)
}
function ProfileScreen() { return <Text>Profile</Text>; }
function ComposeScreen() { return <Text>Compose</Text>; }

const HomeTabs = createBottomTabNavigator({
  screens: {
    Feed: { screen: FeedScreen, linking: 'feed' },
    Orders: { screen: OrderListScreen, linking: 'orders' },
    Profile: { screen: ProfileScreen, linking: 'me' },
  },
});

const RootStack = createNativeStackNavigator({
  screens: {
    Home: { screen: HomeTabs, options: { headerShown: false } },
    OrderDetail: { screen: OrderDetailScreen, linking: { path: 'orders/:id' } },   // myapp://orders/42
  },
  groups: {
    Modals: {
      screenOptions: { presentation: 'modal' },          // covers the tab bar, swipe-down to dismiss
      screens: { Compose: { screen: ComposeScreen, linking: 'compose' } },
    },
  },
});

type RootStackParamList = StaticParamList<typeof RootStack>;
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}   // typed navigate() everywhere
  }
}

const Navigation = createStaticNavigation(RootStack);

export default function App() {
  return (
    <Navigation
      linking={{ enabled: 'auto', prefixes: ['myapp://', 'https://shop.example.com'] }}   // custom scheme + verified links
    />
  );
}`,
        },
        bug: {
          explanation:
            'Passing a callback in route params puts a function into the navigation state. It cannot be persisted or restored after process death, cannot be produced by a deep link, and React Navigation warns about non-serialisable values. Pass ids and let the next screen save through shared state or a mutation, then return with popTo and a plain value.',
          buggy: {
            language: 'tsx',
            filename: 'CheckoutScreen.tsx',
            code: raw`// ❌ A function inside navigation state: breaks persistence and deep links
<Button
  title="Change address"
  onPress={() => navigation.navigate('EditAddress', {
    address,                                   // whole object copied into params
    onSave: (a: Address) => setAddress(a),     // non-serialisable callback
  })}
/>`,
          },
          fixed: {
            language: 'tsx',
            filename: 'CheckoutScreen.tsx',
            code: raw`// ✅ Pass an id; the edit screen saves via a mutation and returns a plain value
<Button
  title="Change address"
  onPress={() => navigation.navigate('EditAddress', { addressId: address.id })}
/>

// EditAddressScreen, after the save succeeds:
// navigation.popTo('Checkout', { selectedAddressId: saved.id });   // serialisable result`,
          },
        },
      },
      takeaways: [
        'Navigation state is a tree: root stack → tabs (each with a stack) → modals on the root.',
        'Back closes modals, then pops the stack, then returns to the first tab, then exits.',
        'Tabs keep their stacks alive; re-tapping the active tab pops to top.',
        'Route params must be serialisable ids so state can be persisted and deep-linked.',
        'Practice drill: in Tab 1, add a drawer-free "settings" deep link (myapp://profile) and assert that back from it returns to the home tab, then exits.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'app-safe-area-keyboard-adaptive',
      title: 'Safe Areas, Keyboard Avoidance & Adaptive Phone/Tablet Layouts',
      summary: 'Keep content clear of notches, the Dynamic Island, rounded corners and the home indicator, keep the focused input visible above the keyboard, and adapt layouts from small phones to foldables and tablets.',
      difficulty: 'Beginner',
      minutes: 20,
      xp: 90,
      analogy:
        "A phone screen is a picture frame with a thick, irregular mount: the notch, rounded corners and the home bar cover parts of the picture. Safe areas tell you where the visible window starts. The keyboard is a drawer that slides up and covers the lower half; good forms move the shelf you are writing on above the drawer. Adaptive layout is furniture that rearranges itself when the room gets bigger (tablet) instead of just stretching the sofa.",
      intuition: [
        { title: 'Safe-area insets', body: "The OS reports insets for each edge: top (status bar, notch, Dynamic Island), bottom (home indicator, gesture bar), and left/right in landscape. Backgrounds should extend edge-to-edge; interactive content and text should sit inside the insets. Android 15+ makes edge-to-edge the default, so this applies on both platforms." },
        { title: 'Points, not pixels', body: "Layout uses density-independent units (iOS points, Android dp). A 1170 px wide iPhone at 3× density is 390 pt wide. Touch targets should be at least 44 pt (iOS) / 48 dp (Android)." },
        { title: 'Keyboard avoidance', body: "When the keyboard opens it covers the bottom of the screen. The focused input must stay visible: scroll the form so the input (plus some margin) sits above the keyboard's top edge, keep the submit button reachable, and let users dismiss the keyboard by tapping outside or dragging." },
        { title: 'Window size classes', body: "Adapt by available width, not device type: compact (< 600 dp, phones), medium (600–839 dp, small tablets, unfolded foldables), expanded (≥ 840 dp, tablets, desktop windows). Multi-window and split-screen mean a tablet app can be compact too." },
        { title: 'Adaptive patterns', body: "Compact: single pane, bottom tabs. Medium: navigation rail, wider content with max width. Expanded: list-detail two panes, persistent side navigation. Respond to rotation and fold changes without losing state." },
        { title: 'Accessibility scales everything', body: "Users can increase font size dramatically (Dynamic Type, Android font scale up to 200%). Layouts must wrap and scroll rather than clip; never fix heights for text containers." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Screen layers', body: 'Paint edge-to-edge, place content inside the insets, move with the keyboard.', flow: ['window (edge-to-edge background)', 'safe-area insets (top / bottom / sides)', 'scrollable content', 'keyboard frame (bottom inset grows)', 'focused input scrolled above keyboard'] },
        { kind: 'tip', title: 'Test the extremes', body: 'Smallest supported phone, largest font size, landscape with a notch, a foldable unfolded, split-screen on a tablet, and a hardware keyboard attached. Most layout bugs appear in at least one of these.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'insets_keyboard_sizes.ts',
          explanation: 'Runnable TypeScript: px → pt/dp conversion, the safe content rectangle from insets, the exact scroll needed to keep a focused input above the keyboard, window size classes and the layout chosen for each, and minimum touch-target checks. All asserted.',
          code: raw`//  iPhone-class screen, 390 x 844 pt
//
//   +------------------------------+  y=0
//   |  status bar / Dynamic Island |  top inset 59
//   |------------------------------|  y=59   safe content starts
//   |  [ Name          ]  y=560    |
//   |  [ Email (focus) ] y=600-648 |  <- must end above keyboard top (+16 margin)
//   |==============================|  y=508  keyboard top (height 336)
//   |  keyboard                    |
//   +------------------------------+  y=844  (bottom inset 34 = home indicator)
import assert from 'node:assert/strict';

const toPoints = (px: number, density: number) => px / density;
assert.equal(toPoints(1170, 3), 390);
assert.equal(toPoints(1080, 2.625), 411.42857142857144);         // common Android width in dp

type Insets = { top: number; bottom: number; left: number; right: number };
const screen = { width: 390, height: 844 };
const insets: Insets = { top: 59, bottom: 34, left: 0, right: 0 };
const safeRect = { x: insets.left, y: insets.top, width: screen.width - insets.left - insets.right, height: screen.height - insets.top - insets.bottom };
assert.deepEqual(safeRect, { x: 0, y: 59, width: 390, height: 751 });

// keyboard avoidance: how far must the scroll view move?
function scrollNeeded(inputTop: number, inputHeight: number, keyboardHeight: number, margin = 16) {
  const visibleBottom = screen.height - keyboardHeight;           // keyboard covers the home indicator area too
  return Math.max(0, inputTop + inputHeight + margin - visibleBottom);
}
assert.equal(scrollNeeded(600, 48, 336), 156);                    // 600 + 48 + 16 - 508
assert.equal(scrollNeeded(200, 48, 336), 0);                      // already visible

// window size classes (Material 3 breakpoints, in dp)
type SizeClass = 'compact' | 'medium' | 'expanded';
const sizeClass = (widthDp: number): SizeClass => (widthDp < 600 ? 'compact' : widthDp < 840 ? 'medium' : 'expanded');
const layoutFor: Record<SizeClass, string> = { compact: 'single-pane + bottom tabs', medium: 'nav rail + single wide pane', expanded: 'list-detail two panes' };
assert.deepEqual([390, 673, 1024].map(sizeClass), ['compact', 'medium', 'expanded']);   // phone, unfolded foldable, tablet
assert.equal(layoutFor[sizeClass(1024 / 2)], 'single-pane + bottom tabs');              // tablet in 50% split-screen

// touch targets
const minTarget = { ios: 44, android: 48 };
const tooSmall = [{ id: 'close', w: 32, h: 32 }, { id: 'send', w: 48, h: 48 }].filter((b) => Math.min(b.w, b.h) < minTarget.android);
assert.deepEqual(tooSmall.map((b) => b.id), ['close']);
console.log('safe rect', safeRect, '| scroll for focused email', scrollNeeded(600, 48, 336), 'pt');`,
        },
        production: {
          language: 'tsx',
          filename: 'AdaptiveForm.tsx',
          explanation: 'Production React Native: edge-to-edge screens using react-native-safe-area-context insets, a keyboard-aware form (KeyboardAvoidingView + ScrollView with keyboardShouldPersistTaps and interactive dismissal), and a list-detail layout that switches by window width class with useWindowDimensions.',
          code: raw`import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

type SizeClass = 'compact' | 'medium' | 'expanded';
const useSizeClass = (): SizeClass => {
  const { width } = useWindowDimensions();            // updates on rotation, folds and split-screen
  return width < 600 ? 'compact' : width < 840 ? 'medium' : 'expanded';
};

function CheckoutForm() {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24, paddingHorizontal: 16 }}
        keyboardShouldPersistTaps="handled"            // taps on buttons work while the keyboard is open
        keyboardDismissMode="interactive"               // drag down to dismiss (iOS)
      >
        <TextInput placeholder="Name" autoComplete="name" textContentType="name" returnKeyType="next" />
        <TextInput placeholder="Email" autoComplete="email" keyboardType="email-address" autoCapitalize="none" />
        <TextInput placeholder="Address" multiline style={{ minHeight: 88 }} />
      </ScrollView>
      {/* primary action stays reachable above the home indicator */}
      <Pressable style={{ marginBottom: insets.bottom + 8, marginHorizontal: 16, minHeight: 48, justifyContent: 'center' }}
                 accessibilityRole="button">
        <Text style={{ textAlign: 'center', fontWeight: '600' }}>Place order</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

function Inbox() {
  const size = useSizeClass();
  const [selected, setSelected] = useState<string | null>(null);
  if (size === 'expanded') {                           // tablet / large window: list + detail side by side
    return (
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ width: 360 }}><MessageList onOpen={setSelected} /></View>
        <View style={{ flex: 1 }}><MessageDetail id={selected} /></View>
      </View>
    );
  }
  return selected ? <MessageDetail id={selected} /> : <MessageList onOpen={setSelected} />;   // phone: one pane
}

function MessageList({ onOpen }: { onOpen: (id: string) => void }) {
  return <Pressable onPress={() => onOpen('m1')} style={{ minHeight: 48 }}><Text>First message</Text></Pressable>;
}
function MessageDetail({ id }: { id: string | null }) { return <Text>{id ?? 'Select a message'}</Text>; }

export default function App() {
  return <SafeAreaProvider><CheckoutForm /><Inbox /></SafeAreaProvider>;
}`,
        },
        bug: {
          explanation:
            'A hard-coded 20 pt top padding was right for old iPhones only. On notched and Dynamic Island devices the header slides under the camera cutout, the bottom button sits under the home indicator, and in landscape the content hits the rounded corners. Read the real insets from the OS.',
          buggy: {
            language: 'tsx',
            filename: 'Screen.tsx',
            code: raw`// ❌ Magic numbers: wrong on every modern phone and in landscape
export function Screen({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, paddingTop: 20 }}>
      {children}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}><BuyButton /></View>
    </View>
  );
}`,
          },
          fixed: {
            language: 'tsx',
            filename: 'Screen.tsx',
            code: raw`// ✅ Real insets on every edge, from react-native-safe-area-context
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function Screen({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}>
      {children}
      <View style={{ position: 'absolute', bottom: insets.bottom + 8, left: 16, right: 16 }}><BuyButton /></View>
    </View>
  );
}`,
          },
        },
      },
      takeaways: [
        'Paint edge-to-edge, but keep text and controls inside the safe-area insets on every edge.',
        'Lay out in points/dp; touch targets ≥ 44 pt (iOS) / 48 dp (Android).',
        'Keep the focused input above the keyboard and the primary action reachable.',
        'Adapt by window size class (compact < 600, medium < 840, expanded ≥ 840 dp), not by device type.',
        'Practice drill: compute the scroll needed for an input at y = 700 (height 48) with a 291 pt keyboard on an 844 pt screen (700 + 48 + 16 − 553 = 211).',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'app-gestures-ui-thread',
      title: '60/120fps Gestures & Animations on the Native UI Thread',
      summary: 'Why gestures stutter when they depend on the JavaScript thread, how worklets run animation logic on the UI thread, and how to build a swipe-to-dismiss sheet with springs and velocity.',
      difficulty: 'Intermediate',
      minutes: 22,
      xp: 120,
      analogy:
        "Imagine a puppet show where every hand movement must be approved by a manager in another room by walkie-talkie. If the manager is busy on another call, the puppet freezes mid-wave. Running gestures on the UI thread gives the puppeteer permission to move the puppet directly; the manager only hears about the final result (\"the sheet was dismissed\").",
      intuition: [
        { title: 'Two threads, one budget', body: "React Native has a JavaScript thread (your components, state, business logic) and the main/UI thread (native views, touch events, drawing). Each frame must be produced in 16.67 ms (60 Hz) or 8.33 ms (120 Hz). If a gesture update needs the JS thread and JS is busy, the frame is dropped." },
        { title: 'JS-driven gestures stutter', body: "PanResponder + setState sends every touch move to JS, re-renders, and sends the new position back. A 50 ms burst of JS work (parsing a response, a big re-render) freezes the drag for 6 frames at 120 Hz: visible jank." },
        { title: 'Worklets on the UI thread', body: "Reanimated runs small JavaScript functions (worklets) directly on the UI thread and stores animation state in shared values. React Native Gesture Handler recognises gestures natively and calls worklet callbacks, so dragging and animations continue even while the JS thread is busy." },
        { title: 'Springs and velocity', body: "Natural motion uses physics: a spring pulls toward a target with stiffness and damping, and starts from the finger's release velocity. Decide outcomes from both distance and velocity: dismiss if dragged past 40% of the height or flicked faster than ~800 pt/s." },
        { title: 'Cross back to JS sparingly', body: "Only call back into React for meaningful events (dismissed, page changed) using runOnJS / scheduling on the RN runtime. Never set React state on every frame." },
        { title: 'Respect reduced motion', body: "Honour the OS \"Reduce Motion\" setting: shorten or replace large movements with fades. Haptics on commit points (snap, dismiss) make gestures feel precise." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Where each step runs', body: 'The JS thread is only told about the result.', flow: ['touch (UI thread)', 'Gesture Handler recogniser (native)', 'onUpdate worklet → shared value (UI thread)', 'animated style applied this frame', 'onEnd: spring / dismiss decision', 'runOnJS(onDismiss) → React state'] },
        { kind: 'tip', title: 'Profile on real devices', body: 'The simulator runs on a desktop CPU. Use the performance monitor (JS and UI frame rates) on a mid-range Android phone in release mode: if UI fps stays at 60/120 while JS fps drops, your gestures are correctly on the UI thread.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'ui_thread_frames.ts',
          explanation: 'Runnable TypeScript frame simulation at 120 Hz: a drag rendered by the JS thread drops frames during a 50 ms JS burst while a UI-thread worklet keeps every frame; a damped spring integrator settles at its target; and the dismiss decision combines distance and velocity. All asserted.',
          code: raw`//  120 Hz FRAMES (8.33 ms each) DURING A 50 ms JS BURST
//
//   frame:      1  2  3  4  5  6  7  8  9 10 11 12
//   JS thread:  .  .  [######## busy ########]  .  .
//   JS-driven:  ok ok -- -- -- -- -- -- ok ok ok ok    (6 frames dropped)
//   UI worklet: ok ok ok ok ok ok ok ok ok ok ok ok    (finger tracked every frame)
//
//   touch --> [UI thread: gesture worklet] --> frame                        (never waits for JS)
//   touch --> [JS thread: setState] --> [render] --> [UI thread] --> frame  (stalls while JS is busy)
import assert from 'node:assert/strict';

const FRAME = 1000 / 120;
const busyFrom = 2 * FRAME, busyTo = busyFrom + 50;              // JS parses a big response
function renderedFrames(driver: 'js' | 'ui', frames = 12) {
  let rendered = 0;
  for (let f = 0; f < frames; f++) {
    const t = f * FRAME;
    const jsFree = t < busyFrom || t >= busyTo;
    if (driver === 'ui' || jsFree) rendered++;                    // worklets don't need the JS thread
  }
  return rendered;
}
assert.equal(12 - renderedFrames('js'), 6);                      // ceil(50 / 8.33) = 6 dropped frames
assert.equal(renderedFrames('ui'), 12);

// damped spring (semi-implicit Euler at 120 Hz): x'' = -k(x - target) - c x'
function spring(from: number, to: number, velocity: number, k = 170, c = 26) {
  let x = from, v = velocity, steps = 0;
  const dt = 1 / 120;
  while ((Math.abs(x - to) > 0.5 || Math.abs(v) > 0.5) && steps < 1000) {
    v += (-k * (x - to) - c * v) * dt;
    x += v * dt;
    steps++;
  }
  return { x, steps };
}
const back = spring(300, 0, 0);
assert.ok(Math.abs(back.x) <= 0.5 && back.steps < 120);          // settles in under a second
const flick = spring(300, 0, 2000);                                // released while moving down fast
assert.ok(flick.steps > back.steps);                               // has to overcome the momentum first

// dismiss decision for a bottom sheet of height 600
const shouldDismiss = (translationY: number, velocityY: number, height = 600) =>
  translationY > height * 0.4 || velocityY > 800;
assert.deepEqual([[300, 0], [100, 1200], [100, 200], [250, 100]].map(([t, v]) => shouldDismiss(t, v)),
  [true, true, false, true]);
console.log('dropped frames JS vs UI:', 12 - renderedFrames('js'), 'vs', 12 - renderedFrames('ui'), '| spring steps', back.steps);`,
        },
        production: {
          language: 'tsx',
          filename: 'BottomSheet.tsx',
          explanation: 'Production React Native with Gesture Handler 2 and Reanimated: a swipe-to-dismiss bottom sheet whose drag, spring-back and dismissal animation all run in UI-thread worklets; JS is only notified once, after the dismiss animation finishes. Reduced-motion users get a short timing animation instead of a spring.',
          code: raw`import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';

export function BottomSheet({ children, onDismiss }: { children: ReactNode; onDismiss: () => void }) {
  const { height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const translateY = useSharedValue(0);               // lives on the UI thread
  const start = useSharedValue(0);

  const pan = Gesture.Pan()
    .onStart(() => { start.value = translateY.value; })
    .onUpdate((e) => {                                 // worklet: runs every frame on the UI thread
      translateY.value = Math.max(0, start.value + e.translationY);
    })
    .onEnd((e) => {
      const dismiss = translateY.value > height * 0.4 || e.velocityY > 800;
      if (dismiss) {
        translateY.value = withTiming(height, { duration: reduceMotion ? 120 : 220 }, (finished) => {
          if (finished) runOnJS(onDismiss)();          // the only hop back to the JS thread
        });
      } else {
        translateY.value = reduceMotion
          ? withTiming(0, { duration: 120 })
          : withSpring(0, { damping: 20, stiffness: 180, velocity: e.velocityY });   // continue the flick
      }
    });

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.sheet, style]} accessibilityViewIsModal>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 320,
           borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: '#111722', padding: 16 },
});`,
        },
        bug: {
          explanation:
            'Every touch move goes to the JavaScript thread, triggers a React state update and a re-render, and only then moves the view. Any JS work (a network response being parsed, a list re-rendering) stalls the drag for several frames. Drive the position from a shared value updated in a UI-thread gesture worklet.',
          buggy: {
            language: 'tsx',
            filename: 'Sheet.tsx',
            code: raw`// ❌ JS-thread gesture: setState on every move = dropped frames under load
export function Sheet({ children }: { children: React.ReactNode }) {
  const [y, setY] = useState(0);
  const responder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_e, g) => setY(Math.max(0, g.dy)),   // re-render per touch event
    onPanResponderRelease: () => setY(0),                     // no velocity, no spring
  })).current;
  return <View {...responder.panHandlers} style={{ transform: [{ translateY: y }] }}>{children}</View>;
}`,
          },
          fixed: {
            language: 'tsx',
            filename: 'Sheet.tsx',
            code: raw`// ✅ UI-thread worklet + shared value: no React render per frame
export function Sheet({ children }: { children: React.ReactNode }) {
  const y = useSharedValue(0);
  const pan = Gesture.Pan()
    .onUpdate((e) => { y.value = Math.max(0, e.translationY); })
    .onEnd((e) => { y.value = withSpring(0, { velocity: e.velocityY }); });
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <GestureDetector gesture={pan}><Animated.View style={style}>{children}</Animated.View></GestureDetector>;
}`,
          },
        },
      },
      takeaways: [
        'Gestures must not wait for the JS thread: at 120 Hz a 50 ms JS burst drops 6 frames.',
        'Gesture Handler + Reanimated worklets update shared values on the UI thread.',
        'Use springs seeded with release velocity; decide outcomes from distance and velocity.',
        'Cross back to JS only for meaningful events, and honour reduced motion.',
        'Practice drill: in Tab 1, make the JS burst 100 ms and predict the dropped frames at 60 Hz (6) and at 120 Hz (12).',
      ],
    },
  ],
};
