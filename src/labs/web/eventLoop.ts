/**
 * A tiny, deterministic event-loop simulator. Each preset is a small program
 * expressed as operations (with source line numbers). The engine "executes"
 * it once and records a snapshot after every meaningful step, so the UI can
 * play, pause, step forward/back and reset freely.
 *
 * Model (matches the HTML spec closely enough for teaching):
 *   1. The script itself runs as the first macrotask.
 *   2. After any task, the microtask queue is drained completely (including
 *      microtasks queued while draining).
 *   3. Due timers move from Web APIs to the macrotask queue; resolved fetches
 *      resolve a promise, so their continuation goes to the MICROtask queue.
 *   4. The loop picks ONE macrotask, runs it, drains microtasks, repeat.
 */

export type Op =
  | { k: 'log'; line: number; text: string }
  | { k: 'note'; line: number; text: string }
  | { k: 'timeout'; line: number; delay: number; label: string; body: Op[] }
  | { k: 'then'; line: number; label: string; body: Op[]; next?: ThenLink }
  | { k: 'microtask'; line: number; label: string; body: Op[] }
  | { k: 'call'; line: number; name: string; body: Op[] }
  | { k: 'awaitFetch'; line: number; fn: string; url: string; delay: number; rest: Op[] }
  | { k: 'awaitValue'; line: number; fn: string; rest: Op[] };

export interface ThenLink {
  line: number;
  label: string;
  body: Op[];
  next?: ThenLink;
}

export type Phase = 'script' | 'microtasks' | 'timers' | 'macrotask' | 'idle' | 'done';

export interface QueueItem {
  id: number;
  label: string;
}

export interface WebApiItem {
  id: number;
  label: string;
  kind: 'timer' | 'fetch';
  readyAt: number;
}

export interface Snapshot {
  line: number | null;
  note: string;
  phase: Phase;
  clock: number;
  stack: string[];
  webApis: WebApiItem[];
  micro: QueueItem[];
  macro: QueueItem[];
  console: string[];
  /** id of the queue item that just moved, for highlight animations */
  moved?: number;
}

interface Task {
  id: number;
  label: string;
  line: number;
  frame: string;
  body: Op[];
  next?: ThenLink;
}

interface PendingApi extends WebApiItem {
  /** timers → macrotask; fetch → microtask (promise resolution) */
  onDone: Task;
  target: 'macro' | 'micro';
}

export interface Preset {
  id: string;
  title: string;
  blurb: string;
  code: string;
  program: Op[];
  takeaway: string;
}

