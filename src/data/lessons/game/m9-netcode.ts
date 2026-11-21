import type { Module } from '../../types';

const raw = String.raw;

export const netcodeModule: Module = {
  id: 'game-netcode',
  title: 'Multiplayer Netcode',
  level: 'Advanced',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'game-netcode-architecture',
      title: 'Netcode Architecture: Authoritative Servers, P2P, TCP vs UDP',
      summary: 'The big decisions behind every multiplayer game: who is authoritative (dedicated server, listen server or peer-to-peer lockstep/rollback), why TCP\'s head-of-line blocking hurts real-time games, how UDP and WebRTC data channels with sequence numbers, acks and redundant inputs replace it, and how tick rate and snapshots fit together.',
      difficulty: 'Advanced',
      minutes: 26,
      xp: 150,
      analogy:
        "TCP is a queue at a post office where every letter must be handed out in order: if letter 7 is lost, letters 8, 9 and 10 wait at the counter until 7 is re-sent, even though you only care about the latest news. UDP is shouting updates across a noisy room: some words get lost, but the next shout replaces them immediately. Fast games prefer shouting, with a few tricks (numbering each shout and repeating important words) to cope with what gets lost.",
      intuition: [
        { title: 'Who decides what is true?', body: "Authoritative server: clients send inputs, the server simulates and broadcasts state. It resists cheating and suits shooters, MMOs and anything competitive. Peer-to-peer lockstep or rollback: every peer simulates the same deterministic game from shared inputs; low bandwidth, popular in fighting and RTS games, but needs strict determinism." },
        { title: 'Tick rate and snapshots', body: "The server runs a fixed tick (for example 30–128 Hz), consumes inputs for that tick and sends snapshots (positions, velocities, events) to clients, often at a lower send rate with delta compression against the last acknowledged snapshot." },
        { title: 'TCP head-of-line blocking', body: "TCP guarantees ordered, reliable delivery. One lost packet stalls every later packet until a retransmission arrives (at least one round trip, often more). In Tab 1, a single loss delays the next packets on a 50 ms link by more than 200 ms." },
        { title: 'UDP, WebRTC and WebTransport', body: "UDP delivers independent datagrams with no ordering or retries, so a fresh snapshot is never stuck behind an old lost one. Browsers cannot open raw UDP sockets; they use WebRTC data channels with `ordered: false, maxRetransmits: 0`, or WebTransport datagrams. WebSockets are TCP." },
        { title: 'Sequence numbers, acks and redundancy', body: "Number every packet, drop older-than-latest snapshots, and piggyback an ack plus a bitfield of the last 32 received packets. Send each input in several consecutive packets: with 10% loss, the chance of losing all three copies is 0.1%." },
        { title: 'Wraparound', body: "16-bit sequence numbers wrap from 65535 to 0 every few minutes at high send rates. Compare them with modular arithmetic: a is newer than b if (a − b) mod 65536 is between 1 and 32767." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Authoritative client/server loop', body: 'Inputs flow up, state flows down; the server owns the truth.', flow: ['client: sample input, tag with tick + sequence', 'send last 3 inputs per packet (unreliable channel)', 'server: apply inputs at its fixed tick, simulate', 'server: snapshot (delta vs last acked) → clients', 'client: predict self, interpolate others (next chapters)'] },
        { kind: 'security', title: 'Never trust the client', body: 'Clients send intentions ("move left", "fire"), not results ("I am at x = 900", "I hit him"). Validate rates, ranges and cooldowns on the server; that single rule removes most speed hacks and teleport cheats.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'transport_simulation.ts',
          explanation: 'Runnable TypeScript: a seeded lossy link (10% loss, 50 ms one-way latency) carrying 60 Hz updates. Assertions show TCP-style in-order delivery stalling later packets for over 200 ms after a loss while UDP-style latest-wins delivery stays at 50 ms, that sending each input in several consecutive packets recovers almost every input (three copies) or all of them (five) despite the loss, and that 16-bit sequence comparison survives wraparound.',
          code: raw`//  TCP (ordered, reliable)                      UDP (independent datagrams)
//
//   7 lost -> 8 9 10 wait at the receiver       7 lost -> 8 9 10 delivered at +50 ms
//   until 7 is resent (RTO 200 ms)  ######       newest snapshot wins, old ones dropped
//   ---- redundant inputs: packet n also carries n-1, n-2 ...  3 copies -> P(all lost) = 0.1% ----
//   ---- seq compare with wraparound: newer(a, b) = ((a - b) & 0xffff) in [1, 32767] ----
import assert from 'node:assert/strict';

function mulberry32(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const N = 600, SEND_MS = 1000 / 60, LATENCY = 50, RTO = 200, LOSS = 0.1;
const rnd = mulberry32(2024);
const lostFirstTry = Array.from({ length: N }, () => rnd() < LOSS);
const sentAt = (i: number) => i * SEND_MS;

// TCP-like: a lost packet is resent after RTO; nothing after it is handed to the game until it arrives
let releaseClock = 0, worstTcp = 0;
for (let i = 0; i < N; i++) {
  const arrives = sentAt(i) + LATENCY + (lostFirstTry[i] ? RTO : 0);
  releaseClock = Math.max(releaseClock, arrives);                 // in-order: wait for everything before
  worstTcp = Math.max(worstTcp, releaseClock - sentAt(i));
}
// UDP-like: lost packets are simply gone; every delivered packet arrives after LATENCY
const delivered = lostFirstTry.filter((l) => !l).length;
assert.ok(worstTcp >= LATENCY + RTO - SEND_MS);                   // stalls past 230 ms
assert.ok(delivered > N * 0.85 && delivered < N);                  // ~10% lost, the rest on time (50 ms)

// redundant inputs: packet i carries inputs i, i-1, i-2
function missingWith(copies: number) {
  const received = new Set<number>();
  for (let i = 0; i < N; i++) if (!lostFirstTry[i]) for (let c = 0; c < copies; c++) if (i - c >= 0) received.add(i - c);
  return Array.from({ length: N - copies }, (_, i) => i).filter((k) => !received.has(k));
}
const lost = lostFirstTry.filter(Boolean).length;
const missing1 = missingWith(1), missing3 = missingWith(3), missing = missingWith(5);
assert.equal(missing1.length, lost);                               // one copy: every lost packet loses its input
assert.ok(missing3.length <= 3 && missing3.length < lost / 20);    // three copies: ~0.1% expected (here 2 of 600)
assert.deepEqual(missing, []);                                     // five copies: every input reached the server

// latest-wins snapshots: drop anything older than what we have (out-of-order arrival)
const newer = (a: number, b: number) => { const d = (a - b) & 0xffff; return d > 0 && d < 32768; };
assert.equal(newer(5, 3), true);
assert.equal(newer(3, 5), false);
assert.equal(newer(2, 65534), true);                               // 65534 -> 65535 -> 0 -> 1 -> 2
assert.equal(65534 > 2, true);                                     // the naive comparison gets it wrong
let latest = 65530; const applied: number[] = [];
for (const seq of [65531, 65533, 65532, 0, 1, 65535]) if (newer(seq, latest)) { latest = seq; applied.push(seq); }
assert.deepEqual(applied, [65531, 65533, 0, 1]);                   // late 65532 and 65535 ignored
console.log('worst TCP-style delay', worstTcp.toFixed(1), 'ms vs UDP 50 ms | lost', N - delivered, 'of', N, '| inputs missing with 1/3/5 copies:', missing1.length, missing3.length, missing.length);`,
        },
        production: {
          language: 'ts',
          filename: 'packet_channel.ts',
          explanation: 'Production engine pattern: a binary packet header (sequence, ack and a 32-bit ack bitfield, in the style used by many UDP game protocols) encoded with DataView, wraparound-safe sequence maths, acknowledgement tracking that reports which of our packets arrived (to drive delta compression and RTT estimates), and a WebRTC data channel configured as unordered and unreliable.',
          code: raw`export const seqNewer = (a: number, b: number) => { const d = (a - b) & 0xffff; return d > 0 && d < 0x8000; };

/** Header: u16 sequence | u16 ack | u32 ackBits  (8 bytes), followed by the payload. */
export class PacketChannel {
  private localSeq = 0;
  private remoteSeq = 0xffff;                    // latest sequence received from the peer
  private receivedBits = 0;                      // bit i set = we received remoteSeq - 1 - i
  private sentTimes = new Map<number, number>(); // seq -> send time, for acks and RTT
  rttMs = 100;
  onAcked: (seq: number) => void = () => {};

  constructor(private send: (bytes: ArrayBuffer) => void, private now: () => number) {}

  write(payload: Uint8Array) {
    const buf = new ArrayBuffer(8 + payload.byteLength), view = new DataView(buf);
    const seq = this.localSeq;
    view.setUint16(0, seq); view.setUint16(2, this.remoteSeq); view.setUint32(4, this.receivedBits >>> 0);
    new Uint8Array(buf, 8).set(payload);
    this.sentTimes.set(seq, this.now());
    if (this.sentTimes.size > 1024) this.sentTimes.delete(this.sentTimes.keys().next().value!);
    this.localSeq = (seq + 1) & 0xffff;
    this.send(buf);
  }

  /** Returns the payload, or null for a duplicate / too-old packet. */
  read(buf: ArrayBuffer): Uint8Array | null {
    const view = new DataView(buf);
    const seq = view.getUint16(0), ack = view.getUint16(2), ackBits = view.getUint32(4);
    if (seqNewer(seq, this.remoteSeq)) {
      const shift = (seq - this.remoteSeq) & 0xffff;
      this.receivedBits = shift >= 32 ? 0 : ((this.receivedBits << shift) | (1 << (shift - 1))) >>> 0;
      this.remoteSeq = seq;
    } else {
      const back = (this.remoteSeq - seq) & 0xffff;
      if (back === 0 || back > 32 || this.receivedBits & (1 << (back - 1))) return null;   // duplicate / ancient
      this.receivedBits |= 1 << (back - 1);
    }
    this.processAck(ack); for (let i = 0; i < 32; i++) if (ackBits & (1 << i)) this.processAck((ack - 1 - i) & 0xffff);
    return new Uint8Array(buf, 8);
  }

  private processAck(seq: number) {
    const t = this.sentTimes.get(seq);
    if (t === undefined) return;
    this.sentTimes.delete(seq);
    this.rttMs += (this.now() - t - this.rttMs) * 0.1;            // smoothed RTT
    this.onAcked(seq);                                           // e.g. mark snapshot as baseline for deltas
  }
}

/** Browser transport: unordered + unreliable data channel = UDP-like semantics over WebRTC. */
export function openGameChannel(pc: RTCPeerConnection) {
  const dc = pc.createDataChannel('game', { ordered: false, maxRetransmits: 0 });
  dc.binaryType = 'arraybuffer';
  return dc;
}`,
        },
        bug: {
          explanation:
            'Comparing 16-bit sequence numbers with a plain > works until the counter wraps from 65535 to 0 (about 18 minutes at 60 packets per second). After that every new packet looks older than the last one, gets discarded as stale, and the client freezes. Compare with modular arithmetic so the half of the number space "ahead" counts as newer.',
          buggy: {
            language: 'ts',
            filename: 'snapshots.ts',
            code: raw`// ❌ Breaks at wraparound: after seq 65535, packet 0 looks "older" and is dropped forever
function onSnapshot(seq: number, snap: Snapshot) {
  if (seq <= lastSeq) return;          // stale
  lastSeq = seq;
  applySnapshot(snap);
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'snapshots.ts',
            code: raw`// ✅ Wraparound-safe comparison for 16-bit sequence numbers
const seqNewer = (a: number, b: number) => { const d = (a - b) & 0xffff; return d > 0 && d < 0x8000; };
function onSnapshot(seq: number, snap: Snapshot) {
  if (!seqNewer(seq, lastSeq)) return;  // stale or duplicate
  lastSeq = seq;
  applySnapshot(snap);
}`,
          },
        },
      },
      takeaways: [
        'Authoritative servers fight cheating; P2P lockstep/rollback needs perfect determinism but little bandwidth.',
        'TCP (and WebSockets) suffer head-of-line blocking; real-time state prefers UDP-like channels.',
        'In browsers use WebRTC data channels (ordered: false, maxRetransmits: 0) or WebTransport datagrams.',
        'Number packets, ack with bitfields, send inputs redundantly, and compare sequences with wraparound maths.',
        'Practice drill: with 20% loss, compute the probability that all three redundant copies of an input are lost (0.2³ = 0.8%) and check it against Tab 1 by changing LOSS.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'game-prediction-reconciliation',
      title: 'Client-Side Prediction & Server Reconciliation',
      summary: 'Hiding latency for the local player: apply inputs immediately on the client, keep them in a buffer, and when the authoritative state arrives, rewind to it and replay the inputs the server has not processed yet. Errors are corrected smoothly instead of rubber-banding.',
      difficulty: 'Advanced',
      minutes: 26,
      xp: 160,
      analogy:
        "You are playing chess by post but you do not want to wait for every reply, so you move your piece on your own board straight away and write the move in a notebook. When the official board arrives by post, you set up your board to match it, then replay the moves from your notebook that the post office had not delivered yet. Usually nothing changes; if the official board disagrees (a piece was blocked), you quietly correct it.",
      intuition: [
        { title: 'The latency problem', body: "With 100 ms each way, an authoritative-only client sees its own movement 200 ms after pressing a key. Players feel input lag above roughly 50–100 ms, so waiting for the server is unacceptable for the local character." },
        { title: 'Prediction', body: "The client runs the same deterministic movement code as the server on its own inputs immediately. Each input gets a sequence number and is stored in a pending buffer until the server confirms it." },
        { title: 'Server authority', body: "The server applies inputs in order at its tick and sends back the authoritative state plus the sequence number of the last input it processed. The server can disagree: collisions with other players, speed clamps, being stunned." },
        { title: 'Reconciliation', body: "On receiving a state: set the predicted state to it, drop all inputs up to the acknowledged sequence, then re-apply the remaining pending inputs. If the server agrees, the result is identical to what the client already showed (Tab 1 asserts this exactly)." },
        { title: 'Snap vs smooth', body: "Snapping the predicted state to the server's (without replaying) throws the player back by one round trip of movement: rubber-banding. When there is a real error after replay, hide it visually by decaying a render offset over ~100 ms instead of teleporting." },
        { title: 'What to predict', body: "Predict the local player's movement, firing feedback, and other cheap, local effects. Do not predict outcomes the server must decide, such as damage dealt to others or item pickups contested by several players." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Prediction and reconciliation', body: 'The client is always ahead of the server by roughly one round trip of inputs.', flow: ['input #n → apply locally, push to pending, send', 'server: apply #n at its tick → state, lastProcessed = n', 'client receives state(n)', 'state = server state; drop pending ≤ n', 'replay pending > n → new predicted state', 'visual error offset decays with 1 − exp(−k·dt)'] },
        { kind: 'tip', title: 'Determinism keeps corrections rare', body: 'Share the movement code between client and server, run both at the same fixed tick and feed both exactly the same inputs. Then corrections only happen when something the client could not know (another player) intervenes.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'prediction_from_scratch.ts',
          explanation: 'Runnable TypeScript: a client and an authoritative server exchanging inputs and states over a simulated 100 ms one-way link at 60 Hz. Assertions prove that without prediction the player responds 12 ticks late, that prediction plus reconciliation matches the server exactly when they agree, that a server-side wall is corrected by replay, and that snapping to server state without replay rubber-bands the player backwards.',
          code: raw`//   CLIENT                                   SERVER (authoritative)
//    input #42 --apply now (predict)-->       ...100 ms...  apply #42 -> state(x), lastProcessed = 42
//    pending [43 44 45 ... 54]                ...100 ms...  <-- state(x, ack 42)
//    reconcile: x = server.x; drop <= 42; replay 43..54  -> same x as predicted (if server agreed)
//   ---- snap without replay: jumps back by ~12 ticks of movement (rubber band) ----
import assert from 'node:assert/strict';

const TICK = 1 / 60, SPEED = 300, DELAY_TICKS = 6;                // 100 ms one way at 60 Hz
type Input = { seq: number; dx: number };
type Player = { x: number };
const WALL = 120;
// shared, deterministic movement; the server knows about a wall the client does not
const move = (p: Player, inp: Input, serverWall: boolean) => {
  p.x += inp.dx * SPEED * TICK;
  if (serverWall && p.x > WALL) p.x = WALL;
};

function run(opts: { predict: boolean; replay: boolean; wall: boolean; ticks: number; holdTicks?: number }) {
  const server: Player = { x: 0 }, predicted: Player = { x: 0 };
  let pending: Input[] = [], lastAck = -1, firstVisibleMove = -1, maxBackwardJump = 0;
  const toServer: Array<{ at: number; input: Input }> = [], toClient: Array<{ at: number; x: number; ack: number }> = [];
  let shownX = 0;
  for (let t = 0; t < opts.ticks; t++) {
    const input: Input = { seq: t, dx: t < (opts.holdTicks ?? Infinity) ? 1 : 0 };   // hold "right"
    toServer.push({ at: t + DELAY_TICKS, input });
    if (opts.predict) { move(predicted, input, false); pending.push(input); }
    // server tick: process inputs that have arrived, then send state
    for (const m of toServer.filter((m) => m.at === t)) { move(server, m.input, opts.wall); lastAck = m.input.seq; }
    toClient.push({ at: t + DELAY_TICKS, x: server.x, ack: lastAck });
    // client receives state
    for (const s of toClient.filter((m) => m.at === t)) {
      if (!opts.predict) { predicted.x = s.x; continue; }
      predicted.x = s.x;                                         // rewind to the authoritative state
      pending = pending.filter((i) => i.seq > s.ack);
      if (opts.replay) for (const i of pending) move(predicted, i, false);   // re-apply unacknowledged inputs
    }
    if (predicted.x < shownX) maxBackwardJump = Math.max(maxBackwardJump, shownX - predicted.x);
    shownX = predicted.x;
    if (firstVisibleMove < 0 && shownX > 0) firstVisibleMove = t;
  }
  return { client: predicted.x, server: server.x, pending: pending.length, firstVisibleMove, maxBackwardJump };
}

const noPrediction = run({ predict: false, replay: false, wall: false, ticks: 60 });
assert.equal(noPrediction.firstVisibleMove, 2 * DELAY_TICKS);          // 12 ticks = 200 ms of input lag

const good = run({ predict: true, replay: true, wall: false, ticks: 60 });
assert.equal(good.firstVisibleMove, 0);                                 // responds on the same tick
assert.equal(good.maxBackwardJump, 0);                                  // server agreed: no correction ever
assert.ok(Math.abs(good.client - 60 * SPEED * TICK) < 1e-9);            // 300 px after 1 s
assert.equal(good.pending, 2 * DELAY_TICKS);                            // one round trip of inputs in flight

const snap = run({ predict: true, replay: false, wall: false, ticks: 60 });
assert.ok(snap.maxBackwardJump > 29.99);                                // yanked back 30 px when the first state lands
assert.ok(Math.abs(good.client - snap.client - 2 * DELAY_TICKS * SPEED * TICK) < 1e-9);   // and stays a full RTT (60 px) behind

const walled = run({ predict: true, replay: true, wall: true, ticks: 60 });
assert.equal(walled.server, WALL);                                       // server stopped us at the wall
assert.ok(walled.client > WALL);                                         // client still predicts past it (it cannot know)...
const released = run({ predict: true, replay: true, wall: true, ticks: 80, holdTicks: 60 });
assert.equal(released.client, WALL);                                     // ...and converges to the server once you let go
console.log('input lag without prediction', noPrediction.firstVisibleMove, 'ticks | predicted x', good.client.toFixed(1),
  '| snap rubber band', snap.maxBackwardJump.toFixed(1), 'px | server wall x', walled.server);`,
        },
        production: {
          language: 'ts',
          filename: 'client_prediction.ts',
          explanation: 'Production engine pattern: a PredictedPlayer that stores inputs in a fixed ring buffer, simulates with the shared deterministic step, reconciles on every authoritative state, measures the post-replay error and hides small errors by decaying a visual offset (frame-rate independent), while snapping only when the error is too large to smooth.',
          code: raw`export interface InputCmd { seq: number; moveX: number; moveY: number; jump: boolean }
export interface PlayerState { x: number; y: number; vx: number; vy: number }

/** Shared with the server: must be bit-for-bit deterministic for the same inputs. */
export type StepFn = (s: PlayerState, cmd: InputCmd, dt: number) => void;

const RING = 256;                                   // > max inputs in flight (RTT x tick rate)

export class PredictedPlayer {
  state: PlayerState = { x: 0, y: 0, vx: 0, vy: 0 };
  renderOffsetX = 0; renderOffsetY = 0;             // visual-only error smoothing
  private ring: InputCmd[] = new Array(RING);
  private nextSeq = 0; private oldestUnacked = 0;

  constructor(private step: StepFn, private tickDt: number, private send: (cmds: InputCmd[]) => void,
              private snapThreshold = 64, private smoothRate = 15) {}

  /** Called once per fixed tick with the sampled input. */
  tick(moveX: number, moveY: number, jump: boolean) {
    const cmd: InputCmd = { seq: this.nextSeq++, moveX, moveY, jump };
    this.ring[cmd.seq % RING] = cmd;
    this.step(this.state, cmd, this.tickDt);                     // predict immediately
    const from = Math.max(this.oldestUnacked, cmd.seq - 2);      // redundancy: last 3 inputs
    const batch: InputCmd[] = [];
    for (let s = from; s <= cmd.seq; s++) batch.push(this.ring[s % RING]);
    this.send(batch);
  }

  /** Authoritative state for the moment after the server processed input lastProcessedSeq. */
  onServerState(server: PlayerState, lastProcessedSeq: number) {
    const beforeX = this.state.x, beforeY = this.state.y;
    this.state = { ...server };                                  // rewind
    this.oldestUnacked = lastProcessedSeq + 1;
    for (let s = this.oldestUnacked; s < this.nextSeq; s++)      // replay unacknowledged inputs
      this.step(this.state, this.ring[s % RING], this.tickDt);
    const ex = beforeX - this.state.x, ey = beforeY - this.state.y;
    if (Math.hypot(ex, ey) > this.snapThreshold) { this.renderOffsetX = 0; this.renderOffsetY = 0; }   // teleport: just snap
    else { this.renderOffsetX += ex; this.renderOffsetY += ey; }  // keep showing the old spot, then glide
  }

  /** Per rendered frame: decay the visual error (presentation only). */
  renderPosition(dt: number) {
    const k = 1 - Math.exp(-this.smoothRate * dt);
    this.renderOffsetX -= this.renderOffsetX * k; this.renderOffsetY -= this.renderOffsetY * k;
    return { x: this.state.x + this.renderOffsetX, y: this.state.y + this.renderOffsetY };
  }
}`,
        },
        bug: {
          explanation:
            'Overwriting the predicted state with the server state and stopping there discards every input the server has not processed yet, which is always about one round trip of movement. Each update yanks the player backwards and prediction then pushes them forwards again: visible rubber-banding even on a perfect connection. Drop the acknowledged inputs and replay the rest.',
          buggy: {
            language: 'ts',
            filename: 'net_client.ts',
            code: raw`// ❌ Snap to the server: throws away ~RTT worth of inputs -> rubber banding
function onServerState(msg: { state: PlayerState; lastProcessed: number }) {
  local.state = { ...msg.state };
  pending = pending.filter((cmd) => cmd.seq > msg.lastProcessed);
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'net_client.ts',
            code: raw`// ✅ Rewind to the authoritative state, then replay unacknowledged inputs
function onServerState(msg: { state: PlayerState; lastProcessed: number }) {
  local.state = { ...msg.state };
  pending = pending.filter((cmd) => cmd.seq > msg.lastProcessed);
  for (const cmd of pending) step(local.state, cmd, TICK_DT);   // same deterministic step as the server
}`,
          },
        },
      },
      takeaways: [
        'Predict the local player immediately with the same deterministic step the server uses.',
        'Keep unacknowledged inputs; on each authoritative state, rewind and replay them (reconciliation).',
        'Snapping without replay causes rubber-banding; real corrections are smoothed with a decaying render offset.',
        'Predict only what the client can know; let the server decide contested outcomes.',
        'Practice drill: change DELAY_TICKS in Tab 1 to 9 (150 ms each way) and predict the pending buffer size and the input lag without prediction (18 inputs; 18 ticks = 300 ms).',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'game-rollback-lag-comp',
      title: 'Rollback Netcode, Entity Interpolation & Lag Compensation',
      summary: 'How players see a fair, smooth world despite latency: rollback (GGPO-style) that predicts remote inputs and resimulates when the real ones arrive, entity interpolation that renders other players slightly in the past between two snapshots, and server-side lag compensation that rewinds hitboxes to what the shooter actually saw.',
      difficulty: 'Advanced',
      minutes: 28,
      xp: 170,
      analogy:
        "Rollback is writing a story with a friend by post, guessing their next sentence so you can keep writing; when their real sentence arrives and differs, you erase back to that point and rewrite from there. Entity interpolation is watching a live broadcast with a small deliberate delay so the pictures can be smoothed. Lag compensation is a referee replaying the footage from the shooter's point of view to decide whether the shot was fair.",
      intuition: [
        { title: 'Rollback (GGPO)', body: "Peers exchange only inputs. Each frame, simulate immediately using local input plus a prediction of the remote input (usually: same as last frame). When the real remote input for frame f arrives and differs, restore the saved state of frame f, re-apply the correct inputs and resimulate to the present, all within one rendered frame." },
        { title: 'Requirements', body: "The simulation must be deterministic, cheap to snapshot (ring buffer of serialised states) and fast enough to resimulate several frames at once. A small input delay (1–3 frames) reduces how often and how far you roll back." },
        { title: 'Entity interpolation', body: "Other players' positions arrive only in snapshots (for example 20 Hz) and with jitter. Render them at renderTime = now − interpolationDelay (often 100 ms, about two snapshot intervals) and interpolate between the two snapshots around that time. Motion is smooth and always based on real data." },
        { title: 'The cost: you see the past', body: "With interpolation, every remote player you see is ~100 ms plus latency behind where they really are. Aiming at them would always miss on an authoritative server unless the server compensates." },
        { title: 'Lag compensation', body: "The server keeps a history of hitboxes per tick. When a shot arrives, it rewinds targets to the time the shooter saw them (shot time − client latency − interpolation delay), performs the hit test there, and restores. Shooters hit what they aimed at; the cost is occasionally being shot after reaching cover." },
        { title: 'Limits and fairness', body: "Cap how far the server will rewind (for example 200–250 ms) so very laggy players cannot shoot far into the past, and validate the claimed times. Every netcode model is a trade-off between responsiveness, consistency and fairness." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Rollback frame', body: 'Runs every frame on every peer.', flow: ['receive remote inputs; earliest mismatch with a prediction = frame f?', 'if so: load snapshot f, resimulate f..now with corrected inputs', 'save snapshot(now) into the ring buffer', 'predict remote input(now) = last known; simulate now', 'exchange checksums occasionally to detect desyncs'] },
        { kind: 'warning', title: 'Snapshots must be deep copies', body: 'A snapshot that shares arrays or objects with the live state changes when the live state changes, so restoring it restores nothing. Copy into preallocated typed arrays (fast) or serialise; never store references.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'rollback_interp_lagcomp.ts',
          explanation: 'Runnable TypeScript: a two-player deterministic sim where the remote inputs arrive 3 frames late. Rollback with predicted inputs must end in exactly the same state as a simulation with perfect information, with the number of rollbacks asserted. Then entity interpolation renders a remote player 100 ms in the past between 20 Hz snapshots, and server-side lag compensation turns a shot that misses on current positions into the hit the shooter saw.',
          code: raw`//  ROLLBACK                                        ENTITY INTERPOLATION (render 100 ms in the past)
//   frame:  10 11 12 13 14                           snapshots @20 Hz:  s0 ----- s1 ----- s2
//   remote: p  p  p  ?  ?   (p = predicted)          render time:             ^ lerp(s0, s1, t)
//   real input for 11 differs -> load snapshot 11, resimulate 11..14 with corrected inputs
//  LAG COMPENSATION: rewind hitboxes to (shot time - latency - interp delay), test, restore
import assert from 'node:assert/strict';

// ---------- deterministic 2-player sim (integers only) ----------
type State = { p: [number, number]; v: [number, number] };
const step = (s: State, a: number, b: number): State => {
  const v: [number, number] = [s.v[0] + a, s.v[1] + b];
  return { p: [s.p[0] + v[0], s.p[1] + v[1]], v };
};
const FRAMES = 120, REMOTE_DELAY = 3;
const localInputs = Array.from({ length: FRAMES }, (_, f) => (f % 20 < 10 ? 1 : -1));
const remoteInputs = Array.from({ length: FRAMES }, (_, f) => (f % 30 < 15 ? 1 : -1));

let truth: State = { p: [0, 0], v: [0, 0] };
for (let f = 0; f < FRAMES; f++) truth = step(truth, localInputs[f], remoteInputs[f]);

// rollback session
const snapshots: State[] = [];                               // state at the start of frame f
const usedRemote: number[] = [];                             // remote input used for frame f
let state: State = { p: [0, 0], v: [0, 0] }, lastKnownRemote = 0, confirmed = -1, rollbacks = 0, resimulated = 0;
for (let f = 0; f < FRAMES + REMOTE_DELAY; f++) {
  // the real remote input for frame f - REMOTE_DELAY arrives now
  const arrived = f - REMOTE_DELAY;
  if (arrived >= 0 && arrived < FRAMES) {
    confirmed = arrived; lastKnownRemote = remoteInputs[arrived];
    if (usedRemote[arrived] !== remoteInputs[arrived]) {      // misprediction -> roll back
      rollbacks++;
      state = structuredClone(snapshots[arrived]);
      const now = Math.min(f, FRAMES);
      for (let g = arrived; g < now; g++) {
        const r = g <= confirmed ? remoteInputs[g] : lastKnownRemote;   // corrected or re-predicted
        snapshots[g] = structuredClone(state); usedRemote[g] = r;
        state = step(state, localInputs[g], r); resimulated++;
      }
    }
  }
  if (f < FRAMES) {
    snapshots[f] = structuredClone(state);                     // deep copy, never a reference
    usedRemote[f] = lastKnownRemote;                           // predict: repeat the last known input
    state = step(state, localInputs[f], lastKnownRemote);
  }
}
assert.deepEqual(state, truth);                               // identical to perfect information
assert.ok(rollbacks > 0 && rollbacks <= 8);                   // only when the remote input changed
assert.ok(resimulated <= rollbacks * REMOTE_DELAY);

// ---------- entity interpolation ----------
const snaps = [{ t: 0, x: 0 }, { t: 50, x: 10 }, { t: 100, x: 30 }, { t: 150, x: 30 }];   // ms, 20 Hz
function interpolated(nowMs: number, delayMs = 100) {
  const rt = nowMs - delayMs;
  for (let i = 0; i < snaps.length - 1; i++) {
    const a = snaps[i], b = snaps[i + 1];
    if (rt >= a.t && rt <= b.t) return a.x + ((rt - a.t) / (b.t - a.t)) * (b.x - a.x);
  }
  return snaps[rt < 0 ? 0 : snaps.length - 1].x;
}
assert.equal(interpolated(125), 5);                           // render time 25 ms: halfway between s0 and s1
assert.equal(interpolated(175), 20);                          // render time 75 ms: halfway between s1 and s2

// ---------- lag compensation ----------
const history = new Map<number, number>();                    // server tick (ms) -> target x
for (let t = 0; t <= 300; t += 10) history.set(t, t * 0.5);    // target runs right at 500 px/s
const hitAt = (targetX: number, aimX: number) => Math.abs(targetX - aimX) <= 8;   // 16 px wide hitbox
const shotServerTime = 300, latency = 60, interpDelay = 100;
const seenTime = shotServerTime - latency - interpDelay;      // 140 ms: what the shooter saw
const aimX = history.get(seenTime)!;                          // the shooter aimed perfectly at x = 70
assert.equal(hitAt(history.get(shotServerTime)!, aimX), false);   // current position: x = 150, a miss
assert.equal(hitAt(history.get(seenTime)!, aimX), true);         // rewound: the hit the player saw
console.log('rollbacks', rollbacks, 'resimulated frames', resimulated, '| state matches truth | interp x@125ms', interpolated(125), '| lag-comp rewind to', seenTime, 'ms');`,
        },
        production: {
          language: 'ts',
          filename: 'rollback_session.ts',
          explanation: 'Production engine pattern: a GGPO-style RollbackSession over a deterministic game that serialises into a preallocated Float64Array. Snapshots live in a ring buffer of typed arrays (copy, never reference), remote inputs are predicted and confirmed per frame, the earliest misprediction triggers one rollback and resimulation, the session enforces a maximum prediction window, and periodic checksums detect desyncs.',
          code: raw`export interface RollbackGame {
  readonly stateSize: number;                     // number of float64 values in a snapshot
  save(out: Float64Array): void;                  // copy the full state into out
  load(src: Float64Array): void;                  // overwrite the full state from src
  step(localInput: number, remoteInput: number): void;   // deterministic fixed step
}

const RING = 32;

export class RollbackSession {
  private snapshots: Float64Array[];
  private local = new Int32Array(RING); private remote = new Int32Array(RING);
  private remoteConfirmed = new Uint8Array(RING);
  private frame = 0; private lastConfirmedRemote = -1; private lastRemoteValue = 0;
  private pendingRollbackFrom = -1;
  rollbacks = 0;

  constructor(private game: RollbackGame, private maxPrediction = 8, private onChecksum?: (frame: number, sum: number) => void) {
    this.snapshots = Array.from({ length: RING }, () => new Float64Array(game.stateSize));
  }

  /** Network: the real remote input for frame f arrived. */
  addRemoteInput(f: number, input: number) {
    if (f < this.frame - RING + 1) throw new Error('remote input too old: desync');
    const slot = f % RING;
    if (f < this.frame && this.remote[slot] !== input)                 // we guessed wrong for a past frame
      this.pendingRollbackFrom = this.pendingRollbackFrom < 0 ? f : Math.min(this.pendingRollbackFrom, f);
    this.remote[slot] = input; this.remoteConfirmed[slot] = 1;
    if (f > this.lastConfirmedRemote) { this.lastConfirmedRemote = f; this.lastRemoteValue = input; }
  }

  /** Returns false when too far ahead of confirmed remote input (stall instead of predicting further). */
  advance(localInput: number): boolean {
    if (this.frame - this.lastConfirmedRemote > this.maxPrediction) return false;
    if (this.pendingRollbackFrom >= 0) {
      const from = this.pendingRollbackFrom;
      this.pendingRollbackFrom = -1; this.rollbacks++;
      this.game.load(this.snapshots[from % RING]);
      for (let f = from; f < this.frame; f++) this.simulate(f);        // resimulate with corrected inputs
    }
    this.local[this.frame % RING] = localInput;
    this.simulate(this.frame);
    this.frame++;
    return true;
  }

  private simulate(f: number) {
    const slot = f % RING;
    this.game.save(this.snapshots[slot]);                              // copy into the preallocated ring
    if (!this.remoteConfirmed[slot] || f > this.lastConfirmedRemote) {
      this.remote[slot] = this.lastRemoteValue;                        // predict: repeat last known input
      this.remoteConfirmed[slot] = 0;
    }
    this.game.step(this.local[slot], this.remote[slot]);
    if (this.onChecksum && f % 60 === 0 && f <= this.lastConfirmedRemote) {
      const s = this.snapshots[slot]; let h = 0x811c9dc5;              // checksum of a confirmed frame
      const bytes = new Uint8Array(s.buffer, s.byteOffset, s.byteLength);
      for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193); }
      this.onChecksum(f, h >>> 0);                                     // peers compare; mismatch = desync
    }
  }
}`,
        },
        bug: {
          explanation:
            'The snapshot stores references to the live arrays, so every later step mutates the "saved" state too. When a rollback restores the snapshot it restores the current (wrong) state, the resimulation runs on top of it and the peers silently desync. Snapshots must be deep copies: copy into preallocated typed arrays or serialise.',
          buggy: {
            language: 'ts',
            filename: 'snapshot.ts',
            code: raw`// ❌ Shallow snapshot: positions/velocities are the live arrays, so restoring does nothing
function saveState(world: World): Snapshot {
  return { frame: world.frame, positions: world.positions, velocities: world.velocities };
}
function loadState(world: World, s: Snapshot) {
  world.frame = s.frame; world.positions = s.positions; world.velocities = s.velocities;
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'snapshot.ts',
            code: raw`// ✅ Deep copies into preallocated buffers (no allocation per frame)
function saveState(world: World, out: Snapshot) {
  out.frame = world.frame;
  out.positions.set(world.positions);       // Float32Array copy
  out.velocities.set(world.velocities);
}
function loadState(world: World, s: Snapshot) {
  world.frame = s.frame;
  world.positions.set(s.positions);
  world.velocities.set(s.velocities);
}`,
          },
        },
      },
      takeaways: [
        'Rollback predicts remote inputs and resimulates from a saved snapshot when the real input differs.',
        'It needs determinism, cheap deep-copy snapshots in a ring buffer, and a cap on prediction frames.',
        'Entity interpolation renders others ~100 ms in the past between real snapshots for smooth motion.',
        'Lag compensation rewinds hitboxes to what the shooter saw (minus latency and interpolation delay), within a capped window.',
        'Practice drill: set REMOTE_DELAY to 6 in Tab 1, predict how the resimulated frame count changes (up to 6 per rollback) and confirm the final state still equals the truth.',
      ],
    },
  ],
};
