# NEXUS CS LABS

A modular, dark-mode learning platform for full-stack engineering and security. It has five tracks that go from scratch to advanced, a data-driven lesson engine, and live in-browser labs.

**Stack:** Vite · React 19 · TypeScript · Tailwind CSS v4 · Supabase (Auth + Postgres + RLS)

| Track | Lessons | Live lab |
|---|---|---|
| Web Development | **Full 30-chapter curriculum** *(Day 6)* (how the web works → rendering & CSS → JS engine → TypeScript → React 19 → backend APIs → auth & multi-tenancy → PostgreSQL → caching/build/deploy → testing & system design) | **JS Event Loop & React Render Visualizer** *(Day 3)* |
| App Development | **Full 27-chapter curriculum** *(Day 7)* (OS lifecycle & rendering engines → UI/navigation/gestures → state → SQLite persistence → offline-first sync → resilient networking → mobile security → permissions/push/links → profiling & store shipping) | **Mobile Offline Sync & API Inspector** *(Day 3)* |
| Game Development | **Full 28-chapter curriculum** *(Day 8)* (game loop & fixed timestep → vectors/matrices/quaternions → ECS & data-oriented design → physics & collision → pathfinding & AI → GPU pipeline, PBR & WebGPU/WGSL → input, camera & game feel → scenes, pooling & saves → multiplayer netcode) | **2D Canvas Engine Sandbox** *(Day 2)* |
| AI / ML & LLM Engineering | **Full 32-chapter curriculum** *(Day 5)* (ML math → classical ML → deep learning → tokens/embeddings → transformers → inference → fine-tuning → prompting → RAG → agents/MCP → evals & AI security) | **Neural Net + Token X-Ray**, **Red-Team Prompt Injection & Attention X-Ray** *(Day 2)* |
| Cybersecurity & RE | **Full 28-chapter curriculum** (foundations → web → crypto → x86-64 → binaries → RE → memory safety → anti-analysis) | **CrackMe Sandbox** |

There are **145 published lessons worth 17,270 XP and 0 roadmap chapters**: all five tracks are fully authored end to end with zero locked or "coming soon" items. They are **Web Development** (30 chapters), **App Development** (27), **Game Development** (28), **AI / ML & LLM Engineering** (32) and **Cybersecurity & Reverse Engineering** (28).

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

The app runs immediately in **local mode**. XP, streaks, lessons and CTF flags are saved in `localStorage`, so you don't need any keys yet.

```bash
npm run build      # type-check + production build → dist/
npm run preview    # serve the build
```

## What's new in Day 8 (final milestone: 100% unlocked)

The **Game Development** track (Track 3) is now a complete zero-to-engine-architect curriculum: **28 published chapters across 9 modules**. With it, **all five tracks are fully authored: 145 chapters, 17,270 XP, 0 locked or "coming soon" items anywhere**. Day 8 changed **only** Game lesson content (plus this README). The database schema, `package.json`, all 6 interactive labs, routing, UI components and the Web, App, AI and Cyber tracks are byte-for-byte unchanged, verified with SHA-256 against a snapshot of 114 files.

| Track | Modules | Chapters | XP | Minutes | Lab embeds |
|---|---|---|---|---|---|
| Web Development | 10 | 30 | 3,570 | 679 | 3 |
| App Development | 9 | 27 | 3,200 | 572 | 6 |
| Game Development | 9 | 28 | 3,570 | 666 | 11 |
| AI / ML & LLM Engineering | 11 | 32 | 3,750 | 703 | 8 |
| Cybersecurity & Reverse Engineering | 8 | 28 | 3,180 | 556 | 7 |
| **Total** | **47** | **145** | **17,270** | **3,176** | **35** |

The two original Game lesson IDs (`game-fixed-timestep`, `game-astar`) are kept, so existing XP and completions still count. The original module IDs `game-core`, `game-ai` and `game-gpu` are kept too.

Every chapter has:
- an "Explain Like Water" analogy, then 6 intuition steps with exact maths, memory layouts or frame-by-frame traces
- an architecture flow callout and an ASCII diagram at the top of Tab 1
- a 3-tab Code Explorer:
  1. **Core Engine Algorithm / From Scratch:** runnable TypeScript that asserts its own output.
  2. **Production Cache-Friendly / Engine Pattern:** TypeScript on TypedArrays (zero per-frame allocation), C++20 or WGSL.
  3. **Classic Bug & Fix:** for example the √2 diagonal speed exploit, per-frame `x += 5`, unbounded catch-up (spiral of death), `Math.random` desync, explicit-Euler energy gain, centre-only grid insertion, unnormalised SAT axes, end-position-only bullets (tunneling), Manhattan on 8-way grids, FSM flicker, a depth buffer cleared to 0, lighting in sRGB space, vec3 padding mismatches, missing coyote time, frame-rate dependent lerp, listener leaks, per-frame allocation GC stutter, raw Map serialization, sequence wraparound, snap-without-replay rubber-banding, and shallow rollback snapshots.
