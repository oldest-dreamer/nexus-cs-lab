import type { Track } from '../types';

export const webTrack: Track = {
  id: 'web',
  title: 'Web Development',
  short: 'Web',
  tagline: 'From how the browser paints pixels to designing systems that serve millions.',
  accent: 'cyan',
  icon: 'globe',
  modules: [
    {
      id: 'web-internals',
      title: 'Browser & JavaScript Internals',
      level: 'Scratch',
      lessons: [
        {
          id: 'web-critical-rendering-path',
          title: 'How the Browser Turns HTML into Pixels',
          summary: 'The Critical Rendering Path: parse → style → layout → paint → composite, and what blocks it.',
          difficulty: 'Scratch',
          minutes: 12,
          xp: 60,
          analogy:
            'A browser is a factory line. HTML is the blueprint, CSS is the paint spec, and JavaScript is a supervisor who can stop the whole line to change the blueprint.',
          intuition: [
            {
              title: 'HTML becomes a tree (the DOM)',
              body: 'The browser reads HTML top to bottom and turns every tag into a node in a tree called the DOM. Parent tags hold child tags, exactly like folders hold files.',
            },
            {
              title: 'CSS becomes a second tree (the CSSOM)',
              body: 'Every stylesheet is parsed into the CSSOM. The browser will not paint anything until it has it, because painting with half the styles would cause an ugly flash. That is why CSS is called render-blocking.',
            },
            {
              title: 'Combine them into the render tree',
              body: 'DOM + CSSOM = the render tree: only the things that will actually be visible, each with its final computed style. Elements with display:none are left out entirely.',
            },
            {
              title: 'Layout: where does everything go?',
              body: 'Layout (also called reflow) calculates the exact position and size of every box in pixels. Change one width and everything after it may need to be measured again.',
            },
            {
              title: 'Paint and composite',
              body: 'Paint fills in pixels (text, colors, borders). Composite stacks the painted layers on the GPU. Animating transform and opacity only touches this last step, which is why those animations stay smooth.',
            },
            {
              title: 'Scripts can pause everything',
              body: 'A plain <script> tag stops HTML parsing until it downloads and runs, because the script might change the page. Adding defer or type="module" lets parsing continue.',
            },
          ],
          callouts: [
            {
              kind: 'architecture',
              title: 'The Critical Rendering Path',
              body: 'Each stage feeds the next. Anything that forces an earlier stage to rerun costs more than anything that only touches a later stage.',
              flow: ['HTML → DOM', 'CSS → CSSOM', 'Render Tree', 'Layout', 'Paint', 'Composite (GPU)'],
            },
            {
              kind: 'tip',
              title: 'Cheap vs. expensive changes',
              body: 'Changing width/top/left reruns Layout → Paint → Composite. Changing color reruns Paint → Composite. Changing transform/opacity usually reruns only Composite.',
            },
          ],
          code: {
            basic: {
              language: 'html',
              filename: 'index.html',
              explanation: 'CSS in <head> blocks first paint (on purpose). The deferred script downloads in parallel and runs after parsing finishes.',
              code: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <!-- Render-blocking: the browser waits for this before first paint -->
    <link rel="stylesheet" href="/styles.css" />
    <!-- defer: download now, run after the DOM is fully parsed -->
    <script src="/app.js" defer></script>
  </head>
  <body>
    <h1>Hello, render tree</h1>
    <p class="hidden">display:none → not in the render tree</p>
  </body>
</html>`,
            },
            production: {
              language: 'html',
              filename: 'index.html',
              explanation:
                'Inline the tiny critical CSS for above-the-fold content, preload the hero font, and load the rest without blocking. Module scripts are deferred by default.',
              code: `<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />

  <!-- 1. Critical CSS inlined: first paint needs no extra round-trip -->
  <style>
    body { margin: 0; font-family: Inter, system-ui, sans-serif; background: #07090e; color: #e2e8f0; }
    .hero { min-height: 60vh; display: grid; place-items: center; }
  </style>

  <!-- 2. Tell the browser early about assets it will need -->
  <link rel="preconnect" href="https://cdn.example.com" crossorigin />
  <link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossorigin />

  <!-- 3. Full stylesheet without blocking render -->
  <link rel="stylesheet" href="/main.css" media="print" onload="this.media='all'" />
  <noscript><link rel="stylesheet" href="/main.css" /></noscript>

  <!-- 4. ES modules are deferred automatically -->
  <script type="module" src="/src/main.js"></script>
</head>`,
            },
            bug: {
              explanation:
                'Layout thrashing: reading offsetHeight right after a write forces the browser to run Layout synchronously, once per loop iteration. Batch all reads, then all writes, so Layout runs once.',
              buggy: {
                language: 'js',
                filename: 'resize-cards.js',
                code: `// ❌ Forces a synchronous layout on EVERY iteration
const cards = document.querySelectorAll('.card');
for (const card of cards) {
  const h = card.offsetHeight;        // READ  → browser must run layout now
  card.style.height = h * 1.5 + 'px'; // WRITE → invalidates layout again
}`,
              },
              fixed: {
                language: 'js',
                filename: 'resize-cards.js',
                code: `// ✅ Read everything first, then write everything in one frame
const cards = [...document.querySelectorAll('.card')];
const heights = cards.map((card) => card.offsetHeight); // one layout

requestAnimationFrame(() => {
  cards.forEach((card, i) => {
    card.style.height = heights[i] * 1.5 + 'px';        // writes only
  });
});`,
              },
            },
          },
          takeaways: [
            'DOM + CSSOM → render tree → layout → paint → composite.',
            'CSS blocks rendering; plain scripts block parsing. Use defer or type="module".',
            'Animate transform and opacity; avoid interleaving DOM reads and writes.',
          ],
        },
        {
          id: 'web-event-loop',
          title: 'The Event Loop: Call Stack, Microtasks & Macrotasks',
          summary: 'Why setTimeout(fn, 0) runs after a resolved Promise, and how async code really executes.',
          difficulty: 'Beginner',
          minutes: 15,
          xp: 80,
          analogy:
            'JavaScript is a single chef with one stove (the call stack). Orders wait in two queues: VIP orders (microtasks, i.e. Promises) are always cooked before regular orders (macrotasks, i.e. timers and clicks).',
          intuition: [
            { title: 'One thread, one stack', body: 'JavaScript runs one function at a time on the call stack. While something runs, nothing else on that thread can, not even a click handler.' },
            { title: 'The browser does the waiting', body: 'setTimeout, fetch, and event listeners hand the waiting off to the browser. When the wait is over, the browser places a callback in a queue. It does not interrupt your code.' },
            { title: 'Microtasks jump the line', body: 'Promise callbacks (.then, await continuations) go into the microtask queue. After every task, the engine empties the entire microtask queue before doing anything else.' },
            { title: 'Then one macrotask, then render', body: 'The loop is: run one task → drain all microtasks → maybe render a frame → pick the next task. That is why heavy synchronous work freezes the UI.' },
          ],
          callouts: [
            {
              kind: 'architecture',
              title: 'One turn of the event loop',
              body: 'Rendering only gets a chance between tasks, after the microtask queue is empty.',
              flow: ['Run 1 macrotask', 'Drain ALL microtasks', 'Render (if due)', 'Next macrotask'],
            },
            {
              kind: 'warning',
              title: 'Microtask starvation',
              body: 'A Promise chain that keeps queuing new microtasks forever will block rendering just like an infinite while-loop.',
            },
          ],
          code: {
            basic: {
              language: 'js',
              filename: 'order.js',
              explanation: 'Output: 1, 4, 3, 2. Synchronous first, then microtasks (Promise), then macrotasks (setTimeout).',
              code: `console.log('1: sync');

setTimeout(() => console.log('2: macrotask (timer)'), 0);

Promise.resolve().then(() => console.log('3: microtask (promise)'));

console.log('4: sync');

// → 1: sync
// → 4: sync
// → 3: microtask (promise)
// → 2: macrotask (timer)`,
            },
            production: {
              language: 'ts',
              filename: 'chunked.ts',
              explanation: 'Break long CPU work into chunks and yield back to the event loop so input and rendering stay responsive.',
              code: `/** Yield to the event loop so the browser can paint and handle input. */
const yieldToMain = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function processInChunks<T>(
  items: T[],
  work: (item: T) => void,
  budgetMs = 8,
): Promise<void> {
  let start = performance.now();
  for (const item of items) {
    work(item);
    if (performance.now() - start > budgetMs) {
      await yieldToMain();        // let a frame render
      start = performance.now();
    }
  }
}`,
            },
            bug: {
              explanation:
                'Array.forEach ignores the Promises returned by an async callback, so "done" logs before any save finishes and errors become unhandled rejections. Use for...of with await (sequential) or Promise.all (parallel).',
              buggy: {
                language: 'ts',
                filename: 'save.ts',
                code: `// ❌ forEach does not wait for async callbacks
async function saveAll(users: User[]) {
  users.forEach(async (u) => {
    await api.save(u);
  });
  console.log('done'); // runs immediately, before any save completes
}`,
              },
              fixed: {
                language: 'ts',
                filename: 'save.ts',
                code: `// ✅ Parallel, and actually awaited
async function saveAll(users: User[]) {
  const results = await Promise.allSettled(users.map((u) => api.save(u)));
  const failed = results.filter((r) => r.status === 'rejected');
  console.log(\`done: \${users.length - failed.length} ok, \${failed.length} failed\`);
}`,
              },
            },
          },
          takeaways: [
            'Sync code → all microtasks → one macrotask → repeat.',
            'Long synchronous work blocks rendering; chunk it and yield.',
            'Never pass an async callback to forEach.',
          ],
          labId: 'web-internals',
          labMode: 'eventloop',
        },
      ],
      planned: ['CSS Layout Engines: Flexbox vs. Grid', 'Closures, Scope & Memory Leaks', 'HTTP/2, Caching Headers & CDNs'],
    },
    {
      id: 'web-typescript-react',
      title: 'TypeScript & React',
      level: 'Intermediate',
      lessons: [],
      planned: ['TypeScript Generics & Narrowing', 'React Reconciliation & Keys', 'Hooks Rules & Stale Closures', 'Server Components & Streaming'],
    },
    {
      id: 'web-backend-systems',
      title: 'Node.js & System Design',
      level: 'Advanced',
      lessons: [],
      planned: ['Node.js Streams & Backpressure', 'REST vs. GraphQL vs. tRPC', 'Caching Layers & Invalidation', 'Designing a URL Shortener at Scale'],
    },
  ],
};
