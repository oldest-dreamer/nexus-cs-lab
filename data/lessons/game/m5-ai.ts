import type { Module } from '../../types';

const raw = String.raw;

export const aiModule: Module = {
  id: 'game-ai',
  title: 'Pathfinding & Game AI',
  level: 'Intermediate',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'game-graph-search-bfs-dijkstra',
      title: 'Graphs, Grids & Navmeshes: BFS, Dijkstra and Flow Fields',
      summary: 'Pathfinding starts with representing the world as a graph (tile grids, waypoints or navigation meshes), then searching it: BFS for fewest steps, Dijkstra for cheapest cost with terrain weights, and flow fields to steer hundreds of units at once.',
      difficulty: 'Intermediate',
      minutes: 24,
      xp: 120,
      labId: 'game-engine',
      labMode: 'astar',
      analogy:
        "Pour water at the goal and watch it spread. BFS spreads one tile per tick in every direction, so the first time it reaches you is the fewest number of steps. Dijkstra spreads like water through different terrain: it flows fast over road and slowly through mud, so the first time it reaches you is the cheapest route. A flow field is the map of which way the water came from, so any unit, anywhere, can just walk downhill to the goal.",
      intuition: [
        { title: 'The world as a graph', body: "Nodes are places, edges are moves with a cost. A tile grid makes every walkable tile a node with 4 or 8 neighbours. Waypoint graphs place hand-picked nodes. Navigation meshes (navmeshes) use convex polygons covering the walkable floor: far fewer nodes than a grid, and smooth any-angle paths after a funnel pass." },
        { title: 'BFS: fewest steps', body: "Breadth-first search uses a FIFO queue and visits nodes in rings of equal step count. It is optimal only when every move costs the same. Mark a node visited when you enqueue it, not when you dequeue it, or the queue fills with duplicates." },
        { title: 'Dijkstra: cheapest cost', body: "With different terrain costs (mud = 5, road = 1), use a priority queue keyed by the cost so far, g. Always expand the cheapest unexpanded node; when the goal is popped its g is optimal (with non-negative costs)." },
        { title: 'BFS gives the wrong answer on weighted maps', body: "In Tab 1 the straight route through mud is only 8 steps but costs 20; the detour around the wall is 12 steps and costs 12. BFS returns the 8-step route, Dijkstra the 12-cost route." },
        { title: 'Flow fields for crowds', body: "Run Dijkstra once from the goal over the whole map to get the cost to the goal from every tile (an integration field), then point each tile at its cheapest neighbour. Hundreds of RTS units share one search instead of running hundreds." },
        { title: 'Complexity', body: "BFS is O(V + E). Dijkstra with a binary heap is O((V + E) log V). Next chapter: A* adds a heuristic to aim the search at the goal and expand far fewer nodes." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Choosing a search', body: 'Match the algorithm to the question you are asking.', flow: ['uniform cost, one agent → BFS', 'terrain weights, one agent → Dijkstra', 'one goal, many agents → Dijkstra flow field from the goal', 'one goal, one agent, big map → A* (next chapter)'] },
        { kind: 'tip', title: 'Use the lab', body: 'Paint walls in the A* Pathfinding lab and compare how many cells are expanded. Dijkstra is A* with h = 0: notice how it floods evenly in every direction.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'bfs_dijkstra_from_scratch.ts',
          explanation: 'Runnable TypeScript on a small map with a mud strip: BFS returns the 8-step route through mud (cost 20), Dijkstra the 12-step detour (cost 12), enqueue-time visited marking keeps the BFS queue small, and a Dijkstra flow field from the goal lets any unit walk downhill to it. All asserted.',
          code: raw`//  MAP (4-way moves, cost of the tile you enter: '.' = 1, '~' = 5, '#' = wall)
//
//    S . . ~ ~ ~ . . G      BFS:      8 steps straight through mud -> cost 20
//    . # # # # # # # .      Dijkstra: around the wall, 12 steps    -> cost 12
//    . . . . . . . . .
//  ---- flow field: Dijkstra from G, every tile points to its cheapest neighbour ----
import assert from 'node:assert/strict';

const MAP = ['S..~~~..G', '.#######.', '.........'];
const W = MAP[0].length, H = MAP.length;
const at = (x: number, y: number) => MAP[y][x];
const cost = (x: number, y: number) => (at(x, y) === '~' ? 5 : 1);
const id = (x: number, y: number) => y * W + x;
const xy = (n: number) => [n % W, Math.floor(n / W)];
const neighbours = (n: number) => {
  const [x, y] = xy(n), out: number[] = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < W && ny < H && at(nx, ny) !== '#') out.push(id(nx, ny));
  }
  return out;
};
const S = id(0, 0), G = id(W - 1, 0);
function walk(parent: Int32Array, goal: number) { const p = [goal]; while (parent[p[0]] !== -1) p.unshift(parent[p[0]]); return p; }
const pathCost = (p: number[]) => p.slice(1).reduce((s, n) => s + cost(...(xy(n) as [number, number])), 0);

// BFS (mark visited on enqueue)
function bfs(markOnPush: boolean) {
  const parent = new Int32Array(W * H).fill(-1), seen = new Uint8Array(W * H), q = [S];
  let pushes = 1; if (markOnPush) seen[S] = 1;
  while (q.length) {
    const n = q.shift()!;
    if (!markOnPush) { if (seen[n]) continue; seen[n] = 1; }
    if (n === G) break;
    for (const m of neighbours(n)) if (!seen[m]) {
      if (markOnPush) seen[m] = 1;
      if (parent[m] === -1 && m !== S) parent[m] = n;
      q.push(m); pushes++;
    }
  }
  return { path: walk(parent, G), pushes };
}
const b = bfs(true);
assert.equal(b.path.length - 1, 8);
assert.equal(pathCost(b.path), 20);                       // fewest steps, but expensive
// enqueue-time vs dequeue-time marking on an open 20 x 20 field (full flood)
function floodPushes(markOnPush: boolean) {
  const N = 20, seen = new Uint8Array(N * N), q = [0]; let pushes = 1;
  if (markOnPush) seen[0] = 1;
  for (let head = 0; head < q.length; head++) {
    const n = q[head];
    if (!markOnPush) { if (seen[n]) continue; seen[n] = 1; }
    const x = n % N, y = Math.floor(n / N);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, m = ny * N + nx;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N || seen[m]) continue;
      if (markOnPush) seen[m] = 1;
      q.push(m); pushes++;
    }
  }
  return pushes;
}
const early = floodPushes(true), late = floodPushes(false);
assert.equal(early, 400);                                 // each tile enqueued exactly once
assert.ok(late > early * 1.5);                            // duplicates when marking late

// Dijkstra (simple array-scan priority queue; production uses a binary heap)
function dijkstra(from: number) {
  const g = new Float64Array(W * H).fill(Infinity), parent = new Int32Array(W * H).fill(-1), done = new Uint8Array(W * H);
  g[from] = 0;
  for (;;) {
    let n = -1;
    for (let i = 0; i < W * H; i++) if (!done[i] && g[i] < Infinity && (n < 0 || g[i] < g[n])) n = i;
    if (n < 0) break;
    done[n] = 1;
    for (const m of neighbours(n)) { const ng = g[n] + cost(...(xy(m) as [number, number])); if (ng < g[m]) { g[m] = ng; parent[m] = n; } }
  }
  return { g, parent };
}
const d = dijkstra(S), dPath = walk(d.parent, G);
assert.equal(d.g[G], 12);
assert.equal(dPath.length - 1, 12);                       // more steps, cheaper

// Flow field: cost-to-goal from every tile (edge cost = cost of the tile entered, so search reversed)
const toGoal = new Float64Array(W * H).fill(Infinity), fin = new Uint8Array(W * H);
toGoal[G] = 0;
for (;;) {
  let n = -1;
  for (let i = 0; i < W * H; i++) if (!fin[i] && toGoal[i] < Infinity && (n < 0 || toGoal[i] < toGoal[n])) n = i;
  if (n < 0) break;
  fin[n] = 1;
  for (const m of neighbours(n)) { const v = toGoal[n] + cost(...(xy(n) as [number, number])); if (v < toGoal[m]) toGoal[m] = v; }
}
assert.equal(toGoal[S], 12);
let unit = S, spent = 0, moves = 0;
while (unit !== G && moves < 50) {                          // every unit just walks downhill
  const next = neighbours(unit).reduce((best, m) => (toGoal[m] + cost(...(xy(m) as [number, number])) < toGoal[best] + cost(...(xy(best) as [number, number])) ? m : best));
  spent += cost(...(xy(next) as [number, number])); unit = next; moves++;
}
assert.deepEqual([unit, spent], [G, 12]);
console.log('BFS steps', b.path.length - 1, 'cost', pathCost(b.path), '| Dijkstra steps', dPath.length - 1, 'cost', d.g[G], '| flood pushes', early, 'vs', late, 'when marking late');`,
        },
        production: {
          language: 'ts',
          filename: 'flow_field.ts',
          explanation: 'Production engine pattern for RTS-style crowds: a Dijkstra integration field from the goal using a typed-array binary heap, then a direction field (one byte per tile, pointing at the cheapest neighbour). The field is recomputed only when the goal or the map changes; every unit samples it in O(1) per tick.',
          code: raw`const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];
export const NONE = 255;

export class FlowField {
  readonly integration: Float32Array;                    // cost to goal from each tile
  readonly direction: Uint8Array;                        // index into DX/DY, or NONE
  private heapNode: Int32Array; private heapKey: Float32Array; private heapSize = 0;

  constructor(readonly w: number, readonly h: number, readonly tileCost: Uint8Array /* 0 = wall */) {
    const n = w * h;
    this.integration = new Float32Array(n);
    this.direction = new Uint8Array(n);
    this.heapNode = new Int32Array(n * 4);              // lazy deletion: up to 4 pushes per node
    this.heapKey = new Float32Array(n * 4);
  }

  private push(node: number, key: number) {
    let i = this.heapSize++;
    const hn = this.heapNode, hk = this.heapKey;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hk[p] <= key) break;
      hn[i] = hn[p]; hk[i] = hk[p]; i = p;
    }
    hn[i] = node; hk[i] = key;
  }
  private pop(): number {
    const hn = this.heapNode, hk = this.heapKey, top = hn[0];
    const lastN = hn[--this.heapSize], lastK = hk[this.heapSize];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.heapSize) break;
      if (c + 1 < this.heapSize && hk[c + 1] < hk[c]) c++;
      if (hk[c] >= lastK) break;
      hn[i] = hn[c]; hk[i] = hk[c]; i = c;
    }
    hn[i] = lastN; hk[i] = lastK;
    return top;
  }

  build(goalX: number, goalY: number) {
    const { w, h, tileCost, integration, direction } = this;
    integration.fill(Infinity); direction.fill(NONE);
    const goal = goalY * w + goalX;
    integration[goal] = 0; this.heapSize = 0; this.push(goal, 0);
    while (this.heapSize > 0) {
      const n = this.pop(), x = n % w, y = (n / w) | 0, base = integration[n];
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k], ny = y + DY[k];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const m = ny * w + nx;
        if (tileCost[m] === 0) continue;
        const v = base + tileCost[n];                    // cost of stepping from m into n
        if (v < integration[m]) { integration[m] = v; this.push(m, v); }
      }
    }
    for (let n = 0; n < w * h; n++) {                   // point each tile downhill
      if (n === goal || integration[n] === Infinity) continue;
      const x = n % w, y = (n / w) | 0;
      let best = Infinity;
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k], ny = y + DY[k];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const m = ny * w + nx;
        if (tileCost[m] !== 0 && integration[m] < best) { best = integration[m]; direction[n] = k; }
      }
    }
  }

  // O(1) per unit per tick
  steer(x: number, y: number): [number, number] {
    const d = this.direction[y * this.w + x];
    return d === NONE ? [0, 0] : [DX[d], DY[d]];
  }
}`,
        },
        bug: {
          explanation:
            'Marking a tile visited only when it is dequeued lets the same tile be enqueued again by every neighbour that discovers it before it is processed. The answer is still correct, but the queue (and memory, and time) grows several times larger on open maps. Mark a tile visited (and record its parent) at the moment you enqueue it.',
          buggy: {
            language: 'ts',
            filename: 'bfs.ts',
            code: raw`// ❌ Visited set updated on dequeue: duplicates flood the queue
const queue = [start];
while (queue.length) {
  const n = queue.shift()!;
  if (visited.has(n)) continue;
  visited.add(n);
  for (const m of neighbours(n)) if (!visited.has(m)) { parent.set(m, n); queue.push(m); }
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'bfs.ts',
            code: raw`// ✅ Mark when enqueued: every tile enters the queue at most once
const queue = [start]; visited.add(start);
for (let head = 0; head < queue.length; head++) {      // index instead of shift(): O(1) dequeue
  const n = queue[head];
  for (const m of neighbours(n)) if (!visited.has(m)) { visited.add(m); parent.set(m, n); queue.push(m); }
}`,
          },
        },
      },
      takeaways: [
        'Represent the world as a graph: grids are simple, navmeshes are compact and give smooth paths.',
        'BFS finds the fewest steps only when every move costs the same; mark visited on enqueue.',
        'Dijkstra finds the cheapest path with non-negative weights using a priority queue.',
        'A Dijkstra flow field from the goal steers any number of units with one search.',
        'Practice drill: change the mud cost in Tab 1 from 5 to 2 and predict which route Dijkstra now picks (straight: 5 + 6 = 11 < 12).',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'game-astar',
      title: 'A* Pathfinding: f = g + h, Heuristics & Weighted A*',
      summary: 'A* aims Dijkstra at the goal with a heuristic. Choosing an admissible heuristic (Manhattan, Octile, Euclidean) keeps paths optimal while expanding far fewer nodes, and weighted A* trades a bounded amount of optimality for even more speed.',
      difficulty: 'Intermediate',
      minutes: 26,
      xp: 140,
      labId: 'game-engine',
      labMode: 'astar',
      analogy:
        "Dijkstra is a search party spreading out evenly in every direction from the start. A* gives the search party a compass pointing at the goal: they still check that a route is truly short, but they try the promising direction first. A good compass never claims the goal is farther than it really is. Weighted A* trusts the compass more than it should, which is faster but can occasionally lead to a slightly longer path.",
      intuition: [
        { title: 'g = cost so far', body: "g(n) is the real cost of the best known route from the start to node n, exactly as in Dijkstra." },
        { title: 'h = optimistic guess', body: "h(n) estimates the remaining cost to the goal. If h never overestimates the true cost (admissible), the first time you pop the goal its path is optimal." },
        { title: 'f = g + h', body: "Always expand the open node with the lowest f. With h = 0, A* is Dijkstra. In Tab 1, across 32 reachable random 30×30 maps, A* with the Octile heuristic finds exactly the same path costs as Dijkstra while expanding about half as many nodes." },
        { title: 'Match the heuristic to the movement', body: "4-way grid: Manhattan |dx| + |dy|. 8-way grid with √2 diagonals: Octile max + (√2 − 1)·min. Any-angle: Euclidean. Using Manhattan on an 8-way grid overestimates diagonals and returned a longer-than-optimal path on 21 of the 32 maps." },
        { title: 'Weighted A*', body: "f = g + w·h with w > 1 is greedier. Its paths are guaranteed to be at most w times the optimal cost. With w = 1.5, Tab 1 expands about 70% fewer nodes than plain A* and the worst path was 11.7% longer." },
        { title: 'Engine details', body: "Disallow diagonal corner-cutting through walls, use a binary heap with lazy deletion, avoid clearing arrays between searches with generation stamps, and smooth grid paths (string pulling) or use a navmesh with the funnel algorithm." },
      ],
      callouts: [
        { kind: 'architecture', title: 'A* main loop', body: 'The same loop as Dijkstra with a different priority.', flow: ['push start with f = h(start)', 'pop lowest f (skip if already closed)', 'goal? → walk parents back, done', 'for each neighbour: g\' = g + cost; if better, record parent, push with f = g\' + w·h', 'open list empty → unreachable'] },
        { kind: 'tip', title: 'Pick the heuristic for your movement', body: 'Manhattan for 4-way, Octile for 8-way, Euclidean for any-angle movement. A heuristic that is admissible for your movement keeps A* optimal.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'astar_from_scratch.ts',
          explanation: 'Runnable TypeScript on 50 seeded random 30×30 grids with 8-way movement and no corner cutting: A* (Octile) must match Dijkstra\'s optimal cost on every reachable map while expanding fewer nodes, weighted A* (w = 1.5) must stay within its 1.5× bound, and Manhattan on an 8-way grid is shown to return sub-optimal paths. All asserted.',
          code: raw`//  f = g + h     g: cost so far     h: optimistic estimate to the goal
//
//   Dijkstra (h = 0)          A* (h = octile)            weighted A* (f = g + 1.5h)
//   ####### floods            ###>  aimed at G           #>  greedy, <= 1.5x optimal
//   evenly in all             ->    same cost, ~half      -> far fewer expansions
//   directions                      the expansions
//  ---- parity check: A* cost == Dijkstra cost on every reachable map ----
import assert from 'node:assert/strict';

const W = 30, H = 30, SQ2 = Math.SQRT2;
function mulberry32(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
class MinHeap {
  n: number[] = []; k: number[] = [];
  get size() { return this.n.length; }
  push(node: number, key: number) {
    const n = this.n, k = this.k; let i = n.length; n.push(node); k.push(key);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= k[i]) break; [n[p], n[i]] = [n[i], n[p]]; [k[p], k[i]] = [k[i], k[p]]; i = p; }
  }
  pop(): number {
    const n = this.n, k = this.k, top = n[0], ln = n.pop()!, lk = k.pop()!;
    if (n.length) {
      n[0] = ln; k[0] = lk; let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < n.length && k[l] < k[m]) m = l; if (r < n.length && k[r] < k[m]) m = r; if (m === i) break; [n[m], n[i]] = [n[i], n[m]]; [k[m], k[i]] = [k[i], k[m]]; i = m; }
    }
    return top;
  }
}
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];
type Heuristic = (dx: number, dy: number) => number;
const zero: Heuristic = () => 0;
const octile: Heuristic = (dx, dy) => Math.max(dx, dy) + (SQ2 - 1) * Math.min(dx, dy);
const manhattan: Heuristic = (dx, dy) => dx + dy;                 // NOT admissible with diagonals

function astar(wall: Uint8Array, start: number, goal: number, h: Heuristic, weight = 1) {
  const g = new Float64Array(W * H).fill(Infinity), closed = new Uint8Array(W * H), open = new MinHeap();
  const gx = goal % W, gy = Math.floor(goal / W);
  const hw = (n: number) => weight * h(Math.abs((n % W) - gx), Math.abs(Math.floor(n / W) - gy));
  g[start] = 0; open.push(start, hw(start));
  let expanded = 0;
  while (open.size) {
    const n = open.pop();
    if (closed[n]) continue;                                     // lazy deletion of stale entries
    closed[n] = 1; expanded++;
    if (n === goal) return { cost: g[goal], expanded };
    const x = n % W, y = Math.floor(n / W);
    for (const [dx, dy, c] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const m = ny * W + nx;
      if (wall[m] || (dx && dy && (wall[y * W + nx] || wall[ny * W + x]))) continue;   // no corner cutting
      const ng = g[n] + c;
      if (ng < g[m] - 1e-12) { g[m] = ng; open.push(m, ng + hw(m)); }
    }
  }
  return { cost: Infinity, expanded };
}

let reachable = 0, expDijkstra = 0, expAstar = 0, expWeighted = 0, worstWeighted = 1, manhattanWorse = 0;
for (let seed = 1; seed <= 50; seed++) {
  const rnd = mulberry32(seed), wall = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) wall[i] = rnd() < 0.25 ? 1 : 0;
  wall[0] = wall[W * H - 1] = 0;
  const S = 0, G = W * H - 1;
  const dj = astar(wall, S, G, zero), as = astar(wall, S, G, octile), wa = astar(wall, S, G, octile, 1.5), mh = astar(wall, S, G, manhattan);
  if (dj.cost === Infinity) { assert.equal(as.cost, Infinity); continue; }
  reachable++;
  assert.ok(Math.abs(as.cost - dj.cost) < 1e-9);                 // optimal: identical cost to Dijkstra
  assert.ok(as.expanded <= dj.expanded);
  assert.ok(wa.cost <= 1.5 * dj.cost + 1e-9);                     // weighted A* bound
  worstWeighted = Math.max(worstWeighted, wa.cost / dj.cost);
  if (mh.cost > dj.cost + 1e-9) manhattanWorse++;
  expDijkstra += dj.expanded; expAstar += as.expanded; expWeighted += wa.expanded;
}
assert.equal(reachable, 32);
assert.ok(expAstar < expDijkstra * 0.6 && expWeighted < expAstar * 0.5);
assert.ok(manhattanWorse > 0);                                     // inadmissible heuristic -> longer paths
console.log('expanded  Dijkstra', expDijkstra, '| A*', expAstar, '| weighted', expWeighted,
  '| worst weighted ratio', worstWeighted.toFixed(3), '| Manhattan sub-optimal on', manhattanWorse, 'of', reachable, 'maps');`,
        },
        production: {
          language: 'ts',
          filename: 'astar_grid.ts',
          explanation: 'Production engine pattern: a reusable A* pathfinder that allocates once. Typed arrays hold g, parent and a generation stamp per node so nothing is cleared between searches, the open list is a typed-array binary heap with lazy deletion, ties are broken towards larger g (deeper nodes), diagonals cannot cut corners, and the path is written into a caller-provided buffer.',
          code: raw`const SQ2 = Math.SQRT2;
