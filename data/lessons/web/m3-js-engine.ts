import type { Module } from '../../types';

const raw = String.raw;

export const jsEngineModule: Module = {
  id: 'web-js-engine',
  title: 'JavaScript Engine Internals',
  level: 'Intermediate',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'web-scope-closures',
      title: 'Execution Contexts, Lexical Scope & Closures',
      summary: 'What the engine creates every time a function runs, how scope is decided by where code is written, and how closures keep variables alive (for better and for memory leaks).',
      difficulty: 'Intermediate',
      minutes: 22,
      xp: 110,
      analogy:
        "Every function call gets its own backpack (an execution context) containing its local variables and a note saying which backpack it was packed inside of (its outer scope). When code looks for a variable, it searches its own backpack, then the outer one, then the next, up to the global one. A closure is a function that walks away still holding its backpack: as long as the function exists, everything in that backpack stays alive.",
      intuition: [
        { title: 'Two phases per execution context', body: "Creation: the engine registers declarations: function declarations are fully hoisted, `var` is hoisted as `undefined`, `let`/`const`/`class` are hoisted but uninitialized (the temporal dead zone, so touching them throws a ReferenceError). Execution: the code runs line by line." },
        { title: 'Lexical scope is decided at write time', body: "A function's outer scope is where it was defined, not where it is called. That is why moving a function to another file can break variable access but calling it from somewhere else never changes what it sees." },
        { title: 'A closure is function + environment', body: "When a function is created, it keeps a reference to its surrounding scope. `makeCounter()` returns `increment`; each call of `makeCounter` creates a new scope, so two counters never share a count." },
        { title: 'var vs let in loops', body: "`var i` is one variable for the whole function: closures created in a loop all see its final value. `let i` creates a fresh binding per iteration, so each closure captures its own `i`. This one rule explains a famous interview question and many real bugs." },
        { title: 'Closures as private state', body: "Before `#private` class fields, closures were the way to hide state (the module pattern). They still power memoization, debouncing, `once()`, React hooks and middleware." },
        { title: 'Closures and memory', body: "Anything a live closure can reach cannot be garbage-collected. A long-lived cache, timer or event listener that captures a big object (or a detached DOM node) keeps it in memory forever. Clean up listeners and use `WeakMap` when keys are objects whose lifetime you don't own." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Scope chain lookup', body: 'Resolution walks outward through the environments captured at definition time.', flow: ['inner function environment', 'enclosing function environment', 'module scope', 'global scope', 'ReferenceError if not found'] },
        { kind: 'tip', title: 'Find leaks with heap snapshots', body: 'DevTools → Memory → take two heap snapshots before and after repeating an action, then compare. "Detached" DOM nodes retained by closures or Maps are the classic signature.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'closures_from_scratch.ts',
          explanation: 'Runnable TypeScript showing hoisting and the temporal dead zone, lexical (not dynamic) scope, independent closures from a factory, the var-vs-let loop difference, and memoize/once built from closures. Every output is asserted.',
          code: raw`//  SCOPE CHAIN FOR counterA()
//
//   [global]  makeCounter
//       ^
//   [makeCounter call #1]  count = 2      <-- counterA's closure
//   [makeCounter call #2]  count = 1      <-- counterB's closure (separate!)
import assert from 'node:assert/strict';

// 1) hoisting: function declarations are usable before the line they appear on
assert.equal(hoisted(), 'ready');
function hoisted() { return 'ready'; }

// temporal dead zone: let/const exist but are uninitialized until their line runs
function readTooEarly(): unknown {
  try { return early; } catch (e) { return (e as Error).name; }
}
assert.equal(readTooEarly(), 'ReferenceError');
let early = 1;
assert.equal(readTooEarly(), 1);

// 2) lexical scope: what a function sees depends on where it was WRITTEN
const label = 'module';
function whoAmI() { return label; }
function caller() { const label = 'caller'; void label; return whoAmI(); }
assert.equal(caller(), 'module');

// 3) each factory call creates a new environment
function makeCounter() {
  let count = 0;
  return { increment: () => ++count, peek: () => count };
}
const a = makeCounter(), b = makeCounter();
a.increment(); a.increment(); b.increment();
assert.deepEqual([a.peek(), b.peek()], [2, 1]);

// 4) var shares one binding across iterations; let creates one per iteration
const withVar: Array<() => number> = [];
for (var i = 0; i < 3; i++) withVar.push(() => i);
const withLet: Array<() => number> = [];
for (let j = 0; j < 3; j++) withLet.push(() => j);
assert.deepEqual(withVar.map((f) => f()), [3, 3, 3]);
assert.deepEqual(withLet.map((f) => f()), [0, 1, 2]);

// 5) practical closures: memoize and once
function memoize<A, R>(fn: (arg: A) => R) {
  const cache = new Map<A, R>();
  let calls = 0;
  const wrapped = (arg: A) => {
    if (!cache.has(arg)) { calls++; cache.set(arg, fn(arg)); }
    return cache.get(arg)!;
  };
  return { wrapped, calls: () => calls };
}
const slowSquare = memoize((n: number) => n * n);
[4, 4, 5, 4].forEach((n) => slowSquare.wrapped(n));
assert.equal(slowSquare.calls(), 2);

function once<T>(fn: () => T) {
  let done = false, value: T | undefined;
  return () => { if (!done) { done = true; value = fn(); } return value as T; };
}
let inits = 0;
const init = once(() => ++inits);
init(); init(); init();
assert.equal(inits, 1);
console.log('counters', a.peek(), b.peek(), '| var loop', withVar.map((f) => f()), '| let loop', withLet.map((f) => f()));`,
        },
        production: {
          language: 'ts',
          filename: 'closure-utilities.ts',
          explanation: 'Production closure utilities: a debounce that exposes cancel/flush, a bounded LRU memoizer (so the cache cannot grow forever), and a per-element metadata store using WeakMap so removed DOM nodes can be garbage-collected.',
          code: raw`// 1) debounce: the timer id lives in the closure; callers can cancel or flush
export function debounce<A extends unknown[]>(fn: (...args: A) => void, waitMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: A | undefined;
  const debounced = (...args: A) => {
    lastArgs = args;
    clearTimeout(timer);
    timer = setTimeout(() => { timer = undefined; fn(...args); }, waitMs);
  };
  debounced.cancel = () => { clearTimeout(timer); timer = undefined; };
  debounced.flush = () => { if (timer && lastArgs) { debounced.cancel(); fn(...lastArgs); } };
  return debounced;
}

// 2) memoize with an LRU bound: a closure-held cache must never be unbounded
export function memoizeLRU<K, V>(fn: (key: K) => V, max = 500) {
  const cache = new Map<K, V>();                     // Map keeps insertion order
  return (key: K): V => {
    if (cache.has(key)) {
      const v = cache.get(key)!;
      cache.delete(key); cache.set(key, v);           // mark as most recently used
      return v;
    }
    const v = fn(key);
    cache.set(key, v);
    if (cache.size > max) cache.delete(cache.keys().next().value as K);   // evict the oldest
    return v;
  };
}

// 3) metadata keyed by DOM nodes: WeakMap does not keep removed nodes alive
const tooltipState = new WeakMap<Element, { shownAt: number; text: string }>();
export function attachTooltip(el: Element, text: string, signal: AbortSignal) {
  tooltipState.set(el, { shownAt: 0, text });
  el.addEventListener('mouseenter', () => {
    const s = tooltipState.get(el);
    if (s) s.shownAt = performance.now();
  }, { signal });                                     // abort() removes the listener (and its closure)
}

// usage
const search = debounce((q: string) => void fetch('/api/search?q=' + encodeURIComponent(q)), 250);
search('rea'); search('react');                       // only 'react' is fetched`,
        },
        bug: {
          explanation:
            'A module-level Map keyed by DOM elements keeps every element alive even after it is removed from the page (and everything its closures reference), so a long-lived single-page app leaks memory on every route change. A WeakMap holds keys weakly, and removing listeners with an AbortSignal releases the closures.',
          buggy: {
            language: 'ts',
            filename: 'row-tracker.ts',
            code: raw`// ❌ Detached rows (and their data) can never be garbage-collected
const rowData = new Map<HTMLElement, BigRowPayload>();

export function trackRow(row: HTMLElement, payload: BigRowPayload) {
  rowData.set(row, payload);
  row.addEventListener('click', () => openDetails(rowData.get(row)!));   // never removed
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'row-tracker.ts',
            code: raw`// ✅ Weakly held keys + listeners removed when the view unmounts
const rowData = new WeakMap<HTMLElement, BigRowPayload>();

export function trackRow(row: HTMLElement, payload: BigRowPayload, signal: AbortSignal) {
  rowData.set(row, payload);
  row.addEventListener('click', () => openDetails(rowData.get(row)!), { signal });
}
// view teardown: controller.abort() removes every listener registered with its signal`,
          },
        },
      },
      takeaways: [
        'Each call creates an execution context; declarations are hoisted, let/const sit in the TDZ until initialized.',
        'Scope is lexical: decided by where code is written, not where it is called.',
        'A closure keeps its defining environment alive; var shares one loop binding, let creates one per iteration.',
        'Bound closure-held caches and use WeakMap + AbortSignal to avoid leaks.',
        'Practice drill: predict the output of for (var k = 0; k < 3; k++) setTimeout(() => console.log(k)) (3, 3, 3), then change var to let (0, 1, 2) and run both in Node.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'web-prototypes-this',
      title: 'Prototypes, Classes & the Four Rules of this',
      summary: 'How property lookup walks the prototype chain, what class really compiles to, and how to predict this in every call style (and stop losing it in callbacks).',
      difficulty: 'Intermediate',
      minutes: 20,
      xp: 110,
      analogy:
        "A prototype chain is asking for help up a chain of mentors: if you don't know how to do something, you ask your mentor, who asks theirs, until someone knows or nobody does. `this` is the word \"me\" in a sentence: its meaning depends on who is speaking at the moment, not who wrote the sentence. Arrow functions are quotations: they keep the \"me\" of whoever wrote them.",
      intuition: [
        { title: 'Lookup walks the chain', body: "Reading `obj.x` checks `obj`'s own properties, then `Object.getPrototypeOf(obj)`, then its prototype, up to `Object.prototype` and finally `null`. Writing `obj.x = 1` always creates an own property (shadowing), it never modifies the prototype." },
        { title: 'Classes are syntax over prototypes', body: "`class Dog extends Animal` sets `Dog.prototype`'s prototype to `Animal.prototype`. Methods live once on the prototype and are shared by all instances; instance fields (including arrow-function fields) are created per instance." },
        { title: 'Rule 1–2: default and implicit binding', body: "A plain call `f()` gets `this = undefined` in strict mode (modules and classes are always strict). A method call `obj.f()` sets `this = obj`, decided at the call site." },
        { title: 'Rule 3–4: explicit and new', body: "`f.call(x)`, `f.apply(x)` and `f.bind(x)` set `this` explicitly (bind permanently). `new F()` creates a fresh object whose prototype is `F.prototype` and binds `this` to it." },
        { title: 'Arrow functions have no `this`', body: "Arrows capture `this` lexically from where they are defined. Perfect for callbacks inside methods; wrong as object methods that need the caller's object." },
        { title: 'Losing `this`', body: "`const f = obj.method; f()` or `button.addEventListener('click', obj.method)` detaches the method from its object, so `this` is `undefined` (or the element). Use an arrow wrapper, `bind`, or an arrow class field." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Prototype chain of a class instance', body: 'Shared methods live on prototypes; instance data lives on the object itself.', flow: ['rex (own: name)', 'Dog.prototype (bark)', 'Animal.prototype (eat)', 'Object.prototype (toString, hasOwnProperty)', 'null'] },
        { kind: 'security', title: 'Prototype pollution', body: 'Deep-merging untrusted JSON can write to `__proto__` and add properties to every object in the process. Reject `__proto__`, `constructor` and `prototype` keys, or use `Object.create(null)` / `Map` for dictionaries.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'prototypes_and_this.ts',
          explanation: 'Runnable TypeScript: manual prototype linking vs class syntax, shadowing on write, all four this-binding rules plus arrow functions, and the detached-method failure. Every result is asserted (TypeScript\'s explicit `this` parameters keep it type-safe).',
          code: raw`//  PROTOTYPE CHAIN
//
//   +--------+     +---------------+     +------------------+     +------------------+
//   | rex    | --> | Dog.prototype | --> | Animal.prototype | --> | Object.prototype | --> null
//   | name   |     | bark()        |     | eat()            |     | toString()       |
//   +--------+     +---------------+     +------------------+     +------------------+
import assert from 'node:assert/strict';

// 1) manual prototypes (what classes do under the hood)
const animalProto = { eat(this: { name: string }) { return this.name + ' eats'; } };
const dogProto = Object.create(animalProto) as typeof animalProto & { bark(this: { name: string }): string };
dogProto.bark = function (this: { name: string }) { return this.name + ' barks'; };
const rex = Object.create(dogProto) as typeof dogProto & { name: string };
rex.name = 'Rex';
assert.equal(rex.eat(), 'Rex eats');                         // found two links up
assert.ok(!Object.hasOwn(rex, 'eat') && Object.getPrototypeOf(Object.getPrototypeOf(rex)) === animalProto);

// 2) class syntax builds the same structure
class Animal { constructor(public name: string) {} eat() { return this.name + ' eats'; } }
class Dog extends Animal { bark() { return this.name + ' barks'; } }
const fido = new Dog('Fido');
assert.equal(Object.getPrototypeOf(Dog.prototype), Animal.prototype);
assert.equal(fido.bark === new Dog('x').bark, true);         // one shared method on the prototype

// shadowing: writes create own properties, the prototype is untouched
const base = { greeting: 'hi' };
const child = Object.create(base) as { greeting: string };
child.greeting = 'hello';
assert.deepEqual([child.greeting, base.greeting], ['hello', 'hi']);

// 3) the four binding rules (+ arrows)
function whoIsThis(this: unknown) { return this; }
const obj = { tag: 'obj', who: whoIsThis };
assert.equal(whoIsThis(), undefined);                        // default (strict mode)
assert.equal(obj.who(), obj);                                // implicit: object before the dot
const other = { tag: 'other' };
assert.equal(whoIsThis.call(other), other);                  // explicit
const bound = whoIsThis.bind(other);
assert.equal(bound.call(obj), other);                        // bind wins over call
class Box { self: Box; constructor() { this.self = this; } }
const box = new Box();
assert.equal(box.self, box);                                 // new binding

class Timer {
  ticks = 0;
  tickMethod() { this.ticks++; }
  tickArrow = () => { this.ticks++; };                        // per-instance, this captured lexically
}
const t = new Timer();
const detachedMethod = t.tickMethod;
assert.throws(() => detachedMethod(), TypeError);            // this is undefined: "Cannot read properties"
const detachedArrow = t.tickArrow;
detachedArrow(); detachedArrow();
assert.equal(t.ticks, 2);
console.log(rex.eat(), '|', fido.bark(), '| arrow field ticks =', t.ticks);`,
        },
        production: {
          language: 'ts',
          filename: 'event-bus.ts',
          explanation: 'Production TypeScript: a class using #private fields, arrow-field handlers that are safe to pass as callbacks, prototype methods for shared behaviour, and a prototype-pollution-safe merge for untrusted configuration.',
          code: raw`type Handler<T> = (payload: T) => void;

export class EventBus<Events extends Record<string, unknown>> {
  #handlers = new Map<keyof Events, Set<Handler<any>>>();   // truly private (not just TS-private)

  on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void {
    const set = this.#handlers.get(event) ?? new Set();
    set.add(handler);
    this.#handlers.set(event, set);
    return () => set.delete(handler);                        // unsubscribe closure
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    for (const h of this.#handlers.get(event) ?? []) h(payload);
  }
}

export class CartWidget {
  #count = 0;
  constructor(private bus: EventBus<{ added: { sku: string } }>, private el: HTMLElement) {
    this.bus.on('added', this.onAdded);                      // safe: arrow field keeps this
    el.querySelector('button')?.addEventListener('click', this.onClick);
  }
  onAdded = (_e: { sku: string }) => { this.#count++; this.render(); };
  onClick = () => this.bus.emit('added', { sku: this.el.dataset.sku ?? 'unknown' });
  render() { this.el.dataset.count = String(this.#count); }  // prototype method: shared
}

// Safe merge of untrusted JSON (e.g. a user-supplied settings blob)
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
export function safeMerge(target: Record<string, unknown>, src: Record<string, unknown>) {
  for (const [k, v] of Object.entries(src)) {
    if (FORBIDDEN.has(k)) continue;                          // blocks prototype pollution
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const next = (Object.hasOwn(target, k) ? target[k] : Object.create(null)) as Record<string, unknown>;
      target[k] = safeMerge(next, v as Record<string, unknown>);
    } else {
      target[k] = v;
    }
  }
  return target;
}`,
        },
        bug: {
          explanation:
            'Passing obj.method as a callback detaches it from obj, so when the timer (or event listener) calls it, `this` is undefined in class code and the method crashes with "Cannot read properties of undefined". Wrap it in an arrow, bind it once, or declare the handler as an arrow class field.',
          buggy: {
            language: 'ts',
            filename: 'poller.ts',
            code: raw`// ❌ this is undefined when setInterval calls the detached method
class Poller {
  attempts = 0;
  poll() { this.attempts++; /* fetch status ... */ }
  start() { setInterval(this.poll, 5000); }       // TypeError every 5 seconds
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'poller.ts',
            code: raw`// ✅ Arrow class field: this is captured per instance
class Poller {
  attempts = 0;
  poll = () => { this.attempts++; /* fetch status ... */ };
  start() { return setInterval(this.poll, 5000); }  // or: setInterval(() => this.poll(), 5000)
}`,
          },
        },
      },
      takeaways: [
        'Property reads walk the prototype chain; writes create own properties.',
        'class is syntax over prototypes: methods are shared, fields are per instance.',
        'this is decided at the call site: default (undefined), implicit (obj.f()), explicit (call/apply/bind), new.',
        'Arrows capture this lexically; use arrow fields or bind for callbacks. Guard merges against __proto__.',
        'Practice drill: predict the result of const { eat } = fido; eat() (TypeError: this is undefined), then fix it two different ways.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'web-event-loop',
      title: 'The Event Loop: Call Stack, Microtasks vs Macrotasks & async/await Errors',
      summary: 'Predict the exact order of synchronous code, Promise callbacks, await continuations and timers, and handle async errors so none of them disappear.',
      difficulty: 'Intermediate',
      minutes: 25,
      xp: 130,
      analogy:
        "The JavaScript thread is a single chef. Orders being cooked right now are the call stack. Timers and network calls are handed to kitchen assistants (Web APIs) who ring a bell when ready. Promise callbacks are VIP tickets (microtasks): after every dish, the chef serves every VIP ticket, including any new ones that arrive meanwhile, before taking the next regular order (a macrotask) from the queue. A chef who never stops serving VIPs never gets to the regular customers.",
      intuition: [
        { title: 'One thread, one call stack', body: "Synchronous code runs to completion. While a function runs, nothing else on that thread can: no click handler, no rendering, no timer callback." },
        { title: 'Web APIs do the waiting', body: "`setTimeout`, `fetch` and DOM events are handled by the browser (or libuv in Node). When the wait ends, the callback is placed in a queue; it never interrupts running code." },
        { title: 'Microtasks drain completely', body: "`.then` callbacks, `queueMicrotask` and the continuation after `await` are microtasks. After each task (and after the initial script), the engine runs microtasks until the queue is empty, including microtasks queued by microtasks." },
        { title: 'Then one macrotask, then maybe render', body: "The loop: take one macrotask (timer, I/O, event) → drain all microtasks → render if a frame is due → repeat. So `setTimeout(fn, 0)` always runs after every Promise callback queued before it." },
        { title: 'await splits a function', body: "Code before the first `await` runs synchronously when the async function is called. Everything after `await` is scheduled as a microtask once the awaited value settles. An async function always returns a Promise." },
        { title: 'Async errors travel through Promises', body: "A throw inside an async function rejects its Promise. `try/catch` catches it only if you `await` inside the `try`. A Promise that is never awaited or given a `.catch` becomes an unhandled rejection (Node crashes by default). `Promise.all` rejects on the first failure; `Promise.allSettled` waits for all." },
      ],
      callouts: [
        { kind: 'architecture', title: 'One turn of the event loop', body: 'Microtasks always run before the next macrotask and before rendering.', flow: ['run one macrotask (or the script)', 'drain ALL microtasks', 'render (if a frame is due)', 'next macrotask'] },
        { kind: 'tip', title: 'Use the lab', body: 'The JS Event Loop lab below opens in Event Loop mode. Run the "Sync vs Promise vs setTimeout" preset and predict the console before pressing Play, then try "Async/Await Trap" and "Chained Microtasks" and step backwards through any move you got wrong.' },
        { kind: 'warning', title: 'Microtask starvation', body: 'A microtask that keeps queueing microtasks (for example a recursive .then loop) blocks timers and rendering forever: the page freezes even though nothing is "synchronous".' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'event_loop_order.ts',
          explanation: 'Runnable TypeScript using the real event loop (no simulation): timers, Promise chains, queueMicrotask, await continuations and a microtask queued inside a timer, with the exact console order asserted. Then async error propagation: try/catch with await, a missing await, and Promise.all vs allSettled.',
          code: raw`//  ORDER OF EXECUTION
//
//   +-------------------+  drain ALL  +--------------------+  one per turn  +-------------------+
//   | call stack        | ----------> | microtask queue    | -------------> | macrotask queue   |
//   +-------------------+             +--------------------+                +-------------------+
//   script start                      then 1                                timeout 1
//   async body (sync part)            queueMicrotask                        timeout 2 -> micro inside timeout 2
//   script end                        after await, then 2                   timeout 3
import assert from 'node:assert/strict';

const log: string[] = [];
setTimeout(() => log.push('timeout 1'), 0);
setTimeout(() => { log.push('timeout 2'); Promise.resolve().then(() => log.push('micro inside timeout 2')); }, 0);
setTimeout(() => log.push('timeout 3'), 0);
Promise.resolve().then(() => log.push('then 1')).then(() => log.push('then 2'));
queueMicrotask(() => log.push('queueMicrotask'));
async function task() {
  log.push('async body (sync part)');      // runs immediately when task() is called
  await null;
  log.push('after await');                 // scheduled as a microtask
}
log.push('script start');
void task();
log.push('script end');

async function failing(): Promise<number> { throw new Error('boom'); }

async function errorDemos() {
  // 1) try/catch catches a rejected await
  let caught = '';
  try { await failing(); } catch (e) { caught = (e as Error).message; }
  assert.equal(caught, 'boom');

  // 2) without await, the rejection escapes the try block
  let caughtWithoutAwait = false;
  let escaped: Promise<number> | undefined;
  try { escaped = failing(); } catch { caughtWithoutAwait = true; }
  assert.equal(caughtWithoutAwait, false);
  await assert.rejects(escaped!, /boom/);  // handle it here so it is not "unhandled"

  // 3) Promise.all fails fast; allSettled reports every outcome
  const jobs = () => [Promise.resolve(1), failing(), Promise.resolve(3)];
  await assert.rejects(Promise.all(jobs()), /boom/);
  const settled = await Promise.allSettled(jobs());
  assert.deepEqual(settled.map((r) => r.status), ['fulfilled', 'rejected', 'fulfilled']);
}

setTimeout(() => {
  assert.deepEqual(log, [
    'script start', 'async body (sync part)', 'script end',
    'then 1', 'queueMicrotask', 'after await', 'then 2',
    'timeout 1', 'timeout 2', 'micro inside timeout 2', 'timeout 3',
  ]);
  errorDemos().then(() => console.log(log.join('\n')), (e) => { console.error(e); process.exit(1); });
}, 20);`,
        },
        production: {
          language: 'ts',
          filename: 'responsive-work.ts',
          explanation: 'Production patterns: splitting a long task into chunks that yield back to the event loop (so input and rendering stay responsive), and robust async orchestration with per-request timeouts via AbortSignal, bounded concurrency and allSettled-style reporting.',
          code: raw`// 1) Yield to the event loop between chunks so clicks and frames are not blocked
const yieldToMain = (): Promise<void> => {
  const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (s?.yield) return s.yield();                          // Chromium: continues with high priority
  return new Promise((resolve) => setTimeout(resolve, 0)); // fallback: a macrotask boundary
};

export async function processInChunks<T>(items: T[], work: (item: T) => void, budgetMs = 8) {
  let start = performance.now();
  for (const item of items) {
    work(item);
    if (performance.now() - start > budgetMs) {            // keep each task under ~50 ms total
      await yieldToMain();
      start = performance.now();
    }
  }
}

// 2) Fetch many resources with a timeout each and at most 4 in flight
export async function fetchAll(urls: string[], { timeoutMs = 5000, concurrency = 4 } = {}) {
  const results: Array<{ url: string; ok: boolean; data?: unknown; error?: string }> = [];
  const queue = [...urls];
  async function worker() {
    for (let url = queue.shift(); url; url = queue.shift()) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        results.push({ url, ok: true, data: await res.json() });
      } catch (e) {
        results.push({ url, ok: false, error: (e as Error).name === 'TimeoutError' ? 'timeout' : (e as Error).message });
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker)); // workers never reject: errors are recorded
  return results;
}

// 3) Last line of defence: report, don't silently swallow
window.addEventListener('unhandledrejection', (e) => reportError(e.reason));`,
        },
        bug: {
          explanation:
            'Array.prototype.forEach ignores the Promises returned by an async callback, so the function logs "done" (and returns) before any save has finished, and a failed save becomes an unhandled rejection that the surrounding try/catch never sees. Use for...of with await for sequential work, or Promise.all over map for parallel work.',
          buggy: {
            language: 'ts',
            filename: 'save-all.ts',
            code: raw`// ❌ forEach does not await: "done" prints first, errors escape the try/catch
export async function saveAll(drafts: Draft[]) {
  try {
    drafts.forEach(async (d) => {
      await api.save(d);                 // returned Promise is ignored by forEach
    });
    console.log('done');                 // runs before any save completes
  } catch (e) {
    showToast('Save failed');            // never reached for async failures
  }
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'save-all.ts',
            code: raw`// ✅ Await every Promise (parallel here; use for...of + await for sequential)
export async function saveAll(drafts: Draft[]) {
  const results = await Promise.allSettled(drafts.map((d) => api.save(d)));
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed) showToast(failed + ' of ' + drafts.length + ' drafts failed to save');
  else console.log('done');              // truly done
}`,
          },
        },
      },
      takeaways: [
        'Synchronous code runs to completion; Web APIs queue callbacks when their wait ends.',
        'After every macrotask, ALL microtasks run (Promises, queueMicrotask, await continuations) before the next task or render.',
        'Code before the first await runs synchronously; the rest is a microtask.',
        'Await inside try/catch, never use forEach with async callbacks, and choose all vs allSettled deliberately.',
        'Practice drill: in the lab\'s "Sync vs Promise vs setTimeout" preset, write the console order down before pressing Play; then predict where a queueMicrotask added inside the first timeout would print.',
      ],
      labId: 'web-internals',
      labMode: 'eventloop',
    },
  ],
};