- takeaways ending in a practice drill

How the examples were verified:
- All 28 TypeScript "From Scratch" samples run under Node and pass `tsc --strict`. Among other things they check that the fixed timestep reaches an identical state after 240 steps at 60 Hz, 144 Hz and jittery frame times, that seeded replays match by checksum, vector and quaternion maths (gimbal lock reproduced at 90° pitch, shortest-path slerp), the MVP pipeline down to pixel coordinates, AABB and SAT (including an AABB false positive), quadtree and uniform-grid pair sets identical to the O(N²) result, A* matching Dijkstra's optimal cost on every reachable random map while expanding about half the nodes, camera damping that gives the same result at 60 Hz, 144 Hz and with jitter, and prediction/reconciliation and rollback that end in exactly the server's or the perfect-information state.
- All 5 WGSL shaders are compiled and validated by a real WebGPU implementation (wgpu with the naga compiler, on a Vulkan software driver). The particle compute shader was also run on that device, and its output matched Tab 1's CPU reference to within 4e-9.
- All 3 C++20 samples compile with `g++ -std=c++20 -Wall -Werror`. All other Tab 2 and Tab 3 samples are syntax-checked.

Lab integration:
- The **2D Canvas Engine Sandbox** (`labId: 'game-engine'`) is embedded with `labMode: 'physics'` in the game loop, physics, collision and game-feel chapters (9 chapters), and with `labMode: 'astar'` in the two pathfinding chapters. The lab opens on the matching tab.

Modules: (1) The Game Loop & Fixed Timestep (variable dt, accumulator & interpolation, determinism), (2) Game Mathematics (vectors/dot/cross, MVP matrices, quaternions & gimbal lock), (3) ECS & Data-Oriented Design (inheritance → ECS, SoA vs AoS & cache lines), (4) Physics & Collision (integrators & Verlet, broad phase, AABB/SAT, CCD & tunneling), (5) Pathfinding & Game AI (BFS/Dijkstra/flow fields, A* & heuristics, FSMs & behavior trees), (6) Graphics & the GPU (pipeline & rasterization, Blinn-Phong vs PBR, frustum culling & batching, WebGPU/WGSL compute), (7) Input, Camera & Game Feel (input buffering & coyote time, camera damping/shake/hitstop, event bus & audio), (8) Scenes, Memory & Persistence (scene stack, object pooling, save/load & branching dialogue), (9) Multiplayer Netcode (architecture & transports, prediction & reconciliation, rollback/interpolation/lag compensation).

Files added/modified in Day 8:
- `src/data/lessons/game.ts` (now imports the 9 module files)
- `src/data/lessons/game/m1-game-loop.ts`, `m2-math.ts`, `m3-ecs.ts`, `m4-physics.ts`, `m5-ai.ts`, `m6-graphics.ts`, `m7-feel.ts`, `m8-architecture.ts`, `m9-netcode.ts` (new)
- `README.md`

## What's new in Day 7

The **App Development** track (Track 2) is now a complete zero-to-production mobile engineering curriculum: **27 published chapters across 9 modules, with no locked or "coming soon" items left in the track**. Day 7 changed **only** App lesson content (plus this README). The database schema, `package.json`, all 6 interactive labs, routing, UI components and the Web, AI, Game and Cyber tracks are byte-for-byte unchanged, verified with SHA-256 against a snapshot of 105 files.

The two original App lesson IDs (`app-unidirectional-state`, `app-offline-outbox`) are kept, so existing XP and completions still count.

Every chapter has:
- an "Explain Like Water" analogy and 6 intuition steps that trace the UI thread, OS lifecycle, SQLite and the sync queue
- an architecture flow callout and an ASCII thread or sync-sequence diagram
- a 3-tab Code Explorer:
  1. **Core Mobile Pattern / From Scratch:** runnable TypeScript that asserts its own output.
  2. **Production Resilience Pattern:** React Native 0.88 / Expo SDK 58 code using React Navigation 7, Reanimated 4 + Gesture Handler, TanStack Query, Zustand, MMKV, expo-sqlite, op-sqlite (SQLCipher), expo-secure-store, expo-local-authentication, expo-notifications, expo-image, expo-camera, expo-location, expo-background-task and expo-updates.
  3. **Classic Mobile Bug & Fix:** for example tokens in AsyncStorage, 5,000 rows in a ScrollView, a fresh idempotency key per retry, drop-and-recreate "migrations", an in-memory outbox, LWW on device clocks, saving drafts only on unmount, JS-thread PanResponder gestures, hard-coded safe-area padding, a static OTA runtime version, a hard-coded SQLCipher key, deep links that execute actions, push tokens never refreshed, and a leaked GPS watcher.
- takeaways ending in a practice drill