const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];

export class GridPathfinder {
  private g: Float32Array; private parent: Int32Array;
  private stamp: Uint32Array; private closedStamp: Uint32Array; private gen = 0;
  private hn: Int32Array; private hk: Float32Array; private size = 0;

  constructor(readonly w: number, readonly h: number, readonly walkable: Uint8Array, readonly weight = 1) {
    const n = w * h;
    this.g = new Float32Array(n); this.parent = new Int32Array(n);
    this.stamp = new Uint32Array(n); this.closedStamp = new Uint32Array(n);
    this.hn = new Int32Array(n * 8); this.hk = new Float32Array(n * 8);
  }

  private octile(n: number, gx: number, gy: number) {
    const dx = Math.abs((n % this.w) - gx), dy = Math.abs(((n / this.w) | 0) - gy);
    return Math.max(dx, dy) + (SQ2 - 1) * Math.min(dx, dy);
  }
  private push(node: number, key: number) {
    let i = this.size++;
    while (i > 0) { const p = (i - 1) >> 1; if (this.hk[p] <= key) break; this.hn[i] = this.hn[p]; this.hk[i] = this.hk[p]; i = p; }
    this.hn[i] = node; this.hk[i] = key;
  }
  private pop() {
    const top = this.hn[0], ln = this.hn[--this.size], lk = this.hk[this.size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1; if (c >= this.size) break;
      if (c + 1 < this.size && this.hk[c + 1] < this.hk[c]) c++;
      if (this.hk[c] >= lk) break;
      this.hn[i] = this.hn[c]; this.hk[i] = this.hk[c]; i = c;
    }
    this.hn[i] = ln; this.hk[i] = lk;
    return top;
  }

