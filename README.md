# NEXUS CS LABS

A modular, dark-mode learning platform for full-stack engineering and security. It has five tracks that go from scratch to advanced, a data-driven lesson engine, and live in-browser labs.

**Stack:** Vite · React 19 · TypeScript · Tailwind CSS v4 · Supabase (Auth + Postgres + RLS)

| Track | Day 1 lessons | Live lab |
|---|---|---|
| Web Development | Critical Rendering Path, Event Loop | **JS Event Loop & React Render Visualizer** *(Day 3)* |
| App Development | Unidirectional State, Offline Outbox Sync | **Mobile Offline Sync & API Inspector** *(Day 3)* |
| Game Development | Fixed-Timestep Game Loop, A* Pathfinding | **2D Canvas Engine Sandbox** *(Day 2)* |
| AI / ML & LLM Engineering | Gradient Descent, Backprop, Tokens & Prompt Injection | **Neural Net + Token X-Ray**, **Red-Team Prompt Injection & Attention X-Ray** *(Day 2)* |
| Cybersecurity & RE | SQL Injection, Binary Triage, x86 CMP/Jcc | **CrackMe Sandbox** |

There are 12 published lessons plus 45 roadmap chapters, which appear as locked "coming soon" items.

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

Open `src/data/lessons/<track>.ts` and push a `Lesson` into a module's `lessons` array:

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

Then remove the matching title from that module's `planned` list. The sidebar, track page, dashboard counts, XP totals and prev/next navigation all update automatically. To add a **new track**, create `lessons/<name>.ts` and append it to `TRACKS` in `src/data/tracks.ts`.

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