How the examples were verified:
- All 27 TypeScript "From Scratch" samples run under Node and pass `tsc --strict`. They cover outbox coalescing and FIFO flushing on a real SQLite file that survives a simulated process death, full-jitter backoff ceilings with Retry-After and a circuit breaker, idempotency replay after a lost response, LWW vs version vectors vs three-way merge vs CRDTs (G-Counter, OR-Set), and more.
- The SQLite samples run on Node's built-in SQLite (the same SQL runs unchanged in expo-sqlite/op-sqlite). They prove that WAL lets a writer commit while a reader holds a snapshot (and that rollback-journal mode does not), check `EXPLAIN QUERY PLAN` before and after an index, and run `user_version` migrations that roll back atomically on failure.
- All Tab 2 and Tab 3 samples are syntax-checked. All client-side production samples also type-check against the real React Native, Expo and library type definitions.

Lab integration:
- The **Mobile Offline Sync & API Inspector** lab (`labId: 'app-architecture'`) is embedded in the outbox, optimistic UI, idempotency, conflict resolution and network-retry chapters, each with a `labMode` hint. The lab currently ignores `mode`; the hint documents which experiment fits.
- The state-architecture chapter keeps its React Re-Render X-Ray embed.

Modules: (1) OS Lifecycle & Rendering Engines (process death, Native vs RN New Architecture vs Flutter), (2) UI, Navigation & Gestures (navigation trees, safe areas/keyboard/adaptive layouts, UI-thread gestures), (3) State Architecture (state layers, server cache & streams, state restoration), (4) Persistence (KV vs SQLite/WAL, zero-data-loss migrations, media caching), (5) Offline-First Sync (outbox & coalescing, optimistic UI, idempotency keys, conflict resolution), (6) Networking (retries/backoff, cancellation & cursor pagination, payload efficiency), (7) Security (Keychain/Keystore & biometrics, SQLCipher & pinning, deep-link hardening), (8) Hardware, Push & Links (JIT permissions, APNs/FCM, Universal/App Links & background budgets), (9) Profiling & Shipping (virtualised lists, memory/battery, OTA vs store releases & review compliance).

Files added/modified in Day 7:
- `src/data/lessons/app.ts` (now imports the 9 module files)
- `src/data/lessons/app/m1-platform.ts` … `m9-performance-shipping.ts` (new)
- `README.md`

## What's new in Day 6

The **Web Development** track (Track 1) is now a complete zero-to-senior full-stack curriculum: **30 published chapters across 10 modules, with no locked or "coming soon" items left in the track**. Day 6 changed **only** Web lesson content (plus this README). The database schema, `package.json`, all 6 interactive labs, routing, UI components and the other four tracks are byte-for-byte unchanged, verified with SHA-256 against a snapshot of 95 files.

The two original Web lesson IDs (`web-critical-rendering-path`, `web-event-loop`) are kept, so existing XP and completions still count.

Every chapter has:
- an "Explain Like Water" analogy and 6 intuition steps that trace what the browser, V8, React Fiber or the PostgreSQL planner actually does
- an architecture flow callout and an ASCII diagram
- a 3-tab Code Explorer:
  1. **Core Mechanism / From Scratch:** runnable TypeScript or SQL that asserts its own output.
  2. **Production Full-Stack Pattern:** Node/Express 5, React 19 + TanStack Query, Zod 4, jose, Argon2, Redis, BullMQ, pg, Playwright, Tailwind v4 CSS, a multi-stage Dockerfile and similar.
  3. **Classic Bug & Fix:** for example a stale closure in `useEffect`, `React.memo` broken by unstable callbacks, `key={index}` corrupting state, async `forEach`, an N+1 loop, a LEFT JOIN turned into an INNER JOIN, non-sargable predicates, an RLS tenant leaking through a pooled connection, `VITE_` secret exposure, public caching of `/api/me`, CORS origin reflection, `jwt.decode()` used as verification, a missing OAuth `state` check, SSE chunk-boundary parsing, non-atomic rate limiting, and a CI workflow with `pull_request_target`.
- takeaways ending in a practice drill

How the examples were verified:
- All 27 TypeScript "From Scratch" samples run under Node and are type-checked with `tsc --strict`. This includes the exact event-loop order (real `Promise`/`setTimeout`/`queueMicrotask`/`await`), closure and `this` semantics, and compile-time `@ts-expect-error` claims.
- The 3 SQL samples (RBAC + Row Level Security, modeling & JOINs, indexes & `EXPLAIN ANALYZE` plan assertions) run on real PostgreSQL 18 via PGlite.
- Other samples are syntax-checked (esbuild / the Postgres parser). The main React production samples also type-check against React 19 and TanStack Query 5 types.

