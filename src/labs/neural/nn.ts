/**
 * A tiny fully-connected neural network in pure TypeScript.
 *   input(2) → [tanh hidden]* → sigmoid(1)
 * Trained with full-batch gradient descent on binary cross-entropy.
 * Every line maps 1:1 to the math in the Backpropagation lesson.
 */

export interface Sample {
  x: number; // [-1, 1]
  y: number; // [-1, 1]
  label: 0 | 1; // 1 = cyan, 0 = crimson
}

/** Small seeded PRNG (mulberry32) so resets are reproducible. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const EPS = 1e-7;

export class MLP {
  readonly sizes: number[];
  /** W[l] is (sizes[l+1] × sizes[l]) row-major; b[l] has sizes[l+1] entries. */
  readonly W: Float64Array[] = [];
  readonly b: Float64Array[] = [];
  private gW: Float64Array[] = [];
  private gb: Float64Array[] = [];
  private acts: Float64Array[] = [];
  private deltas: Float64Array[] = [];
  epoch = 0;

  constructor(hidden: number[], seed = 1) {
    this.sizes = [2, ...hidden, 1];
    const rand = rng(seed);
    for (let l = 0; l < this.sizes.length - 1; l++) {
      const nIn = this.sizes[l];
      const nOut = this.sizes[l + 1];
      const scale = Math.sqrt(2 / (nIn + nOut)); // Xavier/Glorot
      const w = new Float64Array(nIn * nOut);
      for (let i = 0; i < w.length; i++) w[i] = (rand() * 2 - 1) * scale * 1.7;
      this.W.push(w);
      this.b.push(new Float64Array(nOut));
      this.gW.push(new Float64Array(nIn * nOut));
      this.gb.push(new Float64Array(nOut));
    }
    this.acts = this.sizes.map((n) => new Float64Array(n));
    this.deltas = this.sizes.map((n) => new Float64Array(n));
  }

  get paramCount(): number {
    return this.W.reduce((n, w) => n + w.length, 0) + this.b.reduce((n, b) => n + b.length, 0);
  }

  /** Forward pass; fills this.acts and returns P(label = 1). */
  predict(x: number, y: number): number {
    const acts = this.acts;
    acts[0][0] = x;
    acts[0][1] = y;
    const L = this.W.length;
    for (let l = 0; l < L; l++) {
      const inp = acts[l];
      const out = acts[l + 1];
      const w = this.W[l];
      const b = this.b[l];
      const nIn = inp.length;
      for (let j = 0; j < out.length; j++) {
        let z = b[j];
        const row = j * nIn;
        for (let i = 0; i < nIn; i++) z += w[row + i] * inp[i];
        out[j] = l === L - 1 ? sigmoid(z) : Math.tanh(z);
      }
    }
    return acts[L][0];
  }

  /** One full-batch gradient-descent step. Returns mean BCE loss before the update. */
  trainStep(data: Sample[], lr: number): number {
    if (!data.length) return 0;
    const L = this.W.length;
    for (let l = 0; l < L; l++) {
      this.gW[l].fill(0);
      this.gb[l].fill(0);
    }
    let loss = 0;

    for (const s of data) {
      const p = this.predict(s.x, s.y);
      const q = Math.min(1 - EPS, Math.max(EPS, p));
      loss += -(s.label * Math.log(q) + (1 - s.label) * Math.log(1 - q));

      // Output delta for sigmoid + BCE: ∂L/∂z = p − y
      this.deltas[L][0] = p - s.label;

      // Backpropagate
      for (let l = L - 1; l >= 0; l--) {
        const inp = this.acts[l];
        const dOut = this.deltas[l + 1];
        const w = this.W[l];
        const nIn = inp.length;
        const gW = this.gW[l];
        const gb = this.gb[l];
        for (let j = 0; j < dOut.length; j++) {
          const d = dOut[j];
          gb[j] += d;
          const row = j * nIn;
          for (let i = 0; i < nIn; i++) gW[row + i] += d * inp[i];
        }
        if (l > 0) {
          const dIn = this.deltas[l];
          for (let i = 0; i < nIn; i++) {
            let sum = 0;
            for (let j = 0; j < dOut.length; j++) sum += w[j * nIn + i] * dOut[j];
            const a = inp[i];
            dIn[i] = sum * (1 - a * a); // tanh'(z) = 1 − tanh(z)²
          }
        }
      }
    }

    const n = data.length;
    for (let l = 0; l < L; l++) {
      const w = this.W[l], gW = this.gW[l], b = this.b[l], gb = this.gb[l];
      for (let i = 0; i < w.length; i++) w[i] -= (lr * gW[i]) / n;
      for (let j = 0; j < b.length; j++) b[j] -= (lr * gb[j]) / n;
    }
    this.epoch++;
    return loss / n;
  }

  accuracy(data: Sample[]): number {
    if (!data.length) return 0;
    let ok = 0;
    for (const s of data) if ((this.predict(s.x, s.y) >= 0.5 ? 1 : 0) === s.label) ok++;
    return ok / data.length;
  }
}

// ---------------------------------------------------------------------------
// Dataset presets
// ---------------------------------------------------------------------------
export type Preset = 'xor' | 'circle' | 'spiral' | 'blobs';

export function makePreset(kind: Preset, seed = 7): Sample[] {
  const r = rng(seed);
  const gauss = () => {
    const u = Math.max(r(), 1e-9), v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const clamp = (v: number) => Math.max(-0.97, Math.min(0.97, v));
  const out: Sample[] = [];

  if (kind === 'blobs') {
    for (let i = 0; i < 80; i++) {
      const label = (i % 2) as 0 | 1;
      const c = label ? [0.45, 0.4] : [-0.45, -0.35];
      out.push({ x: clamp(c[0] + gauss() * 0.2), y: clamp(c[1] + gauss() * 0.2), label });
    }
  } else if (kind === 'xor') {
    for (let i = 0; i < 120; i++) {
      const x = r() * 1.9 - 0.95, y = r() * 1.9 - 0.95;
      if (Math.abs(x) < 0.08 || Math.abs(y) < 0.08) continue;
      out.push({ x, y, label: (x * y > 0 ? 1 : 0) as 0 | 1 });
    }
  } else if (kind === 'circle') {
    for (let i = 0; i < 140; i++) {
      const inner = i % 2 === 0;
      const rad = inner ? r() * 0.38 : 0.6 + r() * 0.32;
      const t = r() * Math.PI * 2;
      out.push({ x: clamp(Math.cos(t) * rad), y: clamp(Math.sin(t) * rad), label: inner ? 1 : 0 });
    }
  } else {
    const n = 70;
    for (let k = 0; k < 2; k++) {
      for (let i = 0; i < n; i++) {
        const t = (i / n) * 1.75 * Math.PI;
        const rad = (i / n) * 0.9 + 0.05;
        const ang = t + k * Math.PI;
        out.push({ x: clamp(Math.cos(ang) * rad + gauss() * 0.025), y: clamp(Math.sin(ang) * rad + gauss() * 0.025), label: k as 0 | 1 });
      }
    }
  }
  return out;
}
