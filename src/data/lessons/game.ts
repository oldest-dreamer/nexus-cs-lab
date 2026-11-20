import type { Track } from '../types';

export const gameTrack: Track = {
  id: 'game',
  title: 'Game Development',
  short: 'Game',
  tagline: 'Game loops, 2D physics, canvas rendering, pathfinding AI and shaders.',
  accent: 'crimson',
  icon: 'gamepad',
  modules: [
    {
      id: 'game-core',
      title: 'Game Loops & Rendering',
      level: 'Scratch',
      lessons: [
        {
          id: 'game-fixed-timestep',
          title: 'The Game Loop: Fixed Timestep & Interpolation',
          summary: 'Why games run physics at a fixed rate while rendering as fast as the screen allows.',
          difficulty: 'Scratch',
          minutes: 14,
          xp: 70,
          analogy:
            'Physics is a metronome ticking at exactly 60 beats per second. Rendering is a camera that takes photos whenever it can. If a photo falls between two ticks, you blend them so motion still looks smooth.',
          intuition: [
            { title: 'Every game is a loop', body: 'Read input → update the world → draw the world → repeat. In the browser, requestAnimationFrame calls you once per display refresh.' },
            { title: 'Frames are not equal', body: 'One frame might take 8 ms and the next 30 ms. If you move a player "5 pixels per frame", they run faster on a 144 Hz monitor than on a 60 Hz one.' },
            { title: 'Use an accumulator', body: 'Add the real elapsed time to an accumulator, then run physics in fixed steps of exactly dt (say 1/60 s) until the accumulator is used up.' },
            { title: 'Interpolate for smoothness', body: 'The leftover fraction (alpha = accumulator / dt) tells you how far you are between the last two physics states. Draw a blend of them.' },
            { title: 'Clamp the spiral of death', body: 'If a tab was in the background for 10 seconds, do not run 600 physics steps at once. Cap the frame time, for example at 250 ms.' },
          ],
          callouts: [
            {
              kind: 'architecture',
              title: 'Decoupled update and render',
              body: 'Physics is deterministic because dt never changes. Rendering stays smooth because it interpolates.',
              flow: ['rAF(now)', 'acc += frameTime', 'while acc ≥ dt: update(dt)', 'alpha = acc / dt', 'render(lerp(prev, curr, alpha))'],
            },
          ],
          code: {
            basic: {
              language: 'ts',
              filename: 'loop.ts',
              explanation: 'A minimal variable-timestep loop. Movement is scaled by real seconds, so speed is consistent across refresh rates.',
              code: `let last = performance.now();
let x = 0;
const SPEED = 120; // pixels per SECOND (not per frame)

function frame(now: number) {
  const dt = (now - last) / 1000; // seconds since last frame
  last = now;

  x += SPEED * dt;                // frame-rate independent
  draw(x);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);`,
            },
            production: {
              language: 'ts',
              filename: 'fixedLoop.ts',
              explanation: 'The classic "Fix Your Timestep" loop: deterministic physics, interpolated rendering, and a clamp against the spiral of death.',
              code: `type State = { x: number; vx: number };

const DT = 1 / 60;          // fixed physics step (s)
const MAX_FRAME = 0.25;     // clamp after tab-switch stalls

let prev: State = { x: 0, vx: 120 };
let curr: State = { ...prev };
let acc = 0;
let last = performance.now() / 1000;

function integrate(s: State, dt: number): State {
  return { x: s.x + s.vx * dt, vx: s.vx };
}

function loop(nowMs: number) {
  const now = nowMs / 1000;
  acc += Math.min(now - last, MAX_FRAME);
  last = now;

  while (acc >= DT) {
    prev = curr;
    curr = integrate(curr, DT);
    acc -= DT;
  }

  const alpha = acc / DT;
  const renderX = prev.x * (1 - alpha) + curr.x * alpha;
  render(renderX);

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);`,
            },
            bug: {
              explanation: 'Moving by a constant amount per frame ties gameplay speed to the monitor refresh rate: 2.4× faster at 144 Hz than at 60 Hz. Always multiply by elapsed time.',
              buggy: {
                language: 'ts',
                filename: 'player.ts',
                code: `// ❌ 2 px per frame: speed depends on the monitor
function update() {
  player.x += 2;
}`,
              },
              fixed: {
                language: 'ts',
                filename: 'player.ts',
                code: `// ✅ 120 px per second, on every monitor
const SPEED = 120;
function update(dt: number) {
  player.x += SPEED * dt;
}`,
              },
            },
          },
          takeaways: ['Scale all motion by dt.', 'Fixed physics steps give determinism.', 'Interpolate rendering; clamp huge frame times.'],
          labId: 'game-engine',
          labMode: 'physics',
        },
      ],
      planned: ['Canvas 2D Rendering & Sprite Batching', 'AABB Collision & Spatial Hashing', 'Verlet Integration & 2D Physics'],
    },
    {
      id: 'game-ai',
      title: 'Game AI & Pathfinding',
      level: 'Intermediate',
      lessons: [
        {
          id: 'game-astar',
          title: 'A* Pathfinding on a Grid',
          summary: 'How A* finds the shortest path by combining real cost so far with an optimistic guess.',
          difficulty: 'Intermediate',
          minutes: 20,
          xp: 110,
          analogy:
            'A* is a hiker with a compass. At every fork they pick the trail where "distance walked so far + straight-line distance still to go" is smallest.',
          intuition: [
            { title: 'g = cost so far', body: 'g(n) is the real cost of the best known route from the start to node n.' },
            { title: 'h = optimistic guess', body: 'h(n) estimates the remaining cost to the goal. On a 4-direction grid, Manhattan distance |dx| + |dy| is a good guess.' },
            { title: 'f = g + h', body: 'Always expand the open node with the lowest f. Dijkstra is A* with h = 0; greedy best-first is A* that ignores g.' },
            { title: 'Admissible heuristics guarantee the shortest path', body: 'If h never overestimates the true remaining cost, the first time you pop the goal you have found the optimal path.' },
            { title: 'Reconstruct by walking parents', body: 'Store cameFrom[n] whenever you find a better route. At the goal, follow parents back to the start.' },
          ],
          callouts: [
            {
              kind: 'architecture',
              title: 'A* main loop',
              body: 'Use a binary heap for the open set in production. A plain array scan is O(n) per pop.',
              flow: ['open = {start}', 'pop lowest f', 'goal? → rebuild path', 'relax neighbours (g + cost)', 'push improved'],
            },
            { kind: 'tip', title: 'Pick the heuristic for your movement', body: 'Manhattan for 4-way, Octile for 8-way, Euclidean for any-angle movement.' },
          ],
          code: {
            basic: {
              language: 'ts',
              filename: 'heuristic.ts',
              explanation: 'Admissible heuristics for grid movement.',
              code: `type P = { x: number; y: number };

export const manhattan = (a: P, b: P) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

// 8-direction movement, diagonal cost √2
export const octile = (a: P, b: P) => {
  const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
  return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
};`,
            },
            production: {
              language: 'ts',
              filename: 'astar.ts',
              explanation: 'A complete 4-way grid A*. Swap the array-based open set for a binary heap when grids get large.',
              code: `type P = { x: number; y: number };
const key = (p: P) => p.y * 10_000 + p.x;

export function astar(grid: number[][], start: P, goal: P): P[] | null {
  const h = (p: P) => Math.abs(p.x - goal.x) + Math.abs(p.y - goal.y);
  const open: P[] = [start];
  const g = new Map<number, number>([[key(start), 0]]);
  const f = new Map<number, number>([[key(start), h(start)]]);
  const cameFrom = new Map<number, P>();
  const closed = new Set<number>();

  while (open.length) {
    open.sort((a, b) => f.get(key(a))! - f.get(key(b))!);
    const cur = open.shift()!;
    if (cur.x === goal.x && cur.y === goal.y) {
      const path = [cur];
      let k = key(cur);
      while (cameFrom.has(k)) { const p = cameFrom.get(k)!; path.unshift(p); k = key(p); }
      return path;
    }
    closed.add(key(cur));

    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { x: cur.x + dx, y: cur.y + dy };
      if (grid[n.y]?.[n.x] !== 0 || closed.has(key(n))) continue; // wall/outside/done
      const tentative = g.get(key(cur))! + 1;
      if (tentative < (g.get(key(n)) ?? Infinity)) {
        cameFrom.set(key(n), cur);
        g.set(key(n), tentative);
        f.set(key(n), tentative + h(n));
        if (!open.some((o) => key(o) === key(n))) open.push(n);
      }
    }
  }
  return null; // unreachable
}`,
            },
            bug: {
              explanation:
                'Multiplying the heuristic makes it overestimate (inadmissible). A* gets faster but returns paths that are no longer the shortest. Keep h ≤ true cost, or knowingly use weighted A* when speed beats optimality.',
              buggy: {
                language: 'ts',
                filename: 'astar.ts',
                code: `// ❌ "Faster" A*: overestimates, so paths are no longer shortest
const h = (p: P) => 3 * (Math.abs(p.x - goal.x) + Math.abs(p.y - goal.y));`,
              },
              fixed: {
                language: 'ts',
                filename: 'astar.ts',
                code: `// ✅ Admissible: never overestimates on a 4-way, cost-1 grid
const h = (p: P) => Math.abs(p.x - goal.x) + Math.abs(p.y - goal.y);`,
              },
            },
          },
          takeaways: ['f = g + h.', 'Admissible h means an optimal path.', 'Use a heap for the open set at scale.'],
          labId: 'game-engine',
          labMode: 'astar',
        },
      ],
      planned: ['Steering Behaviours & Flocking', 'Behaviour Trees vs. State Machines', 'Navigation Meshes'],
    },
    {
      id: 'game-gpu',
      title: 'Shaders & the GPU',
      level: 'Advanced',
      lessons: [],
      planned: ['The GPU Pipeline: Vertex → Fragment', 'Writing Your First GLSL Fragment Shader', 'Signed Distance Fields & Post-Processing'],
    },
  ],
};