Known values checked include:
- the RFC 6455 `Sec-WebSocket-Accept` example and the RFC 7636 PKCE test vector
- flex grow/shrink and `fr` track sizing
- CLS scores
- round-trip budgets (DNS, TCP, TLS 1.2/1.3, HTTP/3)

Lab integration via `labId: 'web-internals'`:
- `labMode: 'eventloop'`: the Event Loop chapter.
- `labMode: 'react'`: the Reconciliation & Keys and the `React.memo` / `useCallback` chapters.

Modules: (1) How the Web Works (DNS/TCP/TLS, HTTP versions & status codes, CORS & cookies), (2) Rendering & Modern CSS (pixel pipeline, Flexbox vs Grid + container queries, Tailwind v4 + CLS), (3) JS Engine Internals (scope & closures, prototypes & `this`, event loop + async errors), (4) TypeScript for Production (unions & narrowing, generics/utility types/`satisfies`, runtime validation), (5) React 19 (reconciliation & keys, effects & server state, memoization, streaming AI UI), (6) Backend APIs (REST & pagination, idempotency & rate limiting, SSE vs WebSockets), (7) Auth & Multi-Tenancy (passwords/sessions/JWT rotation, OAuth + PKCE, RBAC + RLS), (8) PostgreSQL (modeling & JOINs, B-tree/GIN + EXPLAIN, transactions & N+1), (9) Caching, Build & Deploy (browser/CDN/Redis, Vite 8 + secrets, Docker + CI/CD), (10) Testing & System Design.

Files added/modified in Day 6:
- `src/data/lessons/web.ts` (now imports the 10 module files)
- `src/data/lessons/web/m1-how-the-web-works.ts` … `m10-testing-systems.ts` (new)
- `README.md`

## What's new in Day 5

The **AI / ML & LLM Engineering** track (Track 4) is now a complete zero-to-production curriculum: **32 published chapters across 11 modules, with no locked or "coming soon" items left in the track**. Day 5 changed **only** AI lesson content (plus this README); the database schema, all 6 interactive labs, routing, UI components and the other four tracks are byte-for-byte unchanged. The three original AI lesson IDs (`ai-neurons-gradient-descent`, `ai-backprop`, `ai-tokens-prompt-security`) are kept, so existing progress and XP still count.

Every chapter has an "Explain Like Water" analogy, 5–6 intuition steps, an architecture flow callout, and a 3-tab Code Explorer:
1. **From Scratch:** pure NumPy/stdlib Python or plain TypeScript. It opens with an ASCII diagram and is **self-verifying**: all 32 samples run and assert their own numbers.
2. **Production pattern:** PyTorch, Hugging Face, PEFT/TRL, sentence-transformers, pgvector SQL, FastMCP, Pydantic, OpenTelemetry, and provider-agnostic LLM wrappers.
3. **Common AI Bug & Fix:** for example double softmax, a missing `zero_grad`, the mask applied after softmax, the head-split reshape, temperature applied to probabilities, RoPE positions in a KV-cache loop, merging LoRA into 4-bit weights, a DPO reference that is the policy itself, a pgvector opclass mismatch, cross-tenant retrieval, MCP path traversal, non-idempotent retries, judge position bias, PII in logs, and `innerHTML` XSS.

Each chapter ends with takeaways and a practice drill.

Verified numbers include:
- softmax([2, 1, 0.1]) = [0.659, 0.242, 0.099] and its cross-entropy
- scaled dot-product attention on a 3-token example, causal and non-causal
- cosine similarity
- BPE merges on the classic corpus
- RoPE relative-position invariance
- the exact Llama-3-8B parameter count (8,030,261,248)
- KV cache = 128 KiB/token (1 GiB at 8K tokens; 4 GiB without GQA)
- int8/int4 weight memory
- LoRA r = 16 counts (13.6M for q/k/v/o, 41.9M for all linear layers)
- DPO loss 0.513
- RRF fusion scores
- self-consistency 0.683
- faithfulness and context precision

Lab integration via `labId` + `labMode`:
- **Neural Network lab** (`net`): the 3 deep-learning/backprop chapters.
- **Prompt Security lab** in **Attention X-Ray** mode (`attention`): BPE tokenization, self-attention and sampling.
- **Prompt Security lab** in **Injection Arena** mode (`arena`): the instruction-hierarchy and AI-security chapters.

Modules: (1) ML Math & Evaluation Foundations, (2) Classical ML, (3) Deep Learning & Backprop From Scratch, (4) Tokenization & Embeddings, (5) Transformer Internals (attention, MHA/GQA/RoPE, decoder block), (6) Inference, Sampling & Reasoning Models (decoding, KV cache & quantization, test-time compute), (7) Fine-Tuning & Alignment (SFT, LoRA/QLoRA, DPO/RLHF, distillation), (8) Prompt & Context Engineering, (9) Production RAG & Vector Search (chunking, hybrid search + RRF + reranking, grounding/permissions/GraphRAG/agentic RAG), (10) Agents, Tool Calling & MCP, (11) Evals, Observability & AI Security (OWASP LLM Top 10).