export function simulate(program: Op[]): Snapshot[] {
  const snaps: Snapshot[] = [];
  const stack: string[] = [];
  const consoleOut: string[] = [];
  let micro: Task[] = [];
  let macro: Task[] = [];
  let apis: PendingApi[] = [];
  let clock = 0;
  let phase: Phase = 'script';
  let nextId = 1;

  const snap = (line: number | null, note: string, moved?: number) =>
    snaps.push({
      line,
      note,
      phase,
      clock,
      stack: [...stack],
      webApis: apis.map(({ id, label, kind, readyAt }) => ({ id, label, kind, readyAt })),
      micro: micro.map(({ id, label }) => ({ id, label })),
      macro: macro.map(({ id, label }) => ({ id, label })),
      console: [...consoleOut],
      moved,
    });

  const queueThen = (link: ThenLink, why: string) => {
    const t: Task = { id: nextId++, label: link.label, line: link.line, frame: `${link.label} callback`, body: link.body, next: link.next };
    micro.push(t);
    snap(link.line, why, t.id);
  };

  /** Returns true if the current function frame was suspended by an await. */
  const run = (ops: Op[]): boolean => {
    for (const op of ops) {
      switch (op.k) {
        case 'log':
          consoleOut.push(op.text);
          snap(op.line, `console.log runs synchronously → prints "${op.text}"`);
          break;
        case 'note':
          snap(op.line, op.text);
          break;
        case 'timeout': {
          const t: PendingApi = {
            id: nextId++,
            label: `${op.label} (${op.delay}ms)`,
            kind: 'timer',
            readyAt: clock + op.delay,
            target: 'macro',
            onDone: { id: 0, label: `${op.label} callback`, line: op.line, frame: `${op.label} callback`, body: op.body },
          };
          apis.push(t);
          snap(op.line, `setTimeout hands a ${op.delay}ms timer to the browser (Web API). JavaScript does not wait for it.`, t.id);
          break;
        }
        case 'then':
          queueThen(
            { line: op.line, label: op.label, body: op.body, next: op.next },
            op.next
              ? 'Promise is already resolved → this .then callback goes straight to the MICROtask queue. The next .then waits for its promise.'
              : 'Promise is already resolved → .then callback queued as a MICROtask.',
          );
          break;
        case 'microtask': {
          const t: Task = { id: nextId++, label: op.label, line: op.line, frame: `${op.label} callback`, body: op.body };
          micro.push(t);
          snap(op.line, 'queueMicrotask → callback added to the MICROtask queue.', t.id);
          break;
        }
        case 'call': {
          stack.push(`${op.name}()`);
          snap(op.line, `${op.name}() is called → a new frame is pushed onto the call stack.`);
          const suspended = run(op.body);
          if (!suspended) {
            stack.pop();
            snap(op.line, `${op.name}() returns → its frame is popped.`);
          }
          break;
        }
        case 'awaitFetch': {
          const f: PendingApi = {
            id: nextId++,
            label: `fetch ${op.url}`,
            kind: 'fetch',
            readyAt: clock + op.delay,
            target: 'micro',
            onDone: { id: 0, label: `resume ${op.fn}()`, line: op.line, frame: `${op.fn}() (resumed)`, body: op.rest },
          };
          apis.push(f);
          snap(op.line, `fetch() starts a network request in the browser (~${op.delay}ms). \`await\` pauses ${op.fn}()…`, f.id);
          stack.pop();
          snap(op.line, `…so ${op.fn}() is suspended and its frame popped. The caller keeps running: nothing is blocked.`);
          return true;
        }
        case 'awaitValue': {
          const t: Task = { id: nextId++, label: `resume ${op.fn}()`, line: op.line, frame: `${op.fn}() (resumed)`, body: op.rest };
          micro.push(t);
          stack.pop();
          snap(op.line, `await on an already-resolved value still yields: the rest of ${op.fn}() is queued as a MICROtask.`, t.id);
          return true;
        }
      }
    }
    return false;
  };

  const runTask = (t: Task, kind: 'micro' | 'macro') => {
    stack.push(t.frame);
    snap(t.line, kind === 'micro' ? `Dequeue microtask "${t.label}" → its callback is pushed onto the stack.` : `The event loop picks ONE macrotask: "${t.label}".`, t.id);
    const suspended = run(t.body);
    if (!suspended) {
      stack.pop();
      snap(t.line, 'Callback finished → frame popped, call stack is empty again.');
    }
    if (t.next) queueThen(t.next, 'The previous .then callback returned, so its promise resolved → the next .then is queued as a MICROtask.');
  };

  // ---- 1. the script is the first macrotask
  stack.push('<script>');
  snap(null, 'The browser runs the whole script as the first macrotask. A global frame is pushed.');
  run(program);
  stack.pop();
  snap(null, 'Script finished → the call stack is empty. Now the event loop takes over.');

  // ---- 2. event loop
  for (let guard = 0; guard < 200; guard++) {
    if (micro.length) {
      phase = 'microtasks';
      snap(null, `Stack empty → drain the WHOLE microtask queue (${micro.length} waiting) before anything else.`);
      while (micro.length) {
        const t = micro[0];
        micro = micro.slice(1);
        runTask(t, 'micro');
      }
      snap(null, 'Microtask queue drained.');
    }

    // move due Web API work into queues; if nothing is due and nothing is queued, time passes
    phase = 'timers';
    let due = apis.filter((a) => a.readyAt <= clock);
    if (!due.length && !macro.length && apis.length) {
      phase = 'idle';
      clock = Math.min(...apis.map((a) => a.readyAt));
      snap(null, `Nothing to run: the event loop idles until the browser reports back… clock → ${clock}ms.`);
      phase = 'timers';
      due = apis.filter((a) => a.readyAt <= clock);
    }
    for (const a of due.sort((x, y) => x.readyAt - y.readyAt || x.id - y.id)) {
      apis = apis.filter((x) => x.id !== a.id);
      const t = { ...a.onDone, id: nextId++ };
      if (a.target === 'macro') {
        macro.push(t);
        snap(a.onDone.line, `Timer "${a.label}" is done → its callback joins the MACROtask queue.`, t.id);
      } else {
        micro.push(t);
        snap(a.onDone.line, `${a.label} resolved → the awaiting code continues as a MICROtask (promises always use the microtask queue).`, t.id);
      }
    }
    if (micro.length) continue;

    if (macro.length) {
      phase = 'macrotask';
      const t = macro[0];
      macro = macro.slice(1);
      runTask(t, 'macro');
      continue;
    }

    if (!apis.length) break;
  }
  phase = 'done';
  snap(null, 'All queues are empty. Program complete.');
  return snaps;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------
export const PRESETS: Preset[] = [
  {
    id: 'classic',
    title: 'Sync vs Promise vs setTimeout',
    blurb: 'The classic interview question. Which prints first: a resolved promise or a 0ms timeout?',
    code: `console.log('script start');

setTimeout(() => {
  console.log('setTimeout');
}, 0);

Promise.resolve()
  .then(() => {
    console.log('promise 1');
  })
  .then(() => {
    console.log('promise 2');
  });

console.log('script end');`,
    program: [
      { k: 'log', line: 1, text: 'script start' },
      { k: 'timeout', line: 3, delay: 0, label: 'timer', body: [{ k: 'log', line: 4, text: 'setTimeout' }] },
      {
        k: 'then',
        line: 8,
        label: '.then #1',
        body: [{ k: 'log', line: 9, text: 'promise 1' }],
        next: { line: 11, label: '.then #2', body: [{ k: 'log', line: 12, text: 'promise 2' }] },
      },
      { k: 'log', line: 15, text: 'script end' },
    ],
    takeaway: 'Microtasks (promises) always run before the next macrotask (timers), even a 0ms timer.',
  },
  {
    id: 'async-trap',
    title: 'Async/Await Trap',
    blurb: 'Does `await` block the program? Does a 0ms timeout beat a network response?',
    code: `async function loadUser() {
  console.log('fetching user...');
  const user = await fetch('/api/user'); // ~100ms
  console.log('got user: Ada');
}

console.log('start');
loadUser();
setTimeout(() => console.log('timeout 0ms'), 0);
Promise.resolve().then(() => console.log('microtask'));
console.log('end');`,
    program: [
      { k: 'note', line: 1, text: 'Function declaration: hoisted and defined, but nothing inside runs yet.' },
      { k: 'log', line: 7, text: 'start' },
      {
        k: 'call',
        line: 8,
        name: 'loadUser',
        body: [
          { k: 'log', line: 2, text: 'fetching user...' },
          { k: 'awaitFetch', line: 3, fn: 'loadUser', url: '/api/user', delay: 100, rest: [{ k: 'log', line: 4, text: 'got user: Ada' }] },
        ],
      },
      { k: 'timeout', line: 9, delay: 0, label: 'timer', body: [{ k: 'log', line: 9, text: 'timeout 0ms' }] },
      { k: 'then', line: 10, label: '.then', body: [{ k: 'log', line: 10, text: 'microtask' }] },
      { k: 'log', line: 11, text: 'end' },
    ],
    takeaway: '`await` only pauses its own async function. Calling it without `await` returns a pending promise and the caller races ahead.',
  },
  {
    id: 'chained',
    title: 'Chained Microtasks',
    blurb: 'Microtasks that queue more microtasks, and a timer scheduled from inside a microtask.',
    code: `setTimeout(() => console.log('timeout A'), 0);

queueMicrotask(() => {
  console.log('micro 1');
  queueMicrotask(() => console.log('micro 1.1'));
});

Promise.resolve().then(() => {
  console.log('micro 2');
  setTimeout(() => console.log('timeout B'), 0);
});

console.log('sync');`,
    program: [
      { k: 'timeout', line: 1, delay: 0, label: 'timer A', body: [{ k: 'log', line: 1, text: 'timeout A' }] },
      {
        k: 'microtask',
        line: 3,
        label: 'micro 1',
        body: [
          { k: 'log', line: 4, text: 'micro 1' },
          { k: 'microtask', line: 5, label: 'micro 1.1', body: [{ k: 'log', line: 5, text: 'micro 1.1' }] },
        ],
      },
      {
        k: 'then',
        line: 8,
        label: '.then',
        body: [
          { k: 'log', line: 9, text: 'micro 2' },
          { k: 'timeout', line: 10, delay: 0, label: 'timer B', body: [{ k: 'log', line: 10, text: 'timeout B' }] },
        ],
      },
      { k: 'log', line: 13, text: 'sync' },
    ],
    takeaway: 'Microtasks queued during the drain run in the same drain, so a microtask that keeps queuing microtasks can starve timers and rendering.',
  },
];
