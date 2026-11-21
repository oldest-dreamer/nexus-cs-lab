import type { Module } from '../../types';

const raw = String.raw;

export const mathModule: Module = {
  id: 'game-math',
  title: 'Game Mathematics: Vectors, Matrices & Quaternions',
  level: 'Beginner',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'game-vectors-dot-cross',
      title: 'Vectors, Normalization, Dot & Cross Products',
      summary: 'The three vector tools behind most gameplay code: normalize to fix the √2 diagonal speed exploit, dot products for vision cones, lighting and projection, and cross products for normals, winding and point-in-triangle tests.',
      difficulty: 'Beginner',
      minutes: 22,
      xp: 100,
      analogy:
        "A vector is an arrow: it has a direction and a length. Normalising is trimming every arrow to length 1 so it only says which way, not how hard. The dot product asks \"how much do these two arrows agree?\" (1 = same way, 0 = perpendicular, −1 = opposite). The cross product asks \"which way does this pair turn?\" and builds a new arrow standing straight up out of the plane they share.",
      intuition: [
        { title: 'Length and normalisation', body: "|v| = √(x² + y²). Pressing right and up together gives (1, 1), whose length is √2 ≈ 1.414: diagonal movement is 41% faster than straight movement. Normalise the input direction (divide by its length, guarding against zero) before multiplying by speed." },
        { title: 'Dot product', body: "a·b = aₓbₓ + a_yb_y = |a||b| cos θ. For unit vectors it is simply cos θ. Uses: is the player inside an enemy's 90° vision cone? (`dot(facing, toPlayer) ≥ cos 45°`); diffuse lighting (`max(0, n·l)`); is the target in front or behind (sign)." },
        { title: 'Projection', body: "The component of v along a unit axis u is (v·u)u. Subtracting the component along a wall's normal from the velocity lets characters slide along walls instead of stopping dead." },
        { title: '2D cross product (signed area)', body: "cross(a, b) = aₓb_y − a_ybₓ. Positive means b is counter-clockwise from a, negative clockwise. It gives twice the signed area of triangle (o, a, b), polygon winding order, and point-in-triangle tests (same sign for all three edges)." },
        { title: '3D cross product', body: "a × b is perpendicular to both, with length |a||b| sin θ. The normal of a triangle (p0, p1, p2) is normalize((p1 − p0) × (p2 − p0)); its direction depends on the winding, which is how GPUs decide front vs back faces." },
        { title: 'Avoid allocation in hot loops', body: "Creating a new vector object per operation per entity per frame produces garbage and GC stutter. Engines use out-parameters or typed arrays (`out = normalize(out, a)`), covered in the production tab." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Which tool answers which question', body: 'Most gameplay geometry reduces to these four operations.', flow: ['How far / how fast? → length', 'Which way only? → normalize', 'Facing / in cone / light intensity? → dot', 'Left or right / winding / normal? → cross'] },
        { kind: 'tip', title: 'Compare squared lengths', body: 'For range checks, compare |v|² with r² instead of |v| with r: it avoids a square root and gives the same answer.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'vectors_from_scratch.ts',
          explanation: 'Runnable TypeScript: the √2 diagonal speed bug and its normalised fix, dot-product vision cones and Lambert lighting, wall sliding by projection, 2D cross products for winding and point-in-triangle tests, and a 3D triangle normal. All values asserted.',
          code: raw`//          y                        dot(a,b) = |a||b|cos(theta)
//          ^   (1,1) |v| = 1.414     cross2(a,b) = ax*by - ay*bx   (> 0: b is counter-clockwise of a)
//          |  /                       vision cone 90 deg: dot(facing, toTarget) >= cos(45 deg) = 0.7071
//          | /  normalize -> (0.707, 0.707) |v| = 1
//          +---------> x
import assert from 'node:assert/strict';

type V2 = { x: number; y: number };
type V3 = [number, number, number];
const len = (v: V2) => Math.hypot(v.x, v.y);
const norm = (v: V2): V2 => { const l = len(v); return l > 1e-9 ? { x: v.x / l, y: v.y / l } : { x: 0, y: 0 }; };
const dot = (a: V2, b: V2) => a.x * b.x + a.y * b.y;
const cross2 = (a: V2, b: V2) => a.x * b.y - a.y * b.x;
const sub = (a: V2, b: V2): V2 => ({ x: a.x - b.x, y: a.y - b.y });
const close = (a: number, b: number, eps = 1e-4) => Math.abs(a - b) < eps;

// 1) the diagonal exploit
const SPEED = 200;
const raw2 = { x: 1, y: 1 };                                  // right + up held together
assert.ok(close(len({ x: raw2.x * SPEED, y: raw2.y * SPEED }), 282.8427));   // 41% faster
const fixed = norm(raw2);
assert.ok(close(len({ x: fixed.x * SPEED, y: fixed.y * SPEED }), 200));
assert.deepEqual(norm({ x: 0, y: 0 }), { x: 0, y: 0 });       // no NaN when idle

// 2) dot product: vision cone and lighting
const facing = { x: 1, y: 0 };
const inCone = (target: V2, eye: V2, halfAngleDeg: number) =>
  dot(facing, norm(sub(target, eye))) >= Math.cos((halfAngleDeg * Math.PI) / 180);
assert.equal(inCone({ x: 10, y: 5 }, { x: 0, y: 0 }, 45), true);    // ~26.6 deg off-axis
assert.equal(inCone({ x: 5, y: 10 }, { x: 0, y: 0 }, 45), false);   // ~63.4 deg off-axis
assert.equal(inCone({ x: -10, y: 0 }, { x: 0, y: 0 }, 45), false);  // behind
const lambert = (n: V2, toLight: V2) => Math.max(0, dot(norm(n), norm(toLight)));
assert.ok(close(lambert({ x: 0, y: 1 }, { x: 1, y: 1 }), 0.7071));
assert.equal(lambert({ x: 0, y: 1 }, { x: 0, y: -1 }), 0);         // light behind the surface

// 3) projection: slide along a wall instead of stopping
const wallNormal = { x: -1, y: 0 };                           // wall on the right, facing left
const vel = { x: 300, y: 100 };
const into = dot(vel, wallNormal);                            // -300: moving into the wall
const slide = into < 0 ? { x: vel.x - into * wallNormal.x, y: vel.y - into * wallNormal.y } : vel;
assert.deepEqual(slide, { x: 0, y: 100 });

// 4) 2D cross: winding, signed area, point in triangle
const A = { x: 0, y: 0 }, B = { x: 4, y: 0 }, C = { x: 0, y: 3 };
assert.equal(cross2(sub(B, A), sub(C, A)) / 2, 6);            // +6: counter-clockwise, area 6
assert.equal(cross2(sub(C, A), sub(B, A)) / 2, -6);           // reversed winding
const inTri = (p: V2) => {
  const s1 = cross2(sub(B, A), sub(p, A)), s2 = cross2(sub(C, B), sub(p, B)), s3 = cross2(sub(A, C), sub(p, C));
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
};
assert.deepEqual([inTri({ x: 1, y: 1 }), inTri({ x: 3, y: 3 })], [true, false]);

// 5) 3D cross: triangle normal
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
assert.deepEqual(cross3([1, 0, 0], [0, 1, 0]), [0, 0, 1]);   // x cross y = z (right-handed)
console.log('diagonal speed raw', len({ x: 200, y: 200 }).toFixed(1), '-> normalized', len({ x: fixed.x * 200, y: fixed.y * 200 }).toFixed(1));`,
        },
        production: {
          language: 'ts',
          filename: 'vec2.ts',
          explanation: 'Production engine pattern: gl-matrix-style vector functions that write into out-parameters (zero allocations per frame), and a batched vision-cone check over thousands of enemies stored as Struct-of-Arrays Float32Arrays, using squared distances and a precomputed cosine.',
          code: raw`export type Vec2 = Float32Array;                         // [x, y]
export const create = (x = 0, y = 0): Vec2 => new Float32Array([x, y]);

export function normalize(out: Vec2, a: Vec2): Vec2 {
  const l2 = a[0] * a[0] + a[1] * a[1];
  if (l2 > 1e-12) { const inv = 1 / Math.sqrt(l2); out[0] = a[0] * inv; out[1] = a[1] * inv; }
  else { out[0] = 0; out[1] = 0; }                      // idle input stays zero, never NaN
  return out;
}
export const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];
export const cross = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0];

// ---- batched vision check over SoA arrays (no objects, no allocations) ----
export interface Enemies {
  count: number;
  x: Float32Array; y: Float32Array;                     // positions
  fx: Float32Array; fy: Float32Array;                   // unit facing vectors
  sees: Uint8Array;                                     // output flags
}

export function updateVision(e: Enemies, px: number, py: number, range: number, halfAngleRad: number) {
  const range2 = range * range;
  const cosHalf = Math.cos(halfAngleRad);               // computed once per call
  for (let i = 0; i < e.count; i++) {
    const dx = px - e.x[i], dy = py - e.y[i];
    const d2 = dx * dx + dy * dy;
    if (d2 > range2 || d2 === 0) { e.sees[i] = d2 === 0 ? 1 : 0; continue; }   // cheap reject first
    // dot(facing, dir/|dir|) >= cosHalf  <=>  dot(facing, dir) >= cosHalf * |dir|  (one sqrt only)
    e.sees[i] = e.fx[i] * dx + e.fy[i] * dy >= cosHalf * Math.sqrt(d2) ? 1 : 0;
  }
}

// ---- movement from input with the diagonal fix ----
const dir = create(), tmp = create();                   // module-level scratch vectors
export function moveFromInput(pos: Vec2, left: boolean, right: boolean, up: boolean, down: boolean, speed: number, dt: number) {
  tmp[0] = (right ? 1 : 0) - (left ? 1 : 0);
  tmp[1] = (down ? 1 : 0) - (up ? 1 : 0);
  normalize(dir, tmp);
  pos[0] += dir[0] * speed * dt;
  pos[1] += dir[1] * speed * dt;
}`,
        },
        bug: {
          explanation:
            'Adding the horizontal and vertical input directly gives the vector (1, 1) when two keys are held, whose length is √2. Diagonal movement is therefore 41% faster than straight movement, which speedrunners and competitive players exploit. Normalise the direction (guarding against the zero vector) before applying speed.',
          buggy: {
            language: 'ts',
            filename: 'move.ts',
            code: raw`// ❌ Diagonal movement is sqrt(2) = 1.41x faster
function move(p: Player, input: Input, dt: number) {
  const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  p.x += dx * p.speed * dt;
  p.y += dy * p.speed * dt;
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'move.ts',
            code: raw`// ✅ Normalised direction: the same speed in all 8 directions
function move(p: Player, input: Input, dt: number) {
  const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const len = Math.hypot(dx, dy);
  if (len === 0) return;                       // no input: avoid dividing by zero
  p.x += (dx / len) * p.speed * dt;
  p.y += (dy / len) * p.speed * dt;
}`,
          },
        },
      },
      takeaways: [
        'Normalise input directions: (1, 1) has length √2, so un-normalised diagonals are 41% faster.',
        'Dot product = cos θ for unit vectors: vision cones, lighting, facing tests, projection and wall sliding.',
        '2D cross product = signed area: winding order, left/right tests, point-in-triangle; 3D cross gives normals.',
        'Compare squared distances and avoid per-frame vector allocations in hot loops.',
        'Practice drill: is a target at (6, 8) inside a 60° cone (±30°) facing (1, 0)? (cos θ = 0.6 < cos 30° = 0.866, so no.)',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'game-matrices-mvp',
      title: 'Transforms & the Model-View-Projection Matrix',
      summary: 'How a vertex travels from a model\'s local space to a pixel: 4×4 homogeneous matrices, TRS composition order, the view (camera) matrix, the perspective projection with WebGPU\'s 0–1 depth, and the perspective divide.',
      difficulty: 'Intermediate',
      minutes: 25,
      xp: 120,
      analogy:
        "A vertex goes through a chain of map conversions. Its coordinates start relative to its own model (\"2 cm left of the sword's handle\"), then are converted to the world (\"by the castle door\"), then to the camera (\"slightly left of where I'm looking\"), then squashed onto the screen like a photograph, where far things shrink. Each conversion is one matrix; multiplying them together gives one combined conversion.",
      intuition: [
        { title: 'Homogeneous coordinates', body: "A 3D point is written (x, y, z, 1) and a direction (x, y, z, 0). The extra coordinate lets a single 4×4 matrix express rotation, scale and translation (translation only affects points, w = 1, never directions)." },
        { title: 'Order matters: TRS', body: "The model matrix is usually M = T · R · S: scale first, then rotate, then translate (read right to left when applied to a column vector). Rotating after translating would swing the object around the world origin instead of around its own centre." },
        { title: 'View matrix', body: "The camera is just the inverse of the camera's own transform: moving the camera right is the same as moving the whole world left. `lookAt(eye, target, up)` builds it from an orthonormal basis." },
        { title: 'Projection', body: "A perspective matrix maps the view frustum into clip space and puts −z into w. After the GPU divides x, y, z by w (the perspective divide), visible points land in normalized device coordinates: x, y ∈ [−1, 1], and depth z ∈ [0, 1] in WebGPU/Vulkan/D3D (OpenGL uses [−1, 1])." },
        { title: 'MVP and conventions', body: "clip = P · V · M · v. Compute P·V once per frame per camera and M per object. Know your conventions: column-major storage (WebGPU/WGSL, gl-matrix), right-handed view space looking down −z, and the depth range of your API." },
        { title: 'Normals need special care', body: "Under non-uniform scale, normals must be transformed by the inverse-transpose of the model matrix's upper 3×3, otherwise lighting looks wrong on stretched objects." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Coordinate spaces', body: 'Each arrow is a matrix (or the fixed-function divide and viewport mapping).', flow: ['model space (x,y,z,1)', '× Model → world space', '× View → camera space', '× Projection → clip space', '÷ w → NDC (x,y ∈ [−1,1], z ∈ [0,1])', 'viewport → pixels'] },
        { kind: 'tip', title: 'Debug with one known point', body: 'When nothing appears on screen, push one vertex through your matrices on the CPU and print each stage: if NDC is outside [−1, 1] or z is outside [0, 1], the bug is in that matrix or in the multiplication order.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'mvp_from_scratch.ts',
          explanation: 'Runnable TypeScript with column-major 4×4 matrices (the WebGPU/WGSL layout): TRS composition and why order matters, a lookAt view matrix, a WebGPU-style perspective matrix whose near and far planes map to depth 0 and 1, and a full MVP + perspective divide + viewport mapping of a vertex to pixel coordinates. All asserted.',
          code: raw`//  VERTEX JOURNEY (column vectors, column-major storage)
//
//   local (1,0,0,1) --M=T*R*S--> world --V=lookAt--> view --P--> clip (x,y,z,w)
//        --> NDC = clip.xyz / w  (x,y in [-1,1], z in [0,1])  --> pixels (viewport)
//   near plane -> depth 0, far plane -> depth 1   (WebGPU / Vulkan / D3D convention)
import assert from 'node:assert/strict';

type M4 = Float64Array;                                   // 16 numbers, column-major: m[col*4 + row]
const ident = (): M4 => { const m = new Float64Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; };
function mul(a: M4, b: M4): M4 {                          // a * b
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
const apply = (m: M4, v: number[]) => [0, 1, 2, 3].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * v[3]);
const translate = (x: number, y: number, z: number) => { const m = ident(); m[12] = x; m[13] = y; m[14] = z; return m; };
const scale = (s: number) => { const m = ident(); m[0] = m[5] = m[10] = s; return m; };
const rotZ = (a: number) => { const m = ident(); m[0] = Math.cos(a); m[1] = Math.sin(a); m[4] = -Math.sin(a); m[5] = Math.cos(a); return m; };
const round = (v: number[]) => v.map((x) => Math.round(x * 1e6) / 1e6 + 0);

// 1) TRS order: scale 2, rotate 90 deg, then translate (10,0,0)
const T = translate(10, 0, 0), R = rotZ(Math.PI / 2), S = scale(2);
assert.deepEqual(round(apply(mul(T, mul(R, S)), [1, 0, 0, 1])), [10, 2, 0, 1]);   // around its own centre
assert.deepEqual(round(apply(mul(R, mul(T, S)), [1, 0, 0, 1])), [0, 12, 0, 1]);   // swung around the origin
assert.deepEqual(round(apply(T, [1, 0, 0, 0])), [1, 0, 0, 0]);                      // directions ignore translation

// 2) view matrix: camera at (0,0,5) looking at the origin (right-handed, looks down -z)
function lookAt(eye: number[], target: number[], up: number[]): M4 {
  const f = norm3(sub3(target, eye)), s = norm3(cross3(f, up)), u = cross3(s, f);
  const m = ident();
  m[0] = s[0]; m[4] = s[1]; m[8] = s[2];
  m[1] = u[0]; m[5] = u[1]; m[9] = u[2];
  m[2] = -f[0]; m[6] = -f[1]; m[10] = -f[2];
  m[12] = -dot3(s, eye); m[13] = -dot3(u, eye); m[14] = dot3(f, eye);
  return m;
}
function sub3(a: number[], b: number[]) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dot3(a: number[], b: number[]) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross3(a: number[], b: number[]) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm3(a: number[]) { const l = Math.hypot(a[0], a[1], a[2]); return a.map((x) => x / l); }
const V = lookAt([0, 0, 5], [0, 0, 0], [0, 1, 0]);
assert.deepEqual(round(apply(V, [0, 0, 0, 1])), [0, 0, -5, 1]);           // origin is 5 units in front

// 3) perspective for WebGPU (depth 0..1)
function perspective(fovy: number, aspect: number, near: number, far: number): M4 {
  const f = 1 / Math.tan(fovy / 2), m = new Float64Array(16);
  m[0] = f / aspect; m[5] = f; m[10] = far / (near - far); m[11] = -1; m[14] = (near * far) / (near - far);
  return m;
}
const P = perspective(Math.PI / 2, 16 / 9, 0.1, 100);
const ndcZ = (zView: number) => { const c = apply(P, [0, 0, zView, 1]); return c[2] / c[3]; };
assert.ok(Math.abs(ndcZ(-0.1)) < 1e-12 && Math.abs(ndcZ(-100) - 1) < 1e-12);

// 4) full MVP to pixels on a 1920x1080 viewport
const MVP = mul(P, mul(V, translate(1, 1, 0)));
const clip = apply(MVP, [0, 0, 0, 1]);
const ndc = [clip[0] / clip[3], clip[1] / clip[3], clip[2] / clip[3]];
const px = [(ndc[0] * 0.5 + 0.5) * 1920, (1 - (ndc[1] * 0.5 + 0.5)) * 1080];   // y flips: NDC up, pixels down
assert.deepEqual(round(ndc.slice(0, 2)), [0.1125, 0.2]);
assert.deepEqual(round(px), [1068, 432]);
console.log('clip', round(clip), '| ndc', round(ndc), '| pixel', round(px));`,
        },
        production: {
          language: 'c',
          filename: 'transform.hpp',
          explanation: 'Production C++20 engine header (compiled with g++ -Wall -Werror): a column-major Mat4 matching WGSL\'s mat4x4f layout, a WebGPU-convention perspective (depth 0–1), TRS composition, and a cache-friendly batch that transforms positions stored as Struct-of-Arrays with a precomputed view-projection.',
          code: raw`#ifndef NEXUS_TRANSFORM_HPP
#define NEXUS_TRANSFORM_HPP
// Column-major 4x4: m[col * 4 + row], identical to WGSL mat4x4<f32> memory layout.
#include <array>
#include <cmath>
#include <cstddef>
#include <span>

struct Vec3 { float x, y, z; };

struct Mat4 {
  std::array<float, 16> m{};
  static constexpr Mat4 identity() { Mat4 r; r.m[0] = r.m[5] = r.m[10] = r.m[15] = 1.0f; return r; }
  float& at(int col, int row) { return m[static_cast<std::size_t>(col * 4 + row)]; }
  float at(int col, int row) const { return m[static_cast<std::size_t>(col * 4 + row)]; }
};

inline Mat4 operator*(const Mat4& a, const Mat4& b) {
  Mat4 r;
  for (int c = 0; c < 4; ++c)
    for (int row = 0; row < 4; ++row) {
      float s = 0.0f;
      for (int k = 0; k < 4; ++k) s += a.at(k, row) * b.at(c, k);
      r.at(c, row) = s;
    }
  return r;
}

// Right-handed, camera looks down -z, depth mapped to [0, 1] (WebGPU / Vulkan / D3D)
inline Mat4 perspective(float fovyRad, float aspect, float zNear, float zFar) {
  const float f = 1.0f / std::tan(fovyRad * 0.5f);
  Mat4 r;
  r.at(0, 0) = f / aspect;
  r.at(1, 1) = f;
  r.at(2, 2) = zFar / (zNear - zFar);
  r.at(2, 3) = -1.0f;                                   // w_clip = -z_view
  r.at(3, 2) = (zNear * zFar) / (zNear - zFar);
  return r;
}

// Model matrix = T * R(yaw around Y) * S : scale, then rotate, then translate
inline Mat4 trs(Vec3 t, float yawRad, float s) {
  const float c = std::cos(yawRad), sn = std::sin(yawRad);
  Mat4 r = Mat4::identity();
  r.at(0, 0) = c * s;  r.at(0, 2) = -sn * s;
  r.at(1, 1) = s;
  r.at(2, 0) = sn * s; r.at(2, 2) = c * s;
  r.at(3, 0) = t.x;    r.at(3, 1) = t.y;   r.at(3, 2) = t.z;
  return r;
}

// Struct-of-Arrays batch: inputs and outputs are contiguous float streams (SIMD/cache friendly)
struct PositionsSoA { std::span<const float> x, y, z; };
struct ClipSoA { std::span<float> x, y, z, w; };

inline void transformBatch(const Mat4& viewProj, const PositionsSoA& in, ClipSoA out) {
  const auto& m = viewProj.m;
  const std::size_t n = in.x.size();
  for (std::size_t i = 0; i < n; ++i) {
    const float px = in.x[i], py = in.y[i], pz = in.z[i];
    out.x[i] = m[0] * px + m[4] * py + m[8]  * pz + m[12];
    out.y[i] = m[1] * px + m[5] * py + m[9]  * pz + m[13];
    out.z[i] = m[2] * px + m[6] * py + m[10] * pz + m[14];
    out.w[i] = m[3] * px + m[7] * py + m[11] * pz + m[15];
  }
}

#endif  // NEXUS_TRANSFORM_HPP`,
        },
        bug: {
          explanation:
            'Matrix multiplication is not commutative. Composing the model matrix as translate first and rotate second (R · T) rotates the already-moved object around the world origin, so every rotating object orbits the centre of the level instead of spinning in place. Compose as T · R · S (and the full chain as P · V · M) for column vectors.',
          buggy: {
            language: 'ts',
            filename: 'transform.ts',
            code: raw`// ❌ Rotation applied after translation: the turret orbits the world origin
const model = mul(rotateY(turret.yaw), mul(translate(turret.x, 0, turret.z), scale(turret.size)));
const mvp = mul(model, mul(view, proj));     // and the chain is reversed too`,
          },
          fixed: {
            language: 'ts',
            filename: 'transform.ts',
            code: raw`// ✅ T * R * S for the model; P * V * M for the chain (column vectors)
const model = mul(translate(turret.x, 0, turret.z), mul(rotateY(turret.yaw), scale(turret.size)));
const viewProj = mul(proj, view);            // once per frame per camera
const mvp = mul(viewProj, model);            // once per object`,
          },
        },
      },
      takeaways: [
        'Homogeneous 4×4 matrices combine rotation, scale and translation; points use w = 1, directions w = 0.',
        'Compose M = T·R·S and clip = P·V·M for column vectors; order changes the result.',
        'The view matrix is the inverse camera transform; perspective puts −z in w for the divide.',
        'WebGPU maps depth to [0, 1]; WGSL matrices are column-major.',
        'Practice drill: with Tab 1\'s P, find the NDC depth of a point 1 unit in front of the camera (z_view = −1): about 0.9009, showing how most depth precision is spent close to the near plane.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'game-quaternions',
      title: 'Euler Angles, Gimbal Lock & Quaternions',
      summary: 'Why yaw/pitch/roll angles lose a degree of freedom at ±90° pitch, how unit quaternions represent any rotation without that singularity, and how to compose, apply and smoothly interpolate rotations with slerp.',
      difficulty: 'Advanced',
      minutes: 25,
      xp: 140,
      analogy:
        "Euler angles are three nested rings of a gyroscope. Turn the middle ring by 90° and two rings line up: turning either of them now does the same thing, and one direction of rotation has simply vanished. That is gimbal lock. A quaternion is like describing a rotation as \"spin this much around this one axis\", with no rings to line up, so no direction ever disappears.",
      intuition: [
        { title: 'Euler angles', body: "Yaw, pitch and roll applied in a fixed order (for example Z·Y·X). Intuitive for editors and simple cameras, but the representation has singularities and interpolating the three angles separately produces wobbly, unnatural paths." },
        { title: 'Gimbal lock', body: "With Z·Y·X order and pitch = 90°, yaw and roll rotate around the same world axis. Only their difference matters: (yaw 30°, roll 10°) and (yaw 40°, roll 20°) produce the identical orientation, so one degree of freedom is lost." },
        { title: 'Quaternions', body: "A rotation of angle θ about unit axis n is q = (n·sin(θ/2), cos(θ/2)) = (x, y, z, w). Unit quaternions cover every rotation with no singularity, compose by multiplication (q2·q1 applies q1 first), and rotate a vector by q·v·q⁻¹." },
        { title: 'Double cover and normalisation', body: "q and −q represent the same rotation. Renormalise after many multiplications to stop floating-point drift from turning a rotation into a scaling." },
        { title: 'Slerp', body: "Spherical linear interpolation moves at constant angular speed along the shortest arc between two orientations. If dot(q1, q2) < 0, negate one first, otherwise the interpolation takes the long way round (nearly 360°)." },
        { title: 'When to use which', body: "Store and interpolate orientations as quaternions (animation, physics, networking). Convert to matrices for the GPU. Expose Euler angles only in editors or for constrained cameras (clamp pitch to ±89°)." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Rotation representations', body: 'Each has a job; convert at the boundaries.', flow: ['editor / FPS camera → Euler (clamped pitch)', 'simulation / animation / network → unit quaternion', 'blend → slerp (shortest path)', 'GPU → 3×3 / 4×4 matrix'] },
        { kind: 'warning', title: 'Normalise after integration', body: 'Integrating angular velocity into a quaternion every physics step slowly denormalises it. Renormalise each step (cheap) or objects slowly distort.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'quaternions_from_scratch.ts',
          explanation: 'Runnable TypeScript: proof of gimbal lock (two different yaw/roll pairs at 90° pitch give the same rotation matrix), quaternions from axis-angle, composition and vector rotation checked against known results, the double cover, and slerp along the shortest arc with constant angular speed. All asserted.',
          code: raw`//  GIMBAL LOCK (Z*Y*X order, pitch = 90 deg)
//
//    yaw ring  ( Z )  --\
//                        >  aligned: (yaw 30, roll 10) == (yaw 40, roll 20)   -> a lost axis
//    roll ring ( X )  --/
//   quaternion q = (axis * sin(theta/2), cos(theta/2))  ->  no rings, no lost axis
import assert from 'node:assert/strict';

type M3 = number[][];
const d = Math.PI / 180;
const mm = (A: M3, B: M3): M3 => A.map((row, i) => B[0].map((_, j) => row.reduce((s, _v, k) => s + A[i][k] * B[k][j], 0)));
const Rx = (a: number): M3 => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
const Ry = (a: number): M3 => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
const Rz = (a: number): M3 => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
const euler = (yaw: number, pitch: number, roll: number) => mm(mm(Rz(yaw * d), Ry(pitch * d)), Rx(roll * d));
const sameM = (A: M3, B: M3) => A.every((r, i) => r.every((v, j) => Math.abs(v - B[i][j]) < 1e-9));

assert.equal(sameM(euler(30, 90, 10), euler(40, 90, 20)), true);    // gimbal lock: only yaw - roll matters
assert.equal(sameM(euler(30, 45, 10), euler(40, 45, 20)), false);   // away from 90 deg the axes are independent

// quaternions (x, y, z, w)
type Q = [number, number, number, number];
const fromAxisAngle = (ax: number[], deg: number): Q => { const h = (deg * d) / 2, s = Math.sin(h); return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(h)]; };
const qmul = (a: Q, b: Q): Q => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const conj = (q: Q): Q => [-q[0], -q[1], -q[2], q[3]];
const rotate = (q: Q, v: number[]) => { const r = qmul(qmul(q, [v[0], v[1], v[2], 0]), conj(q)); return [r[0], r[1], r[2]]; };
const near = (a: number[], b: number[]) => a.every((x, i) => Math.abs(x - b[i]) < 1e-9);

const yaw90 = fromAxisAngle([0, 1, 0], 90);
assert.ok(near(rotate(yaw90, [1, 0, 0]), [0, 0, -1]));              // +x turns to -z (right-handed, around +y)
const pitch90 = fromAxisAngle([1, 0, 0], 90);
const both = qmul(pitch90, yaw90);                                   // yaw first, then pitch
assert.ok(near(rotate(both, [1, 0, 0]), rotate(pitch90, rotate(yaw90, [1, 0, 0]))));
assert.ok(near(rotate(both.map((x) => -x) as Q, [1, 0, 0]), rotate(both, [1, 0, 0])));   // q and -q: same rotation
assert.ok(Math.abs(Math.hypot(...both) - 1) < 1e-12);                // still unit length

// slerp along the shortest arc
function slerp(a: Q, b: Q, t: number): Q {
  let cos = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  if (cos < 0) { b = b.map((x) => -x) as Q; cos = -cos; }           // take the short way round
  if (cos > 0.9995) return a.map((x, i) => x + (b[i] - x) * t) as Q; // nearly equal: lerp is fine
  const th = Math.acos(cos), s = Math.sin(th);
  return a.map((x, i) => (Math.sin((1 - t) * th) * x + Math.sin(t * th) * b[i]) / s) as Q;
}
const angleOf = (q: Q) => 2 * Math.acos(Math.min(1, Math.abs(q[3]))) / d;
const id: Q = [0, 0, 0, 1];
const yaw120 = fromAxisAngle([0, 1, 0], 120);
assert.ok(Math.abs(angleOf(slerp(id, yaw120, 0.25)) - 30) < 1e-9);  // constant angular speed
assert.ok(Math.abs(angleOf(slerp(id, yaw120, 0.5)) - 60) < 1e-9);
const yaw350 = fromAxisAngle([0, 1, 0], 350);                          // equivalent to -10 deg
assert.ok(Math.abs(angleOf(slerp(id, yaw350, 0.5)) - 5) < 1e-9);     // 5 deg, not 175 deg the long way
console.log('gimbal lock reproduced; slerp halfway to 120 deg =', angleOf(slerp(id, yaw120, 0.5)).toFixed(3), 'deg');`,
        },
        production: {
          language: 'ts',
          filename: 'orientation.ts',
          explanation: 'Production engine pattern: quaternions stored in a Float32Array pool (4 floats per entity, no per-frame objects), angular-velocity integration with renormalisation, shortest-path slerp written into an output slot for animation blending, and conversion to a column-major matrix for upload to the GPU.',
          code: raw`// Orientations for N entities, 4 floats each (x, y, z, w), contiguous for cache friendliness
export class OrientationPool {
  readonly q: Float32Array;
  constructor(readonly capacity: number) {
    this.q = new Float32Array(capacity * 4);
    for (let i = 0; i < capacity; i++) this.q[i * 4 + 3] = 1;          // identity
  }

  // integrate angular velocity w (rad/s) for dt seconds: q += 0.5 * (w,0) * q * dt, then renormalise
  integrate(i: number, wx: number, wy: number, wz: number, dt: number) {
    const q = this.q, o = i * 4;
    const x = q[o], y = q[o + 1], z = q[o + 2], w = q[o + 3];
    const h = 0.5 * dt;
    q[o]     = x + h * ( wx * w + wy * z - wz * y);
    q[o + 1] = y + h * ( wy * w + wz * x - wx * z);
    q[o + 2] = z + h * ( wz * w + wx * y - wy * x);
    q[o + 3] = w + h * (-wx * x - wy * y - wz * z);
    const inv = 1 / Math.hypot(q[o], q[o + 1], q[o + 2], q[o + 3]);   // stop drift
    q[o] *= inv; q[o + 1] *= inv; q[o + 2] *= inv; q[o + 3] *= inv;
  }
}

// shortest-path slerp into out[outOffset..+3]; a and b read from arrays without allocating
export function slerpInto(out: Float32Array, outOffset: number, a: Float32Array, ao: number, b: Float32Array, bo: number, t: number) {
  let bx = b[bo], by = b[bo + 1], bz = b[bo + 2], bw = b[bo + 3];
  let cos = a[ao] * bx + a[ao + 1] * by + a[ao + 2] * bz + a[ao + 3] * bw;
  if (cos < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; cos = -cos; }
  let k0 = 1 - t, k1 = t;
  if (cos < 0.9995) {
    const th = Math.acos(cos), s = Math.sin(th);
    k0 = Math.sin(k0 * th) / s; k1 = Math.sin(k1 * th) / s;
  }
  out[outOffset]     = k0 * a[ao]     + k1 * bx;
  out[outOffset + 1] = k0 * a[ao + 1] + k1 * by;
  out[outOffset + 2] = k0 * a[ao + 2] + k1 * bz;
  out[outOffset + 3] = k0 * a[ao + 3] + k1 * bw;
}

// unit quaternion -> column-major 4x4 (WGSL mat4x4f layout) written at out[o..o+15]
export function toMat4(out: Float32Array, o: number, q: Float32Array, qo: number, tx: number, ty: number, tz: number) {
  const x = q[qo], y = q[qo + 1], z = q[qo + 2], w = q[qo + 3];
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  out[o]      = 1 - 2 * (yy + zz); out[o + 1]  = 2 * (xy + wz);     out[o + 2]  = 2 * (xz - wy);     out[o + 3]  = 0;
  out[o + 4]  = 2 * (xy - wz);     out[o + 5]  = 1 - 2 * (xx + zz); out[o + 6]  = 2 * (yz + wx);     out[o + 7]  = 0;
  out[o + 8]  = 2 * (xz + wy);     out[o + 9]  = 2 * (yz - wx);     out[o + 10] = 1 - 2 * (xx + yy); out[o + 11] = 0;
  out[o + 12] = tx;                out[o + 13] = ty;                out[o + 14] = tz;                out[o + 15] = 1;
}`,
        },
        bug: {
          explanation:
            'Interpolating Euler angles component by component takes strange, wobbling paths and, when one angle wraps from 350° to 10°, spins the object almost a full turn the wrong way. Even with quaternions, forgetting the dot < 0 check makes slerp take the long arc. Interpolate quaternions with a shortest-path slerp.',
          buggy: {
            language: 'ts',
            filename: 'turn.ts',
            code: raw`// ❌ Euler lerp: 350 deg -> 10 deg spins 340 deg the long way, axes wobble near 90 deg pitch
function blend(a: Euler, b: Euler, t: number): Euler {
  return { yaw: a.yaw + (b.yaw - a.yaw) * t, pitch: a.pitch + (b.pitch - a.pitch) * t, roll: a.roll + (b.roll - a.roll) * t };
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'turn.ts',
            code: raw`// ✅ Quaternion slerp along the shortest arc (20 deg here), constant angular speed
function blend(a: Quat, b: Quat, t: number): Quat {
  const dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  const s = dot < 0 ? -1 : 1;                           // flip to the short way round
  return slerp(a, { x: b.x * s, y: b.y * s, z: b.z * s, w: b.w * s }, t);
}`,
          },
        },
      },
      takeaways: [
        'Euler angles lose a degree of freedom at ±90° pitch (gimbal lock) and interpolate badly.',
        'Unit quaternions (axis·sin(θ/2), cos(θ/2)) represent all rotations without singularities; q and −q are the same rotation.',
        'Compose by multiplication, rotate with q·v·q⁻¹, renormalise after integration.',
        'Interpolate with shortest-path slerp; convert to matrices only for the GPU.',
        'Practice drill: write the quaternion for a 180° rotation about +y ((0, 1, 0, 0)) and use Tab 1\'s rotate() to confirm it maps (1, 0, 0) to (−1, 0, 0).',
      ],
    },
  ],
};