Files added/modified in Day 5:
- `src/data/lessons/ai.ts` (now imports the 11 module files)
- `src/data/lessons/ai/m1-foundations.ts` … `m11-evals-security.ts` (new)
- `README.md`

## What's new in Day 4

The **Cybersecurity & Reverse Engineering** track (Track 5) is now a complete zero-to-advanced curriculum: **28 published chapters across 8 modules, with no locked or "coming soon" items left in the track**. Day 4 changed **only** cyber lesson content; the database schema, all 6 interactive labs, routing, UI components and other tracks are untouched.

Each chapter follows the mandatory depth: an "Explain Like Water" analogy, step-by-step intuition, an ASCII/flow architecture diagram, a 3-tab Code Explorer (Core Mechanism / Real-World Audit / Vulnerable vs. Patched), and key takeaways ending in a hands-on practice drill. All code samples were compiled/run where feasible to verify correctness (GCC 13 assembly listings, Capstone disassembly, Base64/JWT decodes, the decimal-IP SSRF trick, etc.). Reverse-engineering chapters embed the existing **CrackMe Sandbox** at the relevant level, and memory-safety / anti-analysis chapters are framed around detection, defense and isolated-VM lab practice.

Modules: (1) Security Foundations & Threat Modeling, (2) Web Exploitation & Defense (SQLi, XSS+CSP, CSRF, SSRF, IDOR, JWT/sessions), (3) Applied Cryptography (AES-GCM, RSA/ECC + key exchange, Argon2/bcrypt, TLS 1.3), (4) x86-64 Assembly (registers, stack frames & calling conventions, flags & jumps, compile-and-compare), (5) Binary Formats & Static Triage (PE/ELF), (6) Static & Dynamic RE (Ghidra, GDB/x64dbg, keygen vs. patching), (7) Memory Safety & Mitigations (overflows, format strings, ASLR/DEP/canaries/PIE), (8) Anti-Analysis, Packing & Safe Lab Setup.

Files added/modified in Day 4:
- `src/data/lessons/cyber.ts` (now imports the 8 module files)
- `src/data/lessons/cyber/m1-foundations.ts` … `m8-antianalysis.ts` (new)

## What's new in Day 3

All 5 tracks now have their own hands-on lab (6 labs in total). Day 3 needs **no database changes**, so `supabase_schema.sql` is untouched.

- **JS Event Loop & React Render Visualizer** (`src/labs/WebInternalsLab.tsx`, Web Development track)
  - *Event Loop simulator* (`src/labs/web/eventLoop.ts`): 4 live zones (Call Stack, Web APIs, Microtask Queue, Macrotask Queue), a console strip, an event-loop phase indicator and a virtual clock. There are 3 presets: *Sync vs Promise vs setTimeout*, *Async/Await Trap* (await + fetch vs a 0ms timer) and *Chained Microtasks*. Controls are Play / Pause / Step forward / Step back / Reset with a speed slider, and the current source line is highlighted with a plain-English narration of every step. The simulator's output order is verified against **real JavaScript** (each preset's code run in Node gives an identical console order).
  - *React Re-Render X-Ray* (`src/labs/web/RenderXRay.tsx`): a **real** React tree (`App → Header, CounterCard, HeavyList, MemoizedChild`). Each node flashes on commit (cyan = necessary, crimson = wasted) and shows a render-count badge, a wasted-render badge and the exact reason it rendered ("props changed: onSelect (new function)"). `React.memo` and `useCallback` toggles show the classic result: memo alone is defeated by unstable callbacks, memo + useCallback brings wasted renders to zero. The tree is mounted in its own React root without `<StrictMode>`, so counts are identical in `npm run dev` and production.
- **Mobile Offline Sync & API Inspector** (`src/labs/AppArchitectureLab.tsx`, App Development track)
  - A phone-frame tasks app (status bar, network icon, sync pill, inline edit, toggle and delete buttons, toasts and a conflict bottom sheet) next to an **Architecture Inspector**. The inspector has an animated data-flow diagram, a live outbox queue with idempotency keys, a device DB vs server DB view, an expandable HTTP request/response log and an event timeline.
  - Controls: **Online / Slow 3G / Offline**, **Optimistic UI vs Wait-for-server**, a server 503-rate slider, pull-from-server and "edit on another device" (✎) to create real conflicts.
  - Sync engine (`src/labs/appsync/engine.ts`, a pure reducer) features:
    - **Outbox compaction:** edits merge into pending mutations, and create + delete cancel out.
    - Strict FIFO flushing.
    - Optimistic concurrency with `baseVersion` → **409 Conflict** → a **Keep Local / Keep Server** resolver.
    - **503** responses with exponential backoff.
    - Network drops mid-request, where a retry after the server already committed returns an **idempotent replay**.
    - Version rebasing of queued mutations.