  /** Writes node indices start..goal into out; returns the path length (0 = unreachable). */
  find(sx: number, sy: number, gx: number, gy: number, out: Int32Array): number {
    const { w, h, walkable, g, parent, stamp, closedStamp } = this;
    const gen = ++this.gen;                                // new search: old data becomes invisible
    const start = sy * w + sx, goal = gy * w + gx;
    this.size = 0;
    stamp[start] = gen; g[start] = 0; parent[start] = -1;
    this.push(start, this.weight * this.octile(start, gx, gy));
    while (this.size > 0) {
      const n = this.pop();
      if (closedStamp[n] === gen) continue;               // stale heap entry
      closedStamp[n] = gen;
      if (n === goal) {
        let len = 0; for (let c = goal; c !== -1; c = parent[c]) len++;
        if (len > out.length) return 0;
        let i = len; for (let c = goal; c !== -1; c = parent[c]) out[--i] = c;
        return len;
      }
      const x = n % w, y = (n / w) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = x + DX[k], ny = y + DY[k];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const m = ny * w + nx;
        if (!walkable[m]) continue;
        if (k >= 4 && (!walkable[y * w + nx] || !walkable[ny * w + x])) continue;   // no corner cutting
        const ng = g[n] + (k >= 4 ? SQ2 : 1);
        if (stamp[m] !== gen || ng < g[m]) {
          stamp[m] = gen; g[m] = ng; parent[m] = n;
          // tie-break: slightly prefer larger g (closer to the goal) among equal f
          this.push(m, ng + this.weight * this.octile(m, gx, gy) - ng * 1e-6);
        }
      }
    }
    return 0;
  }
}`,
        },
        bug: {
          explanation:
            'Manhattan distance assumes every diagonal costs 2, but on an 8-way grid a diagonal costs √2 ≈ 1.414. The heuristic therefore overestimates, A* is no longer guaranteed optimal, and units take visibly longer, zig-zagging routes (Tab 1 found sub-optimal paths on 21 of 32 maps). Use the Octile distance for 8-way movement.',
          buggy: {
            language: 'ts',
            filename: 'heuristic.ts',
            code: raw`// ❌ Manhattan with 8-way movement: overestimates diagonals, paths are no longer optimal
