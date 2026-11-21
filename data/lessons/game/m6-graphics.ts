import type { Module } from '../../types';

const raw = String.raw;

export const graphicsModule: Module = {
  id: 'game-gpu',
  title: 'Graphics & the GPU Pipeline',
  level: 'Advanced',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'game-gpu-pipeline',
      title: 'The GPU Pipeline: Vertices, Rasterization, UVs & Depth',
      summary: 'What happens between a draw call and pixels on screen: vertex shaders, primitive assembly, rasterization with edge functions and the top-left fill rule, barycentric interpolation of UVs, fragment shaders, texture sampling and the depth test.',
      difficulty: 'Intermediate',
      minutes: 26,
      xp: 130,
      analogy:
        "The GPU is a factory with thousands of tiny workers. One crew (vertex shaders) moves the corner points of every triangle to their place on screen. A stencil machine (the rasterizer) works out which pixel squares each triangle covers. A second, much bigger crew (fragment shaders) paints each covered square, looking up colours from a picture (the texture) using coordinates glued to the corners (UVs). A height chart (the depth buffer) makes sure nearer paint covers farther paint.",
      intuition: [
        { title: 'Pipeline stages', body: "Vertex fetch → vertex shader (transform by MVP, output clip position plus varyings such as UV and normal) → clipping and perspective divide → rasterization → fragment shader (colour) → depth/stencil test → blending into the render target. Programmable stages are written in WGSL, GLSL or HLSL." },
        { title: 'Rasterization with edge functions', body: "For each pixel centre p and each triangle edge a→b, E = cross(b − a, p − a) (the 2D cross product from Module 2). The pixel is inside when all three edges agree in sign. GPUs evaluate this for blocks of pixels in parallel." },
        { title: 'The top-left fill rule', body: "A pixel centre lying exactly on an edge shared by two triangles must be drawn by exactly one of them, or you get double-blended seams or holes. GPUs include such pixels only for \"top\" or \"left\" edges. Tab 1's two-triangle square covers each of its 64 pixels exactly once." },
        { title: 'Barycentric interpolation and UVs', body: "The three normalised edge values are barycentric weights (w0, w1, w2) that sum to 1. Any per-vertex value (UV, colour, normal, depth) is interpolated as w0·v0 + w1·v1 + w2·v2. Real GPUs also divide by w for perspective-correct interpolation." },
        { title: 'Textures and sampling', body: "UV (0,0)–(1,1) maps onto the texture. Nearest sampling picks one texel (crisp pixel art); bilinear blends the four nearest texels (smooth); mipmaps provide pre-shrunk versions to avoid shimmering on distant surfaces." },
        { title: 'Depth buffer', body: "Every pixel stores the depth of the nearest fragment drawn so far. A new fragment is written only if it passes the depth compare (usually less). This makes draw order irrelevant for opaque geometry, provided the buffer is cleared to the far value (1.0) every frame." },
      ],
      callouts: [
        { kind: 'architecture', title: 'From draw call to pixel', body: 'Programmable stages in bold terms; the rest is fixed-function hardware.', flow: ['vertex buffer + index buffer', 'vertex shader: clip = viewProj · model · position', 'clip → divide by w → viewport', 'rasterizer: edge functions + fill rule', 'fragment shader: sample texture, light', 'depth test → blend → render target'] },
        { kind: 'tip', title: 'Think in parallel', body: 'A fragment shader runs millions of times per frame. Anything that is the same for every pixel (matrices, light colours) belongs in uniforms computed once on the CPU, not recomputed per fragment.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'software_rasterizer.ts',
          explanation: 'Runnable TypeScript: a tiny software rasterizer on an 8×8 target. Assertions prove the top-left fill rule covers every pixel of a two-triangle quad exactly once (inclusive tests double-draw 8 pixels, exclusive tests leave 8 holes), that barycentric UVs interpolate correctly, that nearest and bilinear sampling differ as expected, and that the depth test keeps the nearer triangle regardless of draw order.',
          code: raw`//  8x8 render target, pixel centres at (x + 0.5, y + 0.5)
//
//   (0,0) +-------------+ (8,0)      edge function E(a,b,p) = cross(b - a, p - a)
//         |  T1      /  |            inside: all three E > 0
//         |       /     |            on a shared edge (E == 0): only top / left edges draw it
//         |    /    T2  |            -> every pixel exactly once: no seams, no holes
//   (0,8) +-------------+ (8,8)
import assert from 'node:assert/strict';

type P = { x: number; y: number };
const edge = (a: P, b: P, p: P) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
const isTopLeft = (a: P, b: P) => (a.y === b.y && b.x < a.x) || b.y > a.y;   // y-down screen space

type Frag = { x: number; y: number; w: [number, number, number] };
function raster(tri: P[], rule: 'top-left' | 'inclusive' | 'exclusive'): Frag[] {
  const [a, b, c] = edge(tri[0], tri[1], tri[2]) > 0 ? tri : [tri[0], tri[2], tri[1]];
  const area = edge(a, b, c), out: Frag[] = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const p = { x: x + 0.5, y: y + 0.5 };
    const es: [P, P][] = [[b, c], [c, a], [a, b]];
    const ws = es.map(([u, v]) => edge(u, v, p));
    const inside = es.every(([u, v], i) => ws[i] > 0 || (ws[i] === 0 && (rule === 'inclusive' || (rule === 'top-left' && isTopLeft(u, v)))));
    if (inside) out.push({ x, y, w: [ws[0] / area, ws[1] / area, ws[2] / area] });
  }
  return out;
}
const T1 = [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 0, y: 8 }], T2 = [{ x: 8, y: 0 }, { x: 8, y: 8 }, { x: 0, y: 8 }];
function coverage(rule: 'top-left' | 'inclusive' | 'exclusive') {
  const hits = new Uint8Array(64);
  for (const f of [...raster(T1, rule), ...raster(T2, rule)]) hits[f.y * 8 + f.x]++;
  return [0, 1, 2].map((k) => hits.filter((h) => h === k).length);   // [holes, once, twice]
}
assert.deepEqual(coverage('top-left'), [0, 64, 0]);
assert.deepEqual(coverage('inclusive'), [0, 56, 8]);                 // seam drawn twice
assert.deepEqual(coverage('exclusive'), [8, 56, 0]);                 // seam missing

// barycentric weights sum to 1 and interpolate UVs
const uv = [[0, 0], [1, 0], [0, 1]];
const f = raster(T1, 'top-left').find((q) => q.x === 2 && q.y === 2)!;
assert.ok(Math.abs(f.w[0] + f.w[1] + f.w[2] - 1) < 1e-12);
const u = f.w[0] * uv[0][0] + f.w[1] * uv[1][0] + f.w[2] * uv[2][0];
assert.equal(u, 2.5 / 8);                                            // pixel centre x / width

// texture sampling: 2x1 texture [black, white]
const tex = [0, 1];
const nearest = (s: number) => tex[Math.min(1, Math.floor(s * 2))];
const bilinear = (s: number) => { const t = s * 2 - 0.5, i = Math.max(0, Math.min(0, Math.floor(t))), fr = Math.min(1, Math.max(0, t - i)); return tex[i] * (1 - fr) + tex[i + 1] * fr; };
assert.deepEqual([nearest(0.49), nearest(0.51)], [0, 1]);            // hard edge
assert.equal(bilinear(0.5), 0.5);                                    // smooth blend between texel centres

// depth test: clear to 1.0 (far), compare 'less'
function drawDepth(order: Array<{ tri: P[]; z: number; id: number }>) {
  const depth = new Float32Array(64).fill(1), color = new Uint8Array(64);
  for (const d of order) for (const q of raster(d.tri, 'top-left')) { const i = q.y * 8 + q.x; if (d.z < depth[i]) { depth[i] = d.z; color[i] = d.id; } }
  return color;
}
const far = { tri: T1, z: 0.8, id: 1 }, near = { tri: T1, z: 0.3, id: 2 };
assert.deepEqual(drawDepth([far, near]), drawDepth([near, far]));    // order no longer matters
assert.equal(drawDepth([far, near])[0], 2);
console.log('top-left coverage [holes, once, twice] =', coverage('top-left'), '| interpolated u at (2,2) =', u);`,
        },
        production: {
          language: 'c',
          filename: 'sprite.wgsl',
          explanation: 'Production WGSL (validated by a real WebGPU implementation, wgpu with the naga compiler): an instanced sprite shader. Six vertices per sprite are generated from vertex_index with no vertex buffer for corners; per-instance attributes carry centre, size, atlas UV rectangle and tint; the fragment stage samples a texture atlas and discards transparent texels so sprites can share one pipeline and one draw call.',
          code: raw`// One draw call: draw(6, spriteCount). Corners come from vertex_index, sprite data from instance attributes.
struct Camera {
  viewProj: mat4x4f,
}
@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var atlas: texture_2d<f32>;
@group(0) @binding(2) var atlasSampler: sampler;

struct Instance {
  @location(0) center: vec2f,
  @location(1) size: vec2f,
  @location(2) uvRect: vec4f,      // u0, v0, u1, v1 inside the atlas
  @location(3) tint: vec4f,
}

struct VSOut {
  @builtin(position) clip: vec4f,
  @location(0) uv: vec2f,
  @location(1) tint: vec4f,
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, inst: Instance) -> VSOut {
  // two triangles, counter-clockwise, sharing the diagonal (the fill rule prevents a seam)
  var corners = array<vec2f, 6>(
    vec2f(-0.5, -0.5), vec2f(0.5, -0.5), vec2f(0.5, 0.5),
    vec2f(-0.5, -0.5), vec2f(0.5, 0.5), vec2f(-0.5, 0.5),
  );
  let c = corners[vi];
  let world = inst.center + c * inst.size;
  let t = c + vec2f(0.5);                                   // 0..1 across the quad
  var out: VSOut;
  out.clip = camera.viewProj * vec4f(world, 0.0, 1.0);
  out.uv = vec2f(mix(inst.uvRect.x, inst.uvRect.z, t.x), mix(inst.uvRect.w, inst.uvRect.y, t.y));
  out.tint = inst.tint;
  return out;
}

@fragment
fn fs(v: VSOut) -> @location(0) vec4f {
  let texel = textureSample(atlas, atlasSampler, v.uv);
  if (texel.a < 0.01) {
    discard;                                                // cut-out sprites: no depth write here
  }
  return texel * v.tint;
}`,
        },
        bug: {
          explanation:
            'With depthCompare set to less, a fragment is drawn only if its depth is smaller than the value already stored. Clearing the depth buffer to 0.0 means nothing can ever be nearer, so the screen stays empty (or shows only the clear colour). Clear depth to 1.0, the far plane in WebGPU\'s 0–1 range (or use 0.0 with greater for reversed-Z).',
          buggy: {
            language: 'ts',
            filename: 'render_pass.ts',
            code: raw`// ❌ Depth cleared to 0 with 'less': every fragment fails the depth test
const pass = encoder.beginRenderPass({
  colorAttachments: [{ view: colorView, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
  depthStencilAttachment: { view: depthView, depthLoadOp: 'clear', depthClearValue: 0.0, depthStoreOp: 'store' },
});
// pipeline: depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' }`,
          },
          fixed: {
            language: 'ts',
            filename: 'render_pass.ts',
            code: raw`// ✅ Clear to the far plane (1.0) for 'less'  (reversed-Z: clear 0.0 and use 'greater')
const pass = encoder.beginRenderPass({
  colorAttachments: [{ view: colorView, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
  depthStencilAttachment: { view: depthView, depthLoadOp: 'clear', depthClearValue: 1.0, depthStoreOp: 'store' },
});
// pipeline: depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' }`,
          },
        },
      },
      takeaways: [
        'Vertex shaders place vertices; the rasterizer finds covered pixels; fragment shaders colour them.',
        'Edge functions decide coverage, and the top-left rule makes shared edges seamless.',
        'Barycentric weights interpolate UVs, normals and depth across a triangle.',
        'The depth buffer must be cleared to the far value that matches the compare function.',
        'Practice drill: rasterize T1 alone in Tab 1 with the top-left rule and confirm it covers 36 pixels (28 strictly inside plus the 8 diagonal pixels it owns).',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'game-lighting-pbr',
      title: 'Lighting: Lambert, Blinn-Phong & Physically Based Rendering',
      summary: 'How shaders compute light: Lambert diffuse, Blinn-Phong highlights and why they need normalisation, the Cook-Torrance PBR model (GGX distribution, Smith geometry, Schlick Fresnel) used by modern engines, and why lighting must be done in linear colour space.',
      difficulty: 'Advanced',
      minutes: 26,
      xp: 140,
      analogy:
        "Light hitting a surface is like a crowd of tennis balls hitting a wall. A rough concrete wall sends them bouncing in every direction (diffuse); polished marble sends most of them off in one direction (a sharp highlight). PBR describes the wall as millions of tiny mirrors pointing in slightly different directions: roughness says how scattered the mirrors are, and the total number of balls coming back can never exceed the number thrown.",
      intuition: [
        { title: 'Lambert diffuse', body: "Diffuse brightness is albedo/π · max(0, n·l) · light. The 1/π factor makes the surface reflect exactly its albedo in total over the hemisphere, which Tab 1 verifies by numerical integration." },
        { title: 'Blinn-Phong', body: "Specular = (n·h)^shininess with the half vector h = normalize(l + v). Cheap and familiar, but unnormalised: raising shininess makes highlights smaller and also darker, because the lobe's total energy falls as 2π/(n + 2). Multiply by (n + 2)/(2π) to normalise it." },
        { title: 'Microfacet PBR (Cook-Torrance)', body: "Specular = D·G·F / (4 (n·v)(n·l)). D (GGX) is how many microfacets face h; G (Smith) is how many are shadowed or masked; F (Fresnel) is how much light reflects rather than refracts. Artists set baseColor, metallic and roughness; the same material looks right under any light." },
        { title: 'Fresnel', body: "Schlick's approximation F = F0 + (1 − F0)(1 − cos θ)⁵. Non-metals have F0 ≈ 0.04 (4% reflection head-on) but become mirror-like at grazing angles, which is why a lake reflects the sky near the horizon. Metals use their base colour as F0 and have no diffuse." },
        { title: 'Energy conservation', body: "GGX's D is normalised so that ∫ D(h)(n·h) dω = 1 for any roughness: rough surfaces spread the same energy over a wider lobe. Tab 1 checks this numerically for several roughness values." },
        { title: 'Linear colour space', body: "Textures and screens use sRGB (gamma ≈ 2.2), but light adds linearly. Decode sRGB textures to linear (use an -srgb texture format), light in linear, tone map HDR results, then encode to sRGB for display. Doing maths on sRGB values makes lighting too dark and blends muddy." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Per-fragment PBR', body: 'The standard metallic-roughness workflow (glTF 2.0, Unreal, Unity, Godot).', flow: ['sample baseColor (sRGB → linear), metallic, roughness, normal', 'F0 = mix(0.04, baseColor, metallic)', 'specular = D_GGX · G_Smith · F_Schlick / (4 NdotV NdotL)', 'diffuse = (1 − F)(1 − metallic) · baseColor / π', '(diffuse + specular) · radiance · NdotL', 'tone map (HDR → LDR) → encode sRGB'] },
        { kind: 'tip', title: 'Roughness is squared', body: 'Most engines expose perceptual roughness r and use α = r² inside GGX. It makes the slider feel linear to artists.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'brdf_from_scratch.ts',
          explanation: 'Runnable TypeScript: numerical hemisphere integration proving Lambert with 1/π returns exactly the albedo, that unnormalised Blinn-Phong loses energy as shininess rises while the normalised lobe integrates to 1, that the GGX distribution is normalised for every roughness, Schlick Fresnel values head-on and at grazing angles, and sRGB versus linear blending. All asserted.',
          code: raw`//          n              l   light            BRDF terms (Cook-Torrance)
//          ^     h      /                       D: GGX microfacet distribution  (integral of D*cos = 1)
//          |   /     /                          G: Smith shadowing / masking
//          | /    /                             F: Schlick Fresnel  F0 + (1 - F0)(1 - cos)^5
//   -------+-------------- surface     v viewer  ---- diffuse: albedo / pi ----
import assert from 'node:assert/strict';

// integrate f(theta) over the hemisphere: 2*pi * integral f(theta) sin(theta) dtheta (azimuthally symmetric)
function hemisphere(f: (cosT: number) => number, steps = 20000) {
  let s = 0; const d = Math.PI / 2 / steps;
  for (let i = 0; i < steps; i++) { const t = (i + 0.5) * d; s += f(Math.cos(t)) * Math.sin(t) * d; }
  return 2 * Math.PI * s;
}
const close = (a: number, b: number, eps: number) => Math.abs(a - b) < eps;

// 1) Lambert: total reflected = albedo
const albedo = 0.8;
assert.ok(close(hemisphere((c) => (albedo / Math.PI) * c), albedo, 1e-6));

// 2) Blinn-Phong lobe energy: unnormalised falls with shininess, normalised stays 1
const lobe = (n: number) => hemisphere((c) => c ** n * c);
assert.ok(close(lobe(16), (2 * Math.PI) / 18, 1e-6) && close(lobe(256), (2 * Math.PI) / 258, 1e-6));
assert.ok(lobe(256) < lobe(16) / 10);                                       // shinier = darker if unnormalised
for (const n of [16, 256]) assert.ok(close(((n + 2) / (2 * Math.PI)) * lobe(n), 1, 1e-6));

// 3) GGX normal distribution is normalised for any roughness (alpha = roughness^2)
const ggx = (cosH: number, alpha: number) => { const a2 = alpha * alpha, d = cosH * cosH * (a2 - 1) + 1; return a2 / (Math.PI * d * d); };
for (const r of [0.2, 0.5, 0.9]) assert.ok(close(hemisphere((c) => ggx(c, r * r) * c, 200000), 1, 1e-3));

// 4) Schlick Fresnel for a dielectric (F0 = 0.04)
const fresnel = (cosT: number, f0: number) => f0 + (1 - f0) * (1 - cosT) ** 5;
assert.equal(fresnel(1, 0.04), 0.04);                                       // 4% head-on
assert.ok(fresnel(Math.cos((89 * Math.PI) / 180), 0.04) > 0.9);             // mirror-like at grazing angles

// 5) sRGB vs linear: blend black and white 50/50
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (l: number) => (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055);
const wrong = 0.5;                                                           // averaged sRGB codes
const right = toSrgb((toLinear(0) + toLinear(1)) / 2);                       // averaged light
assert.ok(close(right, 0.7354, 1e-4) && close(toLinear(wrong), 0.214, 1e-3)); // the wrong blend emits only 21% light
console.log('GGX normalised; Blinn-Phong n=256 unnormalised energy', lobe(256).toFixed(4), '| correct 50% grey in sRGB =', right.toFixed(4));`,
        },
        production: {
          language: 'c',
          filename: 'pbr.wgsl',
          explanation: 'Production WGSL (validated by wgpu/naga): a metallic-roughness Cook-Torrance fragment shader with GGX distribution, Smith-Schlick geometry and Schlick Fresnel, energy-conserving diffuse, a base colour texture created with an -srgb format so sampling returns linear values, Reinhard tone mapping and output to an -srgb render target that applies gamma encoding in hardware.',
          code: raw`const PI = 3.14159265359;

struct Light {
  direction: vec3f,     // offset 0  (vec3 aligns to 16)
  intensity: f32,       // offset 12 packs into the vec3's padding
  color: vec3f,         // offset 16
  ambient: f32,         // offset 28
}
struct Material {
  baseColor: vec4f,
  metallic: f32,
  roughness: f32,
  pad: vec2f,
}
@group(1) @binding(0) var<uniform> light: Light;
@group(1) @binding(1) var<uniform> material: Material;
@group(1) @binding(2) var<uniform> cameraPos: vec4f;
@group(1) @binding(3) var baseColorTex: texture_2d<f32>;   // rgba8unorm-srgb: samples come back linear
@group(1) @binding(4) var linearSampler: sampler;

fn distributionGGX(NdotH: f32, alpha: f32) -> f32 {
  let a2 = alpha * alpha;
  let d = NdotH * NdotH * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d);
}
fn geometrySmith(NdotV: f32, NdotL: f32, roughness: f32) -> f32 {
  let k = (roughness + 1.0) * (roughness + 1.0) / 8.0;     // direct-light remapping
  return (NdotV / (NdotV * (1.0 - k) + k)) * (NdotL / (NdotL * (1.0 - k) + k));
}
fn fresnelSchlick(cosTheta: f32, F0: vec3f) -> vec3f {
  return F0 + (vec3f(1.0) - F0) * pow(1.0 - cosTheta, 5.0);
}

struct FragIn {
  @location(0) worldPos: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
}

@fragment
fn fs(v: FragIn) -> @location(0) vec4f {
  let N = normalize(v.normal);
  let V = normalize(cameraPos.xyz - v.worldPos);
  let L = normalize(-light.direction);
  let H = normalize(V + L);
  let NdotL = max(dot(N, L), 0.0);
  let NdotV = max(dot(N, V), 1e-4);
  let NdotH = max(dot(N, H), 0.0);
  let VdotH = max(dot(V, H), 0.0);

  let base = textureSample(baseColorTex, linearSampler, v.uv) * material.baseColor;   // linear
  let F0 = mix(vec3f(0.04), base.rgb, material.metallic);
  let alpha = material.roughness * material.roughness;
  let F = fresnelSchlick(VdotH, F0);
  let spec = distributionGGX(NdotH, alpha) * geometrySmith(NdotV, NdotL, material.roughness) * F
           / (4.0 * NdotV * max(NdotL, 1e-4));
  let kd = (vec3f(1.0) - F) * (1.0 - material.metallic);   // metals have no diffuse
  let radiance = light.color * light.intensity;
  let hdr = (kd * base.rgb / PI + spec) * radiance * NdotL + base.rgb * light.ambient;
  let ldr = hdr / (hdr + vec3f(1.0));                         // Reinhard tone mapping
  return vec4f(ldr, base.a);                                  // bgra8unorm-srgb target encodes gamma
}`,
        },
        bug: {
          explanation:
            'The texture is created as plain rgba8unorm, so the shader receives sRGB-encoded values and treats them as linear light; the canvas is also non-sRGB, so the result is never gamma-encoded. Lighting falls off far too quickly, highlights look harsh and blends are muddy. Decode inputs to linear and encode outputs (here explicitly; in production, prefer -srgb texture and render-target formats so the hardware does it).',
          buggy: {
            language: 'c',
            filename: 'lit_gamma_bug.wgsl',
            code: raw`// ❌ Lighting done on sRGB-encoded values, written to a non-sRGB target without encoding
@group(0) @binding(0) var albedoTex: texture_2d<f32>;    // created as rgba8unorm (no -srgb)
@group(0) @binding(1) var samp: sampler;

@fragment
fn fs(@location(0) uv: vec2f, @location(1) normal: vec3f) -> @location(0) vec4f {
  let albedo = textureSample(albedoTex, samp, uv).rgb;    // still gamma-encoded
  let ndl = max(dot(normalize(normal), normalize(vec3f(0.3, 1.0, 0.5))), 0.0);
  return vec4f(albedo * ndl, 1.0);                         // canvas is bgra8unorm: no encode
}`,
          },
          fixed: {
            language: 'c',
            filename: 'lit_gamma_fixed.wgsl',
            code: raw`// ✅ Decode to linear, light in linear, encode for display
@group(0) @binding(0) var albedoTex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

fn srgbToLinear(c: vec3f) -> vec3f { return pow(c, vec3f(2.2)); }
fn linearToSrgb(c: vec3f) -> vec3f { return pow(c, vec3f(1.0 / 2.2)); }

@fragment
fn fs(@location(0) uv: vec2f, @location(1) normal: vec3f) -> @location(0) vec4f {
  let albedo = srgbToLinear(textureSample(albedoTex, samp, uv).rgb);
  let ndl = max(dot(normalize(normal), normalize(vec3f(0.3, 1.0, 0.5))), 0.0);
  return vec4f(linearToSrgb(albedo * ndl), 1.0);
}`,
          },
        },
      },
      takeaways: [
        'Lambert diffuse uses albedo/π so total reflection equals the albedo.',
        'Blinn-Phong needs (n + 2)/(2π) normalisation or shiny materials get darker.',
        'PBR = D (GGX) · G (Smith) · F (Schlick) / (4 NdotV NdotL) plus energy-conserving diffuse.',
        'Light in linear space: decode sRGB inputs, tone map HDR, encode for display.',
        'Practice drill: use Tab 1\'s fresnel() to compute the reflectance of water (F0 ≈ 0.02) at 0°, 60° and 85° and explain why distant water looks like a mirror.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'game-culling-batching',
      title: 'Frustum Culling, Draw Calls & Sprite Batching',
      summary: 'Most frame time is lost to work that never reaches the screen and to too many draw calls. Extract frustum planes from the view-projection matrix to skip invisible objects, then sort and batch sprites by texture (or use an atlas and instancing) to cut draw calls from hundreds to a handful.',
      difficulty: 'Advanced',
      minutes: 24,
      xp: 130,
      analogy:
        "A film crew only builds the parts of the set the camera can see, and a removals company only drives to each house once even if it has fifty boxes for it. Frustum culling is not building what the camera cannot see; batching is loading every box going to the same place into one truck trip instead of driving back and forth for each box.",
      intuition: [
        { title: 'The view frustum', body: "What the camera can see is a truncated pyramid bounded by six planes (left, right, top, bottom, near, far). An object completely outside any one plane is invisible and can be skipped on the CPU before any GPU work is issued." },
        { title: 'Planes from the matrix', body: "With viewProj stored column-major and rows r0..r3, the planes are r3 ± r0 (left/right), r3 ± r1 (bottom/top), r2 (near, for WebGPU's 0–1 depth) and r3 − r2 (far). Normalise each so the dot product gives real distances (Gribb–Hartmann extraction)." },
        { title: 'Sphere test', body: "For a bounding sphere with centre c and radius r: if dot(n, c) + d < −r for any plane, it is outside. Testing only the centre makes objects pop out of existence while still partially on screen." },
        { title: 'Why draw calls are expensive', body: "Every draw call has CPU-side validation and state setup (pipeline, bind groups, buffers). Changing texture forces a new call. 1,000 sprites drawn in random texture order cost 884 calls in Tab 1; sorted by layer and texture they cost 8." },
        { title: 'Batching and instancing', body: "Sort draws by a key (layer, pipeline, texture) to minimise state changes. Pack many sprites into one texture atlas and one instance buffer to draw everything with a single instanced call. WebGPU render bundles record a list of draws once and replay it cheaply each frame." },
        { title: 'Respect order where it matters', body: "Opaque objects can be sorted freely (and front-to-back helps early depth rejection). Transparent sprites must be drawn back-to-front within a layer, so the sort key puts layer and depth before texture." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Per-frame render preparation', body: 'Cheap CPU work that saves expensive GPU and driver work.', flow: ['extract 6 frustum planes from viewProj', 'cull bounding spheres (or AABBs) → visible list', 'build sort keys: layer | pipeline | texture | depth', 'sort, then merge runs with equal state into batches', 'write instance data into one buffer', 'one draw per batch (or replay a render bundle)'] },
        { kind: 'tip', title: 'Measure draw calls, not just FPS', body: 'Count draw calls and state changes per frame in a debug overlay. When the number grows with the number of objects, you need batching or instancing.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'culling_batching_from_scratch.ts',
          explanation: 'Runnable TypeScript: frustum planes extracted from a WebGPU-style view-projection matrix and used to cull bounding spheres (including the partially visible sphere a centre-only test wrongly culls), then 1,000 seeded sprites drawn in random texture order versus sorted by layer and texture versus a single atlas, with draw-call counts asserted.',
          code: raw`//  FRUSTUM (top view, fov 90 deg)             DRAW CALLS for 1,000 sprites, 4 textures
//
//        \   far   /                         random order : 884 calls (a switch almost every sprite)
//         \       /     o  outside           sorted (layer, texture): 8 calls
//          \  o  /   (o  partially visible   atlas + instancing: 1 call
//           \   /      -> keep it!)
//            cam     ---- plane test: dot(n, c) + d < -r  -> cull ----
import assert from 'node:assert/strict';

type M4 = Float64Array;
function perspective(fovy: number, aspect: number, near: number, far: number): M4 {
  const f = 1 / Math.tan(fovy / 2), m = new Float64Array(16);
  m[0] = f / aspect; m[5] = f; m[10] = far / (near - far); m[11] = -1; m[14] = (near * far) / (near - far);
  return m;                                                   // camera at origin looking down -z: view = identity
}
type Plane = [number, number, number, number];
function frustumPlanes(m: M4): Plane[] {
  const row = (r: number): Plane => [m[r], m[4 + r], m[8 + r], m[12 + r]];
  const [r0, r1, r2, r3] = [row(0), row(1), row(2), row(3)];
  const add = (a: Plane, b: Plane, s: number): Plane => [a[0] + s * b[0], a[1] + s * b[1], a[2] + s * b[2], a[3] + s * b[3]];
  const raw = [add(r3, r0, 1), add(r3, r0, -1), add(r3, r1, 1), add(r3, r1, -1), r2, add(r3, r2, -1)];   // L R B T Near Far
  return raw.map((p) => { const l = Math.hypot(p[0], p[1], p[2]); return p.map((v) => v / l) as Plane; });
}
const planes = frustumPlanes(perspective(Math.PI / 2, 1, 0.1, 100));
const visible = (c: number[], r: number) => planes.every((p) => p[0] * c[0] + p[1] * c[1] + p[2] * c[2] + p[3] >= -r);
const centreOnly = (c: number[]) => visible(c, 0);

assert.equal(visible([0, 0, -10], 1), true);                  // straight ahead
assert.equal(visible([0, 0, 10], 1), false);                  // behind the camera
assert.equal(visible([12, 0, -10], 1), false);                // far off to the right
assert.equal(visible([0, 0, -101], 0.5), false);              // beyond the far plane
assert.deepEqual([visible([10.5, 0, -10], 1), centreOnly([10.5, 0, -10])], [true, false]);   // edge case: centre test pops it

// batching: count state changes (a new call whenever layer or texture changes)
function mulberry32(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rnd = mulberry32(7);
const sprites = Array.from({ length: 1000 }, (_, i) => ({ id: i, layer: rnd() < 0.5 ? 0 : 1, texture: Math.floor(rnd() * 4) }));
const drawCalls = (list: { layer: number; texture: number }[]) =>
  list.reduce((n, s, i) => n + (i === 0 || s.layer !== list[i - 1].layer || s.texture !== list[i - 1].texture ? 1 : 0), 0);
const naive = drawCalls(sprites);
const sorted = [...sprites].sort((a, b) => (a.layer << 8 | a.texture) - (b.layer << 8 | b.texture) || a.id - b.id);
assert.ok(naive > 700);
assert.equal(drawCalls(sorted), 8);                           // 2 layers x 4 textures
assert.equal(drawCalls(sorted.map((s) => ({ layer: 0, texture: 0 }))), 1);   // atlas + one layer: 1 instanced call
assert.ok(sorted.every((s, i) => i === 0 || s.layer >= sorted[i - 1].layer));   // layer order preserved
console.log('draw calls  random:', naive, '| sorted:', drawCalls(sorted), '| atlas + instancing: 1');`,
        },
        production: {
          language: 'ts',
          filename: 'sprite_batcher.ts',
          explanation: 'Production engine pattern (WebGPU host code): a sprite batcher that culls against the camera rectangle, packs a 32-bit sort key (layer, texture) into a Uint32Array, radix-style sorts indices, writes all visible sprites into one Float32Array instance buffer with a single writeBuffer, and issues one instanced draw per texture run. Nothing is allocated per frame.',
          code: raw`// Instance layout matches sprite.wgsl: center(2) size(2) uvRect(4) tint(4) = 12 floats = 48 bytes
const FLOATS_PER_SPRITE = 12;

export class SpriteBatcher {
  private instances: Float32Array; private keys: Uint32Array; private order: Uint32Array; private tmp: Uint32Array;
  private count = 0; readonly drawCalls: number[] = [];
  readonly instanceBuffer: GPUBuffer;

  constructor(private device: GPUDevice, readonly capacity: number) {
    this.instances = new Float32Array(capacity * FLOATS_PER_SPRITE);
    this.keys = new Uint32Array(capacity); this.order = new Uint32Array(capacity); this.tmp = new Uint32Array(capacity);
    this.instanceBuffer = device.createBuffer({ size: this.instances.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  }

  begin() { this.count = 0; }

  /** Culls against the camera rectangle; returns false when culled. */
  add(cx: number, cy: number, w: number, h: number, layer: number, texture: number, uv: ArrayLike<number>, tint: ArrayLike<number>,
      cam: { minX: number; minY: number; maxX: number; maxY: number }): boolean {
    if (cx + w / 2 < cam.minX || cx - w / 2 > cam.maxX || cy + h / 2 < cam.minY || cy - h / 2 > cam.maxY) return false;
    if (this.count === this.capacity) return false;
    const i = this.count++, o = i * FLOATS_PER_SPRITE, d = this.instances;
    d[o] = cx; d[o + 1] = cy; d[o + 2] = w; d[o + 3] = h;
    d[o + 4] = uv[0]; d[o + 5] = uv[1]; d[o + 6] = uv[2]; d[o + 7] = uv[3];
    d[o + 8] = tint[0]; d[o + 9] = tint[1]; d[o + 10] = tint[2]; d[o + 11] = tint[3];
    this.keys[i] = ((layer & 0xff) << 24) | (texture & 0xffffff);     // layer first: draw order is kept
    this.order[i] = i;
    return true;
  }

  // Two-pass LSD radix sort on 16-bit digits of the key (stable, O(n))
  private sortIndices() {
    const n = this.count, counts = new Uint32Array(65536);
    let src = this.order, dst = this.tmp;
    for (let shift = 0; shift < 32; shift += 16) {
      counts.fill(0);
      for (let i = 0; i < n; i++) counts[(this.keys[src[i]] >>> shift) & 0xffff]++;
      for (let i = 1; i < 65536; i++) counts[i] += counts[i - 1];
      for (let i = n - 1; i >= 0; i--) dst[--counts[(this.keys[src[i]] >>> shift) & 0xffff]] = src[i];
      const t = src; src = dst; dst = t;
    }
    this.order = src; this.tmp = dst;
  }

  flush(pass: GPURenderPassEncoder, bindGroupForTexture: (texture: number) => GPUBindGroup, scratch: Float32Array) {
    this.sortIndices();
    for (let i = 0; i < this.count; i++)                     // gather into sorted order
      scratch.set(this.instances.subarray(this.order[i] * FLOATS_PER_SPRITE, (this.order[i] + 1) * FLOATS_PER_SPRITE), i * FLOATS_PER_SPRITE);
    this.device.queue.writeBuffer(this.instanceBuffer, 0, scratch, 0, this.count * FLOATS_PER_SPRITE);   // one upload
    pass.setVertexBuffer(0, this.instanceBuffer);
    this.drawCalls.length = 0;
    let runStart = 0;
    for (let i = 1; i <= this.count; i++) {
      const runEnds = i === this.count || this.keys[this.order[i]] !== this.keys[this.order[runStart]];
      if (!runEnds) continue;
      pass.setBindGroup(0, bindGroupForTexture(this.keys[this.order[runStart]] & 0xffffff));
      pass.draw(6, i - runStart, 0, runStart);               // 6 vertices, N instances, firstInstance
      this.drawCalls.push(i - runStart);
      runStart = i;
    }
  }
}`,
        },
        bug: {
          explanation:
            'Testing only the centre point of each object against the frustum culls objects whose centre has just left the screen while their edges are still visible, so large objects pop in and out at the screen borders. Include the bounding radius in the plane test (cull only when the whole sphere is outside a plane).',
          buggy: {
            language: 'ts',
            filename: 'cull.ts',
            code: raw`// ❌ Centre-only test: half-visible objects vanish at the screen edges
function isVisible(planes: Plane[], o: { center: Vec3; radius: number }) {
  return planes.every((p) => p.nx * o.center.x + p.ny * o.center.y + p.nz * o.center.z + p.d >= 0);
}`,
          },
          fixed: {
            language: 'ts',
            filename: 'cull.ts',
            code: raw`// ✅ Sphere test: cull only when the whole sphere is behind some plane
function isVisible(planes: Plane[], o: { center: Vec3; radius: number }) {
  return planes.every((p) => p.nx * o.center.x + p.ny * o.center.y + p.nz * o.center.z + p.d >= -o.radius);
}`,
          },
        },
      },
      takeaways: [
        'Extract six normalised planes from viewProj and cull bounding volumes before issuing GPU work.',
        'Test the full bounding sphere (distance ≥ −r), never just the centre point.',
        'Draw calls and state changes cost CPU time: sort by (layer, pipeline, texture) and merge runs.',
        'Atlases plus instancing (and render bundles) turn hundreds of draws into one.',
        'Practice drill: in Tab 1, find the largest x for which a radius-1 sphere at z = −10 is still visible (about 11.41, i.e. 10 + √2) and explain where the √2 comes from.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'game-webgpu-wgsl',
      title: 'WebGPU & WGSL: Compute Shaders, Buffer Layout & Fallbacks',
      summary: 'Programming the GPU directly from the browser: the WebGPU object model (adapter, device, pipelines, bind groups, command encoders), WGSL memory layout rules (why vec3 is 16-byte aligned), compute shaders that simulate particles on the GPU, render bundles, and a WebGL 2 fallback strategy.',
      difficulty: 'Advanced',
      minutes: 28,
      xp: 160,
      analogy:
        "The CPU is a manager who writes very precise work orders; the GPU is a warehouse with thousands of workers who read them. WebGPU makes the manager write the orders up front (pipelines, layouts) so the warehouse never has to stop and ask questions. A compute shader is an order like \"each of you take one box number, update it, and put it back\". Buffer layout is the shelf labelling: if the manager thinks a box is 24 cm wide and the warehouse uses 32 cm shelf slots, every box after the first ends up in the wrong slot.",
      intuition: [
        { title: 'The object model', body: "navigator.gpu → requestAdapter() → requestDevice(). Create buffers and textures, compile WGSL into shader modules, build immutable pipelines (render or compute) and bind groups (which resources each shader binding sees), then record commands in a command encoder and submit them to the queue." },
        { title: 'Compute shaders', body: "@compute @workgroup_size(64) runs your function in groups of 64 invocations. dispatchWorkgroups(ceil(N / 64)) launches enough groups to cover N items; the last group has spare invocations, so always guard with `if (i >= count) { return; }`." },
        { title: 'WGSL layout rules', body: "Each type has an alignment and size: f32 4/4, vec2f 8/8, vec3f 16/12, vec4f 16/16, mat4x4f 16/64. Members are placed at the next multiple of their alignment and the struct size is rounded up to its largest alignment. A struct of two vec3f is 32 bytes, not 24." },
        { title: 'Packing tricks', body: "Put a scalar right after a vec3f to use its 4 spare bytes (pos: vec3f, life: f32 is 16 bytes). Mirror the layout exactly in a Float32Array on the CPU, ideally generated from one source of truth or a library such as webgpu-utils." },
        { title: 'Render bundles and indirect draws', body: "A render bundle records a sequence of draws once and replays it every frame with almost no CPU cost. Indirect draws let a compute shader decide how many instances to draw (GPU-driven culling), with no CPU read-back." },
        { title: 'Fallbacks', body: "WebGPU is available in current Chrome, Edge, Safari and Firefox, but not on every device or driver. Feature-detect navigator.gpu and a successful adapter; otherwise fall back to a WebGL 2 renderer (shared scene code, separate backend), and keep compute work optional or emulated on the CPU." },
      ],
      callouts: [
        { kind: 'architecture', title: 'One WebGPU frame with GPU particles', body: 'Compute and render passes in one command buffer; the CPU never reads particle data back.', flow: ['writeBuffer(params: dt, gravity, count)', 'compute pass: dispatchWorkgroups(ceil(N / 64))', 'render pass: draw(6, N) or drawIndirect / executeBundles', 'queue.submit([encoder.finish()])', 'fallback: no adapter → WebGL 2 backend'] },
        { kind: 'security', title: 'Robust buffer access is not a licence', body: 'WebGPU clamps or discards out-of-bounds accesses instead of corrupting memory, but your logic is still wrong. Bounds-check every invocation index against the element count.' },
      ],
      code: {
        basic: {
          language: 'ts',
          filename: 'wgsl_layout_and_dispatch.ts',
          explanation: 'Runnable TypeScript: an implementation of the WGSL alignment and size rules that computes byte offsets for the structs used by the production shader (asserting vec3 padding and scalar packing), followed by a CPU emulation of the compute dispatch (workgroups, global_invocation_id, bounds check) that produces the reference results the GPU kernel must match.',
          code: raw`//  WGSL struct layout (storage / uniform)         compute dispatch, workgroup_size(64)
//
//   Particle { pos: vec3f  @0   ###########.      N = 1000 -> dispatchWorkgroups(16) = 1024 invocations
//              life: f32   @12             #      invocations 1000..1023 must return early
//              vel: vec3f  @16  ###########.      if (i >= params.count) { return; }
//              size: f32   @28             # }  -> 32 bytes, array stride 32
import assert from 'node:assert/strict';

type T = 'f32' | 'u32' | 'vec2f' | 'vec3f' | 'vec4f' | 'mat4x4f';
const INFO: Record<T, { align: number; size: number }> = {
  f32: { align: 4, size: 4 }, u32: { align: 4, size: 4 }, vec2f: { align: 8, size: 8 },
  vec3f: { align: 16, size: 12 }, vec4f: { align: 16, size: 16 }, mat4x4f: { align: 16, size: 64 },
};
const roundUp = (k: number, n: number) => Math.ceil(n / k) * k;
function layout(members: [string, T][]) {
  let offset = 0, maxAlign = 0; const offsets: Record<string, number> = {};
  for (const [name, t] of members) {
    const { align, size } = INFO[t];
    offset = roundUp(align, offset); offsets[name] = offset; offset += size; maxAlign = Math.max(maxAlign, align);
  }
  return { offsets, size: roundUp(maxAlign, offset) };
}

const particle = layout([['pos', 'vec3f'], ['life', 'f32'], ['vel', 'vec3f'], ['size', 'f32']]);
assert.deepEqual(particle, { offsets: { pos: 0, life: 12, vel: 16, size: 28 }, size: 32 });
const naive = layout([['pos', 'vec3f'], ['vel', 'vec3f']]);
assert.deepEqual(naive, { offsets: { pos: 0, vel: 16 }, size: 32 });          // NOT 0/12/24
const params = layout([['gravity', 'vec3f'], ['dt', 'f32'], ['count', 'u32'], ['damping', 'f32'], ['pad', 'vec2f']]);
assert.deepEqual(params, { offsets: { gravity: 0, dt: 12, count: 16, damping: 20, pad: 24 }, size: 32 });
assert.equal(layout([['m', 'mat4x4f'], ['tint', 'vec3f']]).size, 80);

// CPU emulation of the compute kernel (same maths as particles.wgsl), floats rounded like the GPU's f32
const N = 1000, WG = 64, STRIDE = particle.size / 4;
const buf = new Float32Array(N * STRIDE);
for (let i = 0; i < N; i++) { const o = i * STRIDE; buf[o] = i * 0.01; buf[o + 1] = 1 + (i % 7) * 0.1; buf[o + 3] = (i % 5) * 0.25; buf[o + 4] = 1; buf[o + 5] = 2; }
const P = { gx: 0, gy: -9.8, gz: 0, dt: 1 / 60, count: N, damping: 0.99 };
const groups = Math.ceil(N / WG);
let invocations = 0, updated = 0, alive = 0;
for (let wg = 0; wg < groups; wg++) for (let local = 0; local < WG; local++) {
  invocations++;
  const i = wg * WG + local;                                    // global_invocation_id.x
  if (i >= P.count) continue;                                   // the bounds check
  const o = i * STRIDE;
  if (buf[o + 3] <= 0) continue;                                // dead particle
  buf[o + 4] = (buf[o + 4] + P.gx * P.dt) * P.damping;
  buf[o + 5] = (buf[o + 5] + P.gy * P.dt) * P.damping;
  buf[o + 6] = (buf[o + 6] + P.gz * P.dt) * P.damping;
  buf[o] += buf[o + 4] * P.dt; buf[o + 1] += buf[o + 5] * P.dt; buf[o + 2] += buf[o + 6] * P.dt;
  if (buf[o + 1] < 0) { buf[o + 1] = 0; buf[o + 5] = -buf[o + 5] * 0.5; }
  buf[o + 3] -= P.dt; updated++;
  if (buf[o + 3] > 0) alive++;
}
assert.deepEqual([groups, invocations, updated], [16, 1024, 800]);   // 200 particles start dead (life 0)
assert.equal(alive, 800);
assert.ok(Math.abs(buf[1 * STRIDE + 5] - (2 - 9.8 / 60) * 0.99) < 1e-5);
console.log('Particle size', particle.size, 'bytes | dispatch', groups, 'workgroups,', invocations, 'invocations,', updated, 'updated, alive', alive);`,
        },
        production: {
          language: 'c',
          filename: 'particles.wgsl',
          explanation: 'Production WGSL compute shader (validated by wgpu/naga and executed on a real WebGPU device, where its output matches Tab 1\'s CPU reference): 64-wide workgroups, a uniform SimParams struct laid out exactly as computed in Tab 1, a read-write storage array of 32-byte particles, a bounds check for the partial last workgroup, ground bounce, and an atomic counter of live particles that an indirect draw can consume.',
          code: raw`// Layout must match the CPU side byte-for-byte (see Tab 1): Particle = 32 bytes, SimParams = 32 bytes.
struct Particle {
  pos: vec3f,      // 0
  life: f32,       // 12  (packed into the vec3's padding)
  vel: vec3f,      // 16
  size: f32,       // 28
}

struct SimParams {
  gravity: vec3f,  // 0
  dt: f32,         // 12
  count: u32,      // 16
  damping: f32,    // 20
  pad: vec2f,      // 24 -> size 32
}

@group(0) @binding(0) var<uniform> params: SimParams;
@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(2) var<storage, read_write> aliveCount: atomic<u32>;

@compute @workgroup_size(64)
fn simulate(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= params.count) {
    return;                                    // spare invocations in the last workgroup
  }
  var p = particles[i];                        // one 32-byte load into registers
  if (p.life <= 0.0) {
    return;
  }
  p.vel = (p.vel + params.gravity * params.dt) * params.damping;
  p.pos = p.pos + p.vel * params.dt;
  if (p.pos.y < 0.0) {                         // bounce on the ground plane
    p.pos.y = 0.0;
    p.vel.y = -p.vel.y * 0.5;
  }
  p.life = p.life - params.dt;
  particles[i] = p;                            // one 32-byte store
  if (p.life > 0.0) {
    atomicAdd(&aliveCount, 1u);                // feeds drawIndirect's instance count
  }
}`,
        },
        bug: {
          explanation:
            'The CPU packs vec3 values tightly (3 floats each), but WGSL aligns vec3f to 16 bytes, so in the shader `vel` starts at byte 16, not 12, and the array stride is 32, not 24. Every particle after the first reads garbage, typically showing up as particles exploding or freezing. Mirror the WGSL layout on the CPU, using padding or packing a scalar into the spare 4 bytes.',
          buggy: {
            language: 'ts',
            filename: 'upload.ts',
            code: raw`// ❌ Tightly packed: 6 floats (24 bytes) per particle, but WGSL expects 32 bytes with vel at offset 16
const data = new Float32Array(count * 6);
for (let i = 0; i < count; i++) {
  data.set([p[i].x, p[i].y, p[i].z, p[i].vx, p[i].vy, p[i].vz], i * 6);
}
device.queue.writeBuffer(particleBuffer, 0, data);`,
          },
          fixed: {
            language: 'ts',
            filename: 'upload.ts',
            code: raw`// ✅ Mirror the WGSL layout: pos@0 life@12 vel@16 size@28, stride 32 bytes (8 floats)
const STRIDE = 8;
const data = new Float32Array(count * STRIDE);
for (let i = 0; i < count; i++) {
  const o = i * STRIDE;
  data[o] = p[i].x;  data[o + 1] = p[i].y;  data[o + 2] = p[i].z;  data[o + 3] = p[i].life;
  data[o + 4] = p[i].vx; data[o + 5] = p[i].vy; data[o + 6] = p[i].vz; data[o + 7] = p[i].size;
}
device.queue.writeBuffer(particleBuffer, 0, data);`,
          },
        },
      },
      takeaways: [
        'WebGPU front-loads work into pipelines and bind groups so per-frame submission is cheap.',
        'Dispatch ceil(N / workgroupSize) workgroups and bounds-check every invocation.',
        'WGSL aligns vec3f to 16 bytes; mirror struct layouts exactly on the CPU and pack scalars into padding.',
        'Use render bundles and indirect draws for GPU-driven rendering, and feature-detect with a WebGL 2 fallback.',
        'Practice drill: compute the WGSL layout of struct { color: vec3f, intensity: f32, dir: vec3f, range: f32, viewProj: mat4x4f } with Tab 1\'s layout() (offsets 0, 12, 16, 28, 32; size 96).',
      ],
    },
  ],
};