- Lessons now link to their labs: *Event Loop* → Event Loop tab, *Unidirectional Data Flow* → React X-Ray tab, *Offline-First Sync* → the sync lab.

## What's new in Day 2

- **2D Canvas Engine Sandbox** (`src/labs/GameEngineLab.tsx`, Game Dev track):
  - *Physics & Hitboxes:* a 60fps platformer with physics on a fixed 120 Hz timestep. Controls are WASD / arrows + Space, with on-screen buttons on mobile. It has coyote time, jump buffering and variable jump height, plus a moving platform and coins. Live sliders cover gravity, jump force, friction and max speed, and there are 4 presets. Overlays show AABB hitboxes with contact sides, velocity vectors, a motion trail, slow-mo and the v²/2g peak-jump line.
  - *A\* Pathfinding:* a 33×19 grid where you paint walls, drag Start and Goal, and generate a maze or scattered walls. You can play or pause, single-step, solve instantly and set the speed. It shows live g/h/f overlays, the open and closed sets, and 4 heuristics (Manhattan, Octile, Euclidean, Dijkstra) with optional diagonal moves. A heuristic-weight slider lets you see weighted (inadmissible) A* trade optimality for speed. After a run finishes, edits re-solve live.
- **Red-Team Prompt Injection & Attention X-Ray** (`src/labs/PromptSecurityLab.tsx`, AI/ML track):
  - *Arena:* 4 CTF levels (Naive Bot → Keyword Filter → Filter + Output Scanner → Indirect RAG injection) against a deterministic **simulated** LLM. There is a Blue-Team guardrail panel (Keyword Filter, Delimiter Lock, Output Flag Scanner), a live per-stage defense log, a "replay with current guardrails" button, an attack-library matrix and a Base64/hex/ROT13/reverse decoder. Blue-Team mode guards a dummy secret, so turning the defenses off can't farm flags.
  - *Attention X-Ray:* an N×N causal attention heatmap. It shows trigger words ("Ignore", "System", "Reveal") hijacking attention from the system prompt, a hijack-ratio meter and an instruction-hierarchy toggle. Temperature and Top-P sliders drive a next-token probability chart with nucleus cut-off and sampling. The weights are illustrative, not from a real model.
- Labs now appear **inside their track** in the sidebar and on track pages. Lessons can deep-link to a lab tab via `labMode` (e.g. the A* lesson opens the A* tab).
- 4 new CTF challenges (`promptsec-l1..l4`, 700 XP) were added to `src/data/challenges.ts` and the SQL seed.
- Fix: the sign-up trigger no longer fails when a display name or email local part is shorter than 2 characters.

> **Already ran Day 1's SQL?** Re-run the whole `supabase_schema.sql` once. It is idempotent: it adds the 4 new challenges and the trigger fix without touching existing users, progress or RLS policies.

## Connect Supabase (cloud sync + accounts)