const DIAGONAL_COST = Math.SQRT2;
function h(ax: number, ay: number, bx: number, by: number) {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'heuristic.ts',
            code: raw`// ✅ Octile distance: exact on an empty 8-way grid, never overestimates
const DIAGONAL_COST = Math.SQRT2;
function h(ax: number, ay: number, bx: number, by: number) {
  const dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
  return Math.max(dx, dy) + (DIAGONAL_COST - 1) * Math.min(dx, dy);
}`,
          },
        },
      },
      takeaways: [
        'A* expands nodes in order of f = g + h; with h = 0 it is Dijkstra.',
        'An admissible heuristic (never overestimates) keeps A* optimal: Manhattan for 4-way, Octile for 8-way, Euclidean for any angle.',
        'Weighted A* (w > 1) is faster and stays within w × the optimal cost.',
        'Production A*: typed arrays, generation stamps, a binary heap with lazy deletion, and no corner cutting.',
        'Practice drill: compute the Octile distance from (0, 0) to (7, 3) by hand (7 + 3·0.414 ≈ 8.243), then paint that route in the lab and compare with the reported path cost.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'game-fsm-behavior-trees',
      title: 'Decision Making: Finite State Machines & Behavior Trees',
      summary: 'How game characters decide what to do: finite state machines with explicit transitions and hysteresis, and behavior trees built from selectors, sequences, conditions and long-running actions that scale to complex enemies.',
      difficulty: 'Intermediate',
      minutes: 24,
      xp: 130,
      analogy:
        "A finite state machine is a mood chart on the fridge: the guard is either Patrolling, Chasing, Attacking or Searching, and arrows say exactly what makes the mood change. A behavior tree is a to-do list with priorities: \"If I'm hurt, run away. Otherwise, if I can see the player, attack if close, else move closer. Otherwise, patrol.\" Each tick, the guard reads the list from the top and does the first thing that applies.",
      intuition: [
        { title: 'Finite state machines', body: "Exactly one state is active. Each state has enter, update and exit logic, and transitions fire on conditions. FSMs are easy to debug (print the state) and perfect for small sets of behaviours, animation states and UI flows." },
        { title: 'Hysteresis prevents flicker', body: "If an enemy chases when the player is closer than 10 m and patrols otherwise, a player standing at 10 m makes it switch every frame. Use different enter and exit thresholds (enter at 10, leave at 12) and a minimum time in state." },
        { title: 'The FSM explosion', body: "Every new state may need transitions to and from many existing states; with 10+ states the diagram becomes spaghetti. Hierarchical FSMs (states containing sub-machines) help; behavior trees help more." },
        { title: 'Behavior trees', body: "Leaves are conditions (canSeePlayer?) and actions (moveTo). Composites combine them: a Sequence runs children in order and fails on the first failure (AND); a Selector tries children in order and succeeds on the first success (OR, used for priorities). Every node returns Success, Failure or Running." },
        { title: 'Running and memory', body: "Long actions (walking to a point) return Running across many ticks. Reactive trees re-evaluate from the root every tick, so a higher-priority branch (low health → flee) can interrupt a running action." },
        { title: 'Blackboards and beyond', body: "Nodes share data through a blackboard (target, last known position). Many studios combine techniques: behavior trees for structure, utility scoring for choosing between options, and GOAP or HTN planners for long-term goals." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Guard behavior tree', body: 'A Selector at the root encodes priorities from top to bottom.', flow: ['Selector (first success wins)', '1. Sequence: health < 25? → flee', '2. Sequence: sees player? → Selector(in range? → attack, else moveTo player)', '3. patrol'] },
        { kind: 'tip', title: 'Make AI visible', body: 'Draw the current state or the active branch above each character in debug builds. Most AI bugs are obvious the moment you can see what the character thinks it is doing.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'fsm_bt_from_scratch.ts',
          explanation: 'Runnable TypeScript: a guard FSM driven by a scripted sequence of sensor readings with its exact state trace asserted, a demonstration of threshold flicker versus hysteresis, and a small reactive behavior tree (selector, sequence, conditions, a Running move action) whose decisions and interruption by a higher-priority branch are asserted tick by tick.',
          code: raw`//  FSM                                   BEHAVIOR TREE (reactive, ticked from the root)
//                                        [Selector]
//   Patrol --sees & d<10--> Chase         |-- [Sequence] lowHealth? -> flee
//   Chase --d<2--> Attack --d>=2.5--> Chase  |-- [Sequence] seesPlayer? -> [Selector] inRange? -> attack
//   Chase --!sees--> Search --3 ticks--> Patrol  |                              \-> moveTo (Running)
//                                         \-- patrol
import assert from 'node:assert/strict';

// ---------- FSM ----------
type State = 'Patrol' | 'Chase' | 'Attack' | 'Search';
type Sense = { sees: boolean; dist: number };
function fsmStep(s: State, inp: Sense, timer: { search: number }): State {
  switch (s) {
    case 'Patrol': return inp.sees && inp.dist < 10 ? 'Chase' : 'Patrol';
    case 'Chase':
      if (!inp.sees) { timer.search = 0; return 'Search'; }
      return inp.dist < 2 ? 'Attack' : 'Chase';
    case 'Attack': return inp.dist >= 2.5 ? 'Chase' : 'Attack';
    case 'Search':
      if (inp.sees) return 'Chase';
      return ++timer.search >= 3 ? 'Patrol' : 'Search';
  }
}
const script: Sense[] = [
  { sees: false, dist: 20 }, { sees: true, dist: 8 }, { sees: true, dist: 1.5 }, { sees: true, dist: 2.2 },
  { sees: true, dist: 3 }, { sees: false, dist: 9 }, { sees: false, dist: 9 }, { sees: false, dist: 9 }, { sees: false, dist: 9 },
];
let st: State = 'Patrol'; const timer = { search: 0 }, trace: State[] = [];
for (const inp of script) { st = fsmStep(st, inp, timer); trace.push(st); }
assert.deepEqual(trace, ['Patrol', 'Chase', 'Attack', 'Attack', 'Chase', 'Search', 'Search', 'Search', 'Patrol']);
// 2.2 m stays in Attack: the exit threshold (2.5) is wider than the entry threshold (2) -> hysteresis

// ---------- flicker vs hysteresis ----------
const jitter = [9.9, 10.1, 9.9, 10.1, 9.9, 10.1, 9.9, 10.1];
let naive = false, naiveFlips = 0, hyst = false, hystFlips = 0;
for (const d of jitter) {
  const n: boolean = d < 10; if (n !== naive) naiveFlips++; naive = n;
  const h: boolean = hyst ? d < 12 : d < 10; if (h !== hyst) hystFlips++; hyst = h;
}
assert.deepEqual([naiveFlips, hystFlips], [8, 1]);           // flicker every frame vs one clean transition

// ---------- behavior tree ----------
type Status = 'S' | 'F' | 'R';
type BB = { hp: number; sees: boolean; dist: number; log: string[] };
type Node = (bb: BB) => Status;
const seq = (...kids: Node[]): Node => (bb) => { for (const k of kids) { const r = k(bb); if (r !== 'S') return r; } return 'S'; };
const sel = (...kids: Node[]): Node => (bb) => { for (const k of kids) { const r = k(bb); if (r !== 'F') return r; } return 'F'; };
const cond = (name: string, f: (bb: BB) => boolean): Node => (bb) => (f(bb) ? 'S' : 'F');
const act = (name: string, f: (bb: BB) => Status = () => 'S'): Node => (bb) => { bb.log.push(name); return f(bb); };

const guard = sel(
  seq(cond('lowHealth', (bb) => bb.hp < 25), act('flee')),
  seq(cond('sees', (bb) => bb.sees), sel(seq(cond('inRange', (bb) => bb.dist < 2), act('attack')), act('moveTo', (bb) => { bb.dist -= 3; return bb.dist < 2 ? 'S' : 'R'; }))),
  act('patrol'),
);
const bb: BB = { hp: 100, sees: false, dist: 10, log: [] };
const results: Status[] = [];
results.push(guard(bb));                        // cannot see -> patrol
bb.sees = true;
results.push(guard(bb), guard(bb));             // moveTo 10 -> 7 (R), 7 -> 4 (R)
bb.hp = 20;
results.push(guard(bb));                        // higher priority interrupts the running move
bb.hp = 100;
results.push(guard(bb), guard(bb));             // moveTo 4 -> 1 (S: arrived), then attack
assert.deepEqual(results, ['S', 'R', 'R', 'S', 'S', 'S']);
assert.deepEqual(bb.log, ['patrol', 'moveTo', 'moveTo', 'flee', 'moveTo', 'attack']);
console.log('FSM trace:', trace.join(' > '), '| BT actions:', bb.log.join(', '));`,
        },
        production: {
          language: 'ts',
          filename: 'behavior_tree.ts',
          explanation: 'Production engine pattern: a class-based behavior tree with a typed blackboard, enter/exit hooks so interrupted actions can clean up (stop the nav agent, cancel an animation), decorators (Inverter, Cooldown using simulation time), a reactive Selector that aborts lower-priority running children, and a per-agent tick that records the active path for a debug overlay.',
          code: raw`export enum Status { Success, Failure, Running }

export interface Blackboard {
  now: number;                              // simulation time in seconds (never wall clock)
  self: { x: number; y: number; hp: number };
  target?: { x: number; y: number };
  debugPath: string[];
}

export abstract class BTNode {
  private running = false;
  constructor(readonly name: string) {}
  tick(bb: Blackboard): Status {
    if (!this.running) this.enter(bb);
    bb.debugPath.push(this.name);
    const s = this.update(bb);
    this.running = s === Status.Running;
    if (!this.running) this.exit(bb);
    return s;
  }
  /** Called when a higher-priority branch takes over while this node is Running. */
  abort(bb: Blackboard) { if (this.running) { this.running = false; this.exit(bb); } }
  protected enter(_bb: Blackboard) {}
  protected exit(_bb: Blackboard) {}
  protected abstract update(bb: Blackboard): Status;
}

export class Sequence extends BTNode {
  constructor(name: string, readonly kids: BTNode[]) { super(name); }
  protected update(bb: Blackboard) {
    for (const k of this.kids) { const s = k.tick(bb); if (s !== Status.Success) return s; }
    return Status.Success;
  }
  override abort(bb: Blackboard) { for (const k of this.kids) k.abort(bb); super.abort(bb); }
}

/** Reactive selector: re-checks higher priorities every tick and aborts the previously running child. */
export class Selector extends BTNode {
  private active = -1;
  constructor(name: string, readonly kids: BTNode[]) { super(name); }
  protected update(bb: Blackboard) {
    for (let i = 0; i < this.kids.length; i++) {
      const s = this.kids[i].tick(bb);
      if (s === Status.Failure) continue;
      if (this.active !== -1 && this.active !== i) this.kids[this.active].abort(bb);
      this.active = s === Status.Running ? i : -1;
      return s;
    }
    this.active = -1;
    return Status.Failure;
  }
}

export class Condition extends BTNode {
  constructor(name: string, readonly test: (bb: Blackboard) => boolean) { super(name); }
  protected update(bb: Blackboard) { return this.test(bb) ? Status.Success : Status.Failure; }
}

export class Inverter extends BTNode {
  constructor(readonly child: BTNode) { super('Not ' + child.name); }
  protected update(bb: Blackboard) {
    const s = this.child.tick(bb);
    return s === Status.Running ? s : s === Status.Success ? Status.Failure : Status.Success;
  }
}

export class Cooldown extends BTNode {
  private readyAt = 0;
  constructor(readonly child: BTNode, readonly seconds: number) { super('Cooldown ' + child.name); }
  protected update(bb: Blackboard) {
    if (bb.now < this.readyAt) return Status.Failure;
    const s = this.child.tick(bb);
    if (s === Status.Success) this.readyAt = bb.now + this.seconds;
    return s;
  }
}

export class MoveTo extends BTNode {
  constructor(readonly agent: { setDestination(x: number, y: number): void; stop(): void; arrived(): boolean }) { super('MoveTo'); }
  protected override enter(bb: Blackboard) { if (bb.target) this.agent.setDestination(bb.target.x, bb.target.y); }
  protected update(bb: Blackboard) { return !bb.target ? Status.Failure : this.agent.arrived() ? Status.Success : Status.Running; }
  protected override exit() { this.agent.stop(); }       // also runs when aborted: no ghost movement
}

export function tickAgent(root: BTNode, bb: Blackboard) {
  bb.debugPath.length = 0;
  return root.tick(bb);                                  // bb.debugPath now shows the active branch
}`,
        },
        bug: {
          explanation:
            'Using the same threshold to enter and leave a state makes the AI flicker whenever the input hovers around it: a player standing 10 m away makes the guard switch between Chase and Patrol every frame, restarting animations and barks. Use separate enter/exit thresholds (hysteresis) and a minimum time in state.',
          buggy: {
            language: 'ts',
            filename: 'guard.ts',
            code: raw`// ❌ One threshold for both directions: state flickers every frame at 10 m
function update(g: Guard, distToPlayer: number) {
  g.state = distToPlayer < 10 ? 'Chase' : 'Patrol';
  playAnimation(g, g.state);                     // restarts constantly
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'guard.ts',
            code: raw`// ✅ Hysteresis (enter < 10, leave > 12) plus a minimum time in state
const ENTER = 10, EXIT = 12, MIN_STATE_TIME = 0.5;
function update(g: Guard, distToPlayer: number, now: number) {
  const want = g.state === 'Chase' ? (distToPlayer < EXIT ? 'Chase' : 'Patrol') : (distToPlayer < ENTER ? 'Chase' : 'Patrol');
  if (want !== g.state && now - g.stateSince >= MIN_STATE_TIME) {
    g.state = want; g.stateSince = now;
    playAnimation(g, g.state);                   // only on real transitions
  }
}`,
          },
        },
      },
      takeaways: [
        'FSMs: one active state, explicit transitions; great for small behaviour sets and animation.',
        'Use hysteresis and minimum state time so AI does not flicker around thresholds.',
        'Behavior trees compose conditions and actions with Sequences (AND) and Selectors (OR, priority).',
        'Reactive trees let higher priorities interrupt Running actions; exit hooks clean up after aborts.',
        'Practice drill: add a Cooldown(attack, 1 s) decorator to Tab 1\'s tree and predict what the guard does on the tick right after attacking (the attack branch fails, so the inner Selector falls through to moveTo).',
      ],
    },
  ],
};
