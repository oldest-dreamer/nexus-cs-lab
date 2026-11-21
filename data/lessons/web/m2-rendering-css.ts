import type { Module } from '../../types';

const raw = String.raw;

export const renderingCssModule: Module = {
  id: 'web-rendering-css',
  title: 'Browser Rendering & Modern CSS Layout',
  level: 'Beginner',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'web-critical-rendering-path',
      title: 'The Critical Rendering Path: DOM → CSSOM → Layout → Paint → Composite',
      summary: 'How the browser turns bytes of HTML and CSS into pixels, which steps each kind of change re-runs, and how to avoid forced synchronous layouts.',
      difficulty: 'Beginner',
      minutes: 20,
      xp: 90,
      analogy:
        "Rendering a page is like building a house from two documents. The HTML is the list of rooms and furniture (the DOM); the CSS is the interior designer's style sheet (the CSSOM). The builder combines them into a plan of what is actually visible (the render tree), measures every room (layout), paints the walls (paint), and finally stacks pre-painted panels into place (composite). Moving a pre-painted panel is cheap; changing the size of a room means re-measuring the whole floor.",
      intuition: [
        { title: 'Bytes → tokens → DOM', body: "The HTML parser streams through the document, building the DOM tree node by node. A plain `<script>` pauses parsing until it downloads and runs, because it might call `document.write`. `defer` and `type=\"module\"` scripts download in parallel and run after parsing." },
        { title: 'CSS → CSSOM, and it blocks rendering', body: "Stylesheets are parsed into the CSSOM. The browser will not paint until the CSS in `<head>` has loaded, to avoid a flash of unstyled content. That makes CSS render-blocking: keep critical CSS small and served early." },
        { title: 'Render tree: only what is visible', body: "DOM + CSSOM are combined into the render tree. Nodes with `display: none` and everything in `<head>` are left out; `visibility: hidden` nodes stay in (they still take up space)." },
        { title: 'Layout, paint, composite', body: "Layout (reflow) computes the size and position of every box. Paint fills in pixels (text, colors, borders, shadows) into layers. Composite stacks the layers on the GPU. Changing `width` re-runs all three; changing `color` re-runs paint + composite; changing `transform` or `opacity` usually re-runs only composite." },
        { title: 'Forced synchronous layout', body: "Reading geometry (`offsetHeight`, `getBoundingClientRect()`) after a style write forces the browser to run layout immediately. Doing read → write → read → write in a loop triggers one layout per iteration: layout thrashing." },
        { title: 'Batch reads, then writes', body: "Read everything first, then write everything (ideally inside `requestAnimationFrame`). Animate with `transform`/`opacity`. For long off-screen lists, `content-visibility: auto` skips rendering work until the content is near the viewport." },
      ],
      callouts: [
        { kind: 'architecture', title: 'The pixel pipeline', body: 'Each frame, the browser runs only the stages a change invalidated.', flow: ['HTML → DOM', 'CSS → CSSOM', 'Render tree', 'Layout', 'Paint', 'Composite'] },
        { kind: 'tip', title: 'Measure it', body: 'Chrome DevTools → Performance: purple "Layout" blocks with a red corner and a "Forced reflow" warning point at layout thrashing; the Rendering panel\'s "Paint flashing" shows what repaints.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'pixel_pipeline_from_scratch.ts',
          explanation: 'Runnable TypeScript model of the pipeline: render-tree construction from a DOM + computed styles (display:none removed, visibility:hidden kept), a table of which stages each CSS property invalidates, and a layout-thrashing counter comparing interleaved and batched DOM access. All results are asserted.',
          code: raw`//  PIXEL PIPELINE
//
//   DOM ----+
//           +--> Render tree --> Layout --> Paint --> Composite
//   CSSOM --+        (display:none removed)   ^         ^
//                                  width/top -+         |
//                                  color ------- paint -+
//                                  transform/opacity -- composite only
import assert from 'node:assert/strict';

type Node = { tag: string; style: Record<string, string>; children: Node[] };
const dom: Node = {
  tag: 'html', style: {}, children: [
    { tag: 'head', style: { display: 'none' }, children: [{ tag: 'style', style: {}, children: [] }] },
    { tag: 'body', style: {}, children: [
      { tag: 'h1', style: {}, children: [] },
      { tag: 'p', style: { display: 'none' }, children: [] },
      { tag: 'div', style: { visibility: 'hidden' }, children: [] },
    ] },
  ],
};

function renderTree(n: Node): string[] {
  if (n.style.display === 'none') return [];                 // whole subtree skipped
  return [n.tag, ...n.children.flatMap(renderTree)];
}
assert.deepEqual(renderTree(dom), ['html', 'body', 'h1', 'div']);   // hidden div still takes space

const STAGES: Record<string, Array<'layout' | 'paint' | 'composite'>> = {
  width: ['layout', 'paint', 'composite'],
  top: ['layout', 'paint', 'composite'],
  color: ['paint', 'composite'],
  'box-shadow': ['paint', 'composite'],
  transform: ['composite'],
  opacity: ['composite'],
};
assert.equal(STAGES.transform.length, 1);
assert.ok(STAGES.width.includes('layout') && !STAGES.color.includes('layout'));

// Layout-thrashing model: a read after a write forces a synchronous layout
class FakeDocument {
  layouts = 0;
  private dirty = false;
  read() { if (this.dirty) { this.layouts++; this.dirty = false; } return 100; }
  write() { this.dirty = true; }
}
const interleaved = new FakeDocument();
for (let i = 0; i < 50; i++) { interleaved.read(); interleaved.write(); }
const batched = new FakeDocument();
const heights = Array.from({ length: 50 }, () => batched.read());    // all reads first
heights.forEach(() => batched.write());                               // then all writes
assert.equal(interleaved.layouts, 49);                                // one forced layout per iteration
assert.equal(batched.layouts, 0);                                     // layout happens once, at frame time
console.log('render tree:', renderTree(dom).join(' > '), '| forced layouts:', interleaved.layouts, 'vs', batched.layouts);`,
        },
        production: {
          language: 'html',
          filename: 'index.html',
          explanation: 'Production <head> for a fast first paint: inlined critical CSS, early connection and font hints, the full stylesheet loaded without blocking, deferred module scripts, and content-visibility for long below-the-fold sections.',
          code: raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />

  <!-- 1. Critical CSS inlined: first paint needs no extra round trip -->
  <style>
    body { margin: 0; font-family: Inter, system-ui, sans-serif; background: #07090e; color: #e6edf5; }
    .hero { min-height: 60vh; display: grid; place-items: center; }
    /* 5. skip rendering work for long sections until they approach the viewport */
    .comments { content-visibility: auto; contain-intrinsic-size: auto 1200px; }
  </style>

  <!-- 2. Start connections / downloads the parser would discover late -->
  <link rel="preconnect" href="https://cdn.example.com" crossorigin />
  <link rel="preload" href="/fonts/inter-var.woff2" as="font" type="font/woff2" crossorigin />

  <!-- 3. Full stylesheet without blocking first paint -->
  <link rel="stylesheet" href="/assets/main.css" media="print" onload="this.media='all'" />
  <noscript><link rel="stylesheet" href="/assets/main.css" /></noscript>

  <!-- 4. Module scripts are deferred: they never block HTML parsing -->
  <script type="module" src="/assets/main.js"></script>
</head>
<body>
  <section class="hero"><h1>Ship faster pixels</h1></section>
  <section class="comments"><!-- hundreds of comments --></section>
</body>
</html>`,
        },
        bug: {
          explanation:
            'Reading offsetHeight right after writing a style forces the browser to run layout synchronously, once per iteration, so 200 cards cost ~200 layouts in a single frame. Batch all reads first, then apply all writes inside requestAnimationFrame so layout runs once.',
          buggy: {
            language: 'ts',
            filename: 'resize-cards.ts',
            code: raw`// ❌ Layout thrashing: read -> write -> read -> write ...
const cards = document.querySelectorAll<HTMLElement>('.card');
for (const card of cards) {
  const h = card.offsetHeight;             // READ: forces layout (previous write made it dirty)
  card.style.height = h * 1.5 + 'px';      // WRITE: invalidates layout again
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'resize-cards.ts',
            code: raw`// ✅ All reads, then all writes in the next frame: one layout
const cards = [...document.querySelectorAll<HTMLElement>('.card')];
const heights = cards.map((card) => card.offsetHeight);     // one layout for all reads

requestAnimationFrame(() => {
  cards.forEach((card, i) => {
    card.style.height = heights[i] * 1.5 + 'px';            // writes only
  });
});`,
          },
        },
      },
      takeaways: [
        'DOM + CSSOM → render tree → layout → paint → composite.',
        'CSS blocks rendering; classic scripts block parsing; use defer or type="module".',
        'transform/opacity changes skip layout and paint; width/top changes re-run everything.',
        'Never interleave DOM reads and writes in a loop: batch reads, then writes.',
        'Practice drill: record a Performance profile of the buggy Tab 3 code on a page with 200 .card elements, find the "Forced reflow" warnings, then apply the fix and compare.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'web-flexbox-grid',
      title: 'Flexbox vs CSS Grid Mental Models & Container Queries',
      summary: 'How the flex algorithm actually distributes space, how Grid sizes fr tracks, when to choose each, and how container queries make components responsive to their own width.',
      difficulty: 'Beginner',
      minutes: 22,
      xp: 90,
      analogy:
        "Flexbox is a row of people on a bench: they start at their preferred size and then share leftover space (or squeeze in) according to how greedy (flex-grow) or flexible (flex-shrink) each one is. Grid is a seating chart drawn before anyone arrives: rows and columns first, then each item is placed in a cell. Container queries let a piece of furniture rearrange itself depending on the size of the room it is in, not the size of the whole house.",
      intuition: [
        { title: 'Flexbox is one-dimensional and content-out', body: "Items start at `flex-basis` (or their content size). The container then hands out positive free space in proportion to `flex-grow`, or takes away overflow in proportion to `flex-shrink × flex-basis`. Use it for toolbars, nav bars and anything that flows in one direction." },
        { title: 'Grow math', body: "Container 600px, bases [100, 200, 100], grow [1, 2, 1]: free space = 200, one share = 50, final widths [150, 300, 150]." },
        { title: 'Shrink math is weighted by size', body: "Container 300px, bases [200, 200, 200], shrink [1, 1, 2]: overflow = 300, weights = shrink × basis = [200, 200, 400] (sum 800), so the items lose [75, 75, 150] and end at [125, 125, 50]. Big items shrink more in absolute terms." },
        { title: 'Grid is two-dimensional and layout-in', body: "Define tracks, then place items. `grid-template-columns: 200px 1fr 2fr` with a 20px gap in a 1000px container: fixed parts take 200 + 2 × 20 = 240, the remaining 760 splits 1 : 2 → 253.33px and 506.67px. Named areas make page layouts readable." },
        { title: 'The min-width: auto trap', body: "Flex and grid items default to a minimum size of their content (`min-width: auto`). A long URL or code block therefore refuses to shrink and overflows. `min-width: 0` (or `minmax(0, 1fr)` in grid) lets it shrink and wrap." },
        { title: 'Container queries', body: "`container-type: inline-size` on a wrapper lets children use `@container (min-width: 480px) { … }`. The same card can be stacked in a narrow sidebar and side-by-side in the main column, with no knowledge of the viewport." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Choosing a layout tool', body: 'Most pages use Grid for the skeleton and Flexbox inside components.', flow: ['page skeleton → Grid (template areas)', 'card collections → Grid (auto-fill, minmax)', 'toolbars / nav / button rows → Flexbox', 'component variants → container queries'] },
        { kind: 'tip', title: 'Inspect the algorithm', body: 'DevTools shows flex and grid overlays: click the "flex"/"grid" badge next to an element to see tracks, gaps, free space and each item\'s final size.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'flex_and_grid_from_scratch.ts',
          explanation: 'Runnable TypeScript implementing the core of the flex grow/shrink algorithm and fr-track sizing, plus a container-query resolver. The widths from the intuition steps are asserted exactly.',
          code: raw`//  FLEX: distribute free space         GRID: 200px 1fr 2fr, gap 20, width 1000
//
//  |[100][200][100]......200 free|    |200|gap|  1fr = 253.33 |gap|    2fr = 506.67     |
//   grow 1   2   1  -> +50 +100 +50    fixed: 200 + 2*20 = 240   flexible: 760 split 1:2
import assert from 'node:assert/strict';

type FlexItem = { basis: number; grow: number; shrink: number };

function flexLayout(container: number, items: FlexItem[]): number[] {
  const used = items.reduce((s, i) => s + i.basis, 0);
  const free = container - used;
  if (free >= 0) {                                              // positive free space: grow
    const totalGrow = items.reduce((s, i) => s + i.grow, 0);
    return items.map((i) => (totalGrow ? i.basis + (free * i.grow) / totalGrow : i.basis));
  }
  const weights = items.map((i) => i.shrink * i.basis);         // shrink is weighted by basis
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  return items.map((i, k) => i.basis + (free * weights[k]) / totalWeight);
}

assert.deepEqual(flexLayout(600, [
  { basis: 100, grow: 1, shrink: 1 }, { basis: 200, grow: 2, shrink: 1 }, { basis: 100, grow: 1, shrink: 1 },
]), [150, 300, 150]);
assert.deepEqual(flexLayout(300, [
  { basis: 200, grow: 0, shrink: 1 }, { basis: 200, grow: 0, shrink: 1 }, { basis: 200, grow: 0, shrink: 2 },
]), [125, 125, 50]);

function gridColumns(container: number, template: string, gap: number): number[] {
  const tracks = template.split(/\s+/);
  const fixed = tracks.filter((t) => t.endsWith('px')).reduce((s, t) => s + parseFloat(t), 0);
  const frTotal = tracks.filter((t) => t.endsWith('fr')).reduce((s, t) => s + parseFloat(t), 0);
  const free = container - fixed - gap * (tracks.length - 1);
  return tracks.map((t) => (t.endsWith('px') ? parseFloat(t) : Math.round((free * parseFloat(t) / frTotal) * 100) / 100));
}
assert.deepEqual(gridColumns(1000, '200px 1fr 2fr', 20), [200, 253.33, 506.67]);
assert.deepEqual(gridColumns(940, '1fr 1fr 1fr', 20), [300, 300, 300]);

// container queries: the component reacts to its container, not the viewport
const cardLayout = (containerWidth: number) =>
  containerWidth >= 480 ? 'horizontal' : containerWidth >= 280 ? 'stacked' : 'compact';
assert.deepEqual([240, 320, 720].map(cardLayout), ['compact', 'stacked', 'horizontal']);
console.log('flex grow', flexLayout(600, [{ basis: 100, grow: 1, shrink: 1 }, { basis: 200, grow: 2, shrink: 1 }, { basis: 100, grow: 1, shrink: 1 }]),
  '| grid', gridColumns(1000, '200px 1fr 2fr', 20));`,
        },
        production: {
          language: 'css',
          filename: 'layout.css',
          explanation: 'Production CSS: a Grid page skeleton with named areas that collapses on small screens, a responsive card grid with auto-fill and minmax, a Flexbox toolbar, and a container-queried card component.',
          code: raw`/* 1) Page skeleton: Grid with named areas */
.app {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);       /* minmax(0, ...) lets content shrink */
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    "nav  header"
    "nav  main"
    "nav  footer";
  min-height: 100dvh;
}
.app > nav    { grid-area: nav; }
.app > header { grid-area: header; }
.app > main   { grid-area: main; }
.app > footer { grid-area: footer; }

@media (max-width: 768px) {
  .app {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: "header" "main" "footer";
  }
  .app > nav { display: none; }                      /* replaced by a drawer */
}

/* 2) Card collection: as many 260px+ columns as fit, no media queries */
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1rem;
}

/* 3) Toolbar: one-dimensional, Flexbox */
.toolbar { display: flex; align-items: center; gap: 0.5rem; }
.toolbar .spacer { flex: 1; }                        /* pushes the rest to the right */

/* 4) Component that adapts to the space it is given */
.card-wrap { container-type: inline-size; container-name: card; }
.card { display: grid; gap: 0.75rem; }
@container card (min-width: 480px) {
  .card { grid-template-columns: 160px minmax(0, 1fr); align-items: start; }
}`,
        },
        bug: {
          explanation:
            'Flex items default to min-width: auto, i.e. they refuse to become narrower than their content. A long unbroken string (URL, hash, code) therefore pushes the item wider than the container and overflows the layout. Setting min-width: 0 lets the item shrink so text can wrap or truncate.',
          buggy: {
            language: 'css',
            filename: 'message.css',
            code: raw`/* ❌ The text column overflows when a message contains a long URL */
.message { display: flex; gap: 12px; }
.message .avatar { flex: 0 0 40px; }
.message .text { flex: 1; }                 /* min-width: auto = content width */`,
          },
          fixed: {
            language: 'css',
            filename: 'message.css',
            code: raw`/* ✅ Allow the flexible item to shrink below its content size */
.message { display: flex; gap: 12px; }
.message .avatar { flex: 0 0 40px; }
.message .text {
  flex: 1;
  min-width: 0;                             /* the actual fix */
  overflow-wrap: anywhere;                  /* break long URLs instead of overflowing */
}`,
          },
        },
      },
      takeaways: [
        'Flexbox: one dimension, content-out; grow shares free space, shrink is weighted by basis.',
        'Grid: two dimensions, layout-in; fr tracks split what remains after fixed tracks and gaps.',
        'min-width: auto causes overflow; use min-width: 0 or minmax(0, 1fr).',
        'Container queries make components respond to their container, not the viewport.',
        'Practice drill: compute flexLayout(500, bases [100, 100], grow [1, 3]) by hand ([175, 325]) and gridColumns(800, "1fr 3fr", 0) ([200, 600]), then confirm in Tab 1.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'web-tailwind-cls',
      title: 'Tailwind v4 CSS-First Theming & Preventing Layout Shift (CLS)',
      summary: 'Define a design system in CSS with Tailwind v4\'s @theme, support dark mode cleanly, and keep Cumulative Layout Shift near zero by reserving space for everything that loads late.',
      difficulty: 'Intermediate',
      minutes: 20,
      xp: 100,
      analogy:
        "Layout shift is someone sitting down in the cinema seat in front of you just as the film starts: everything you were looking at jumps. Reserving space is buying the seat in advance, so latecomers never move anyone. A CSS-first theme is the cinema's style guide printed on the wall: every usher (component) reads the same colors and spacing from one place.",
      intuition: [
        { title: 'Tailwind v4 is configured in CSS', body: "`@import \"tailwindcss\";` then `@theme { --color-brand-500: …; --font-display: …; }`. Each theme variable becomes both a utility (`bg-brand-500`, `font-display`) and a real CSS variable you can use anywhere. No JavaScript config file is required." },
        { title: 'Variants and custom utilities', body: "`@custom-variant dark (&:where(.dark, .dark *));` makes `dark:` follow a class you control. `@utility` defines reusable utilities, and `@apply` still works inside them. Keep design decisions (tokens) in `@theme` and component structure in markup." },
        { title: 'What CLS measures', body: "Each unexpected layout shift scores `impact fraction × distance fraction`. A 1000×200 banner pushed down 100px in a 1000×800 viewport affects a 1000×300 region (0.375 of the viewport) and moves 100/1000 of the largest viewport dimension (0.1): score 0.0375." },
        { title: 'Session windows', body: "Shifts are grouped into windows (at most 5 s long, gaps under 1 s). CLS is the largest window's total. Good is ≤ 0.1, poor is > 0.25. Shifts within 500 ms of a user input do not count." },
        { title: 'The usual culprits', body: "Images and embeds without dimensions, ads/banners injected above content, web fonts swapping metrics, and skeletons that are a different size from the real content." },
        { title: 'Reserve space', body: "Always set `width`/`height` (or `aspect-ratio`) on media, give dynamic slots a `min-height`, insert late content below the fold or in an overlay, and use `font-display` with metric-matched fallbacks (`size-adjust`)." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Tailwind v4 build pipeline', body: 'Tokens live in CSS; the compiler scans your source for class names and emits only what is used.', flow: ['app.css: @import + @theme tokens', 'scan .tsx for class names', 'generate utilities + CSS variables', 'Vite bundles one CSS file', 'components read var(--color-*)'] },
        { kind: 'tip', title: 'Find the shifting element', body: 'DevTools → Performance → "Layout shifts" track, or the web-vitals library\'s attribution build, reports the exact element and shift value in real user sessions.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'cls_from_scratch.ts',
          explanation: 'Runnable TypeScript implementation of the CLS formula: impact fraction from the union of before/after rectangles, distance fraction relative to the largest viewport dimension, session windows (1 s gap, 5 s cap), and exclusion of shifts right after user input.',
          code: raw`//  ONE LAYOUT SHIFT (viewport 1000 x 800)
//
//   y=100 +----------------+        y=100 +----------------+  <- impact region
//         | banner (200px) |   ->         |   (empty)      |     = union of old + new
//   y=300 +----------------+        y=200 |  banner moved  |     = 1000 x 300
//                                   y=400 +----------------+     impact 0.375, distance 0.1
import assert from 'node:assert/strict';

type Rect = { x: number; y: number; w: number; h: number };
const VIEW = { w: 1000, h: 800 };

function shiftScore(before: Rect, after: Rect): number {
  const top = Math.min(before.y, after.y), bottom = Math.max(before.y + before.h, after.y + after.h);
  const left = Math.min(before.x, after.x), right = Math.max(before.x + before.w, after.x + after.w);
  const impact = ((right - left) * (bottom - top)) / (VIEW.w * VIEW.h);
  const distance = Math.max(Math.abs(after.x - before.x), Math.abs(after.y - before.y)) / Math.max(VIEW.w, VIEW.h);
  return Math.round(impact * distance * 1e6) / 1e6;                // round away float noise
}

const s = shiftScore({ x: 0, y: 100, w: 1000, h: 200 }, { x: 0, y: 200, w: 1000, h: 200 });
assert.equal(s, 0.0375);

type Shift = { t: number; score: number; afterInput?: boolean };
function cls(shifts: Shift[]): number {
  let best = 0, windowStart = -Infinity, last = -Infinity, sum = 0;
  for (const sh of shifts.filter((x) => !x.afterInput)) {          // input-driven shifts are expected
    if (sh.t - last > 1000 || sh.t - windowStart > 5000) { windowStart = sh.t; sum = 0; }
    sum += sh.score; last = sh.t;
    best = Math.max(best, sum);
  }
  return Math.round(best * 1e4) / 1e4;
}

assert.equal(cls([{ t: 0, score: 0.05 }, { t: 400, score: 0.04 }, { t: 3000, score: 0.08 }]), 0.09);
assert.equal(cls([{ t: 0, score: 0.2, afterInput: true }, { t: 100, score: 0.03 }]), 0.03);
const rating = (v: number) => (v <= 0.1 ? 'good' : v <= 0.25 ? 'needs improvement' : 'poor');
assert.deepEqual([0.0375, 0.18, 0.3].map(rating), ['good', 'needs improvement', 'poor']);
console.log('single shift score', s, '| CLS', cls([{ t: 0, score: 0.05 }, { t: 400, score: 0.04 }, { t: 3000, score: 0.08 }]));`,
        },
        production: {
          language: 'css',
          filename: 'app.css',
          explanation: 'Production Tailwind v4 entry stylesheet: design tokens in @theme (they become utilities and CSS variables), a class-based dark variant, a custom utility, and base rules that reserve space for media and fonts to keep CLS near zero.',
          code: raw`@import "tailwindcss";

/* 1) Design tokens: each becomes a utility (bg-brand-500, font-display, ...) AND a CSS variable */
@theme {
  --color-brand-50:  oklch(0.97 0.02 250);
  --color-brand-500: oklch(0.62 0.19 255);
  --color-brand-700: oklch(0.47 0.17 260);
  --color-surface:   oklch(0.99 0 0);
  --font-display: "Inter Display", "Inter Fallback", ui-sans-serif, system-ui, sans-serif;
  --radius-card: 0.875rem;
  --breakpoint-3xl: 112rem;                 /* adds a 3xl: variant */
}

/* 2) Dark mode controlled by a .dark class on <html> (user toggle), not only the OS setting */
@custom-variant dark (&:where(.dark, .dark *));
.dark { --color-surface: oklch(0.18 0.01 260); }

/* 3) A reusable component-level utility */
@utility card {
  border-radius: var(--radius-card);
  background: var(--color-surface);
  padding: 1.25rem;
}

/* 4) CLS guards */
@layer base {
  img, video { max-width: 100%; height: auto; }      /* keeps the width/height attribute ratio */
  .ad-slot { min-height: 250px; }                    /* reserve the slot before the ad loads */
}

/* metric-matched fallback so the web-font swap does not move text */
@font-face {
  font-family: "Inter Fallback";
  src: local("Arial");
  size-adjust: 107%;
  ascent-override: 90%;
}`,
        },
        bug: {
          explanation:
            'An image with no dimensions has zero height until it loads, and a promo banner inserted above the article pushes everything down, both counted as layout shifts that can push CLS past 0.25. Give media intrinsic dimensions (or aspect-ratio) and reserve the banner slot with a fixed min-height.',
          buggy: {
            language: 'tsx',
            filename: 'Article.tsx',
            code: raw`// ❌ Content jumps twice: when the banner arrives and when the image loads
export function Article({ post, promo }: { post: Post; promo?: Promo }) {
  return (
    <article className="mx-auto max-w-2xl">
      {promo && <PromoBanner promo={promo} />}         {/* appears 800 ms later, above everything */}
      <img src={post.cover} alt="" className="w-full" />   {/* no size: 0px tall until loaded */}
      <h1 className="font-display text-4xl">{post.title}</h1>
    </article>
  );
}`,
          },
          fixed: {
            language: 'tsx',
            filename: 'Article.tsx',
            code: raw`// ✅ Space is reserved before anything loads
export function Article({ post, promo }: { post: Post; promo?: Promo }) {
  return (
    <article className="mx-auto max-w-2xl">
      <div className="min-h-[96px]">{promo && <PromoBanner promo={promo} />}</div>
      <img src={post.cover} alt="" width={1200} height={630}
           className="aspect-[1200/630] w-full rounded-card object-cover" />
      <h1 className="font-display text-4xl">{post.title}</h1>
    </article>
  );
}`,
          },
        },
      },
      takeaways: [
        'Tailwind v4 tokens live in CSS @theme and become both utilities and CSS variables.',
        'Use @custom-variant for class-based dark mode and @utility for reusable component styles.',
        'A layout shift scores impact fraction × distance fraction; CLS is the worst session window (good ≤ 0.1).',
        'Reserve space: width/height or aspect-ratio on media, min-height for late slots, metric-matched font fallbacks.',
        'Practice drill: compute the score for a 1000×100 element moving down 50px in a 1000×800 viewport (impact 150k/800k = 0.1875 × distance 0.05 = 0.009375) and verify it with shiftScore in Tab 1.',
      ],
    },
  ],
};