1. Create a project at supabase.com.
2. Open **SQL Editor** → paste all of `supabase_schema.sql` → **Run**. The script is idempotent, so it is safe to re-run after edits.
3. Copy `.env.example` to `.env.local` and fill in the values from **Project Settings → API Keys**:
   ```env
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
4. In **Authentication → Providers**, make sure **Email** is enabled. Email confirmation is on by default; turn it off while developing if you want instant sign-in.
5. Restart `npm run dev`. The top bar switches from *Local mode* to *Cloud sync* after you sign in. Any guest progress on that device is merged into the account on first sign-in.

> Only the **publishable** key goes in the frontend. Never put the `service_role` / secret key in a `VITE_` variable, because those are bundled into the public JS.

### Security model (`supabase_schema.sql`)

- RLS is enabled on every table, and users can only `SELECT` their own rows.
- Clients **cannot** write XP, rank, streak, `lesson_progress` or `ctf_flags` directly. All writes go through `SECURITY DEFINER` RPCs:
  - `complete_lesson(p_lesson_id, p_track_id, p_xp)` is idempotent (no double XP) and clamps XP to at most 500.
  - `submit_flag(p_challenge_id, p_flag)` verifies the SHA-256 of the flag server-side and returns `captured | already_captured | wrong_flag | unknown_challenge`.
- The only column a user can update is `profiles.display_name` (column-level grant).
- `ctf_challenges.flag_hash` is never exposed to the API (column-level grant).
- A trigger on `auth.users` auto-creates a profile row on sign-up.

The schema was tested on PostgreSQL 16 with a Supabase-style role setup. It ran twice cleanly, and the tests confirmed duplicate-XP prevention, flag verification, cross-user isolation and denial of direct writes.

## Project structure

```
nexus-cs-labs/
├── index.html
├── supabase_schema.sql          # tables, RLS, RPCs, triggers, challenge seed
├── .env.example
├── public/favicon.svg
└── src/
    ├── main.tsx                 # entry: <ProgressProvider><App/></ProgressProvider>
    ├── App.tsx                  # layout shell + page switch
    ├── index.css                # Tailwind v4 theme tokens + utilities
    ├── data/
    │   ├── types.ts             # Track / Module / Lesson content model
    │   ├── tracks.ts            # registry: TRACKS, LABS, lookup helpers
    │   ├── challenges.ts        # CTF catalog (hashes only)
    │   └── lessons/             # one file per track ← add content here
    │       ├── web.ts  app.ts  game.ts  ai.ts  cyber.ts
    │       ├── web/     # m1-how-the-web-works.ts … m10-testing-systems.ts (Day 6)
    │       ├── app/     # m1-platform.ts … m9-performance-shipping.ts (Day 7)
    │       ├── game/    # m1-game-loop.ts … m9-netcode.ts (Day 8)
    │       ├── ai/      # m1-foundations.ts … m11-evals-security.ts (Day 5)
    │       └── cyber/   # m1-foundations.ts … m8-antianalysis.ts (Day 4)
    ├── components/
    │   ├── LessonView.tsx       # renders ANY Lesson object
    │   ├── CodeExplorer.tsx     # Basic / Production / Bug & Fix tabs
    │   ├── CodeBlock.tsx        # zero-dep syntax highlighter
    │   ├── Callout.tsx          # architecture callouts with flow diagrams
    │   ├── Sidebar.tsx  TopBar.tsx  Dashboard.tsx  TrackView.tsx
    │   ├── AuthModal.tsx  Toasts.tsx  RichText.tsx  TrackIcon.tsx
    ├── context/ProgressContext.tsx   # auth + XP/streak/flags, cloud ⇄ local
    ├── hooks/useHashRoute.ts         # tiny hash router (#/track/web/<lesson>, #/lab/<id>)
    ├── lib/
    │   ├── supabase.ts          # client + offline fallback (null when unset)
    │   ├── localStore.ts        # localStorage persistence + streak logic
    │   ├── ranks.ts  theme.ts  hash.ts
    └── labs/
        ├── index.tsx            # lab registry (code-split, lazy loaded) + LabProps { mode }
        ├── GameEngineLab.tsx    # Day 2 · Lab C entry (tabs: physics | astar)
        ├── PromptSecurityLab.tsx# Day 2 · Lab D entry (tabs: arena | attention)
        ├── WebInternalsLab.tsx  # Day 3 · Lab E entry (tabs: eventloop | react)
        ├── AppArchitectureLab.tsx # Day 3 · Lab F entry (phone + inspector)
        ├── web/
        │   ├── eventLoop.ts     # deterministic event-loop simulator + 3 presets
        │   ├── EventLoopSimulator.tsx
        │   └── RenderXRay.tsx   # real React tree, isolated root, memo/useCallback X-ray
        ├── appsync/
        │   ├── engine.ts        # pure sync reducer + simulated backend (versions, idempotency)
        │   ├── useSyncSim.ts    # background sync worker (timers, latency, network drops)
        │   └── PhoneFrame.tsx  Inspector.tsx
        ├── shared/              # FlagSubmit, Hints, controls (Panel/Slider/Toggle)
        ├── game/
        │   ├── physics.ts       # AABB platformer physics (pure, fixed timestep)
        │   ├── astar.ts         # steppable A* (binary heap) + maze/scatter generators
        │   └── PhysicsPlayground.tsx  PathfindingVisualizer.tsx
        ├── promptsec/
        │   ├── model.ts         # simulated LLM + guardrail pipeline + decoders
        │   ├── levels.ts        # 4 CTF levels, personas, attack library, flags
        │   ├── attention.ts     # illustrative attention + softmax/top-p sampling
        │   └── Arena.tsx  AttentionXRay.tsx
        ├── crackme/             # Lab A: CrackMe Sandbox
        │   ├── binary.ts        # synthetic PE image, keygen, obfuscated flags
        │   ├── shell.ts         # simulated shell: file/strings/xxd/grep/pipes
        │   ├── emulator.ts      # x86-subset stepper (EAX, ZF, patching)
        │   ├── Terminal.tsx  LevelStrings.tsx  LevelKeygen.tsx  LevelPatch.tsx
        │   └── CrackMeLab.tsx
        └── neural/              # Lab B: Neural Net + Token X-Ray
            ├── nn.ts            # pure-TS MLP + backprop + dataset presets
            ├── tokenizer.ts     # toy BPE-style tokenizer + injection scanner
            └── NetTrainer.tsx  TokenXRay.tsx  NeuralLab.tsx
```

## Adding lessons (no UI changes)

Open `src/data/lessons/<track>.ts` (every track now keeps one file per module under `src/data/lessons/<track>/`, so open the module file there) and push a `Lesson` into a module's `lessons` array:

```ts
{
  id: 'web-closures',              // globally unique: it's the DB key
  title: 'Closures, Scope & Memory Leaks',
  summary: '…',
  difficulty: 'Beginner',          // Scratch | Beginner | Intermediate | Advanced
  minutes: 15,
  xp: 80,                          // server clamps to ≤ 500
  analogy: 'Explain-like-water one-liner…',
  intuition: [{ title: '…', body: 'Supports `inline code`.' }],
  callouts: [{ kind: 'architecture', title: '…', body: '…', flow: ['A', 'B', 'C'] }],
  code: {
    basic:      { language: 'ts', filename: 'a.ts', code: '…', explanation: '…' },
    production: { language: 'ts', filename: 'b.ts', code: '…', explanation: '…' },
    bug: { explanation: '…', buggy: { language: 'ts', code: '…' }, fixed: { language: 'ts', code: '…' } },
  },
  takeaways: ['…'],
  labId: 'neural-net',             // optional: embeds a live lab
}
```

If the chapter was listed in a module's `planned` array, remove it from there (no track uses `planned` any more, but the UI still supports it). The sidebar, track page, dashboard counts, XP totals and prev/next navigation all update automatically. To add a **new track**, create `lessons/<name>.ts` and append it to `TRACKS` in `src/data/tracks.ts`.

To add a **new lab**: create a component with a default export that accepts `LabProps` (`{ mode?: string }`), add its id to `LAB_IDS` in `src/data/types.ts`, register it in `src/labs/index.tsx`, and add an entry to `LABS` in `src/data/tracks.ts` (its `trackId` decides which sidebar track it appears under). Routing picks it up automatically.

To add a **new CTF challenge**: add a row to the seed in `supabase_schema.sql` (with `sha256(flag)`) and mirror it in `src/data/challenges.ts`.

## The labs

**CrackMe Sandbox (`vault_trial_v1.exe`).** This is a simulated, self-authored training binary. Nothing executes on your machine.
- **L1 Strings:** a real `strings` algorithm runs over a synthetic PE byte image; `file`, `xxd`, `grep`, `head` and `wc` pipes work. You need to find the leftover debug licence (watch out for the decoy).
- **L2 Keygen:** read the Ghidra-style `check_serial()` pseudocode (XOR 0x2A, mod 26, checksum mod 97) and compute the serial by hand with the ASCII/XOR workbench.
- **L3 Patching:** click `JNE` and patch it to `JE`, `NOP NOP` or `JMP`. The emulator single-steps `main()` showing EAX and ZF. Toggle the trial clock to see why `JE` inverts the outcome for valid users while `NOP` is the clean bypass.
- Flags are stored XOR-obfuscated in the bundle and verified by SHA-256 (locally, or server-side via `submit_flag`).

**Neural Net + Token X-Ray.**
- A 2 → hidden → 1 MLP (tanh hidden layers, sigmoid output, BCE loss, full-batch GD) written from scratch in `nn.ts`. Click to place cyan/crimson points, then Play/Pause, single-step, change the learning rate, layers and neurons, and load the XOR/circle/spiral/blob presets. It shows live loss, accuracy, epoch and a loss sparkline, and detects divergence.
- Token X-Ray shows sub-word splitting, chars/token, UTF-8 byte fallback for non-Latin scripts, and a prompt-injection marker scanner.

**Event Loop & Render Visualizer.** Try predicting the console output before pressing Play. In the X-Ray, click *Increment* three times with each toggle combination and compare the "wasted" counter.

**Offline Sync & API Inspector.** Follow the "Experiments to try" list in the lab. Every HTTP row expands to show the request and response JSON plus the idempotency key.

**2D Canvas Engine Sandbox.** Click the canvas to give it keyboard focus (keys are captured only then, so the page still scrolls). R resets and P pauses. The A* engine is verified against Dijkstra: identical optimal costs on 1,200 random grids and mazes.

**Prompt Security Arena.** Each level falls to a different, realistic technique: instruction override, filter evasion (leetspeak, spacing, synonyms), encoded exfiltration, and a task-framed instruction planted in a retrieved document. The closing lesson is that no guardrail combination stops everything. The real fix is architectural: keep secrets out of the model's context and enforce permissions in code.

## Deploy / import

- **GitHub:** `git init && git add . && git commit -m "NEXUS CS LABS day 1" && git push`. `.env.local` is git-ignored.
- **Any static host** (Vercel, Netlify, GitHub Pages, Cloudflare Pages): build command `npm run build`, output `dist/`. Hash routing means no rewrite rules are needed.
- **Google AI Studio or any other host:** set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in that environment's settings. Without them the app still runs, in local mode.

## Ethics

The reverse-engineering content targets only this platform's own CrackMe and CTF-style challenges. Apply these techniques only to software you own or are explicitly authorised to analyse. Bypassing licence checks in commercial software can violate copyright law and licence agreements.
