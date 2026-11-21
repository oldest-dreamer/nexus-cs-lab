import type { Module } from '../../types';

const raw = String.raw;

export const transformersModule: Module = {
  id: 'ai-transformers',
  title: 'Transformer Internals',
  level: 'Intermediate',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'ai-self-attention',
      title: 'Scaled Dot-Product Self-Attention & Causal Masking',
      summary: 'Compute attention by hand on a 3-token example, understand why we divide by √d_k, and implement the causal mask that makes GPT-style models autoregressive.',
      difficulty: 'Intermediate',
      minutes: 25,
      xp: 130,
      analogy:
        "Attention is a library where every token is a reader with a question (query), every token also hangs a label on its shelf (key) and keeps a book on it (value). Each reader compares their question with every label, turns the match scores into percentages, and walks away with a blend of books weighted by those percentages. The causal mask simply locks the shelves of books that have not been written yet.",
      intuition: [
        { title: 'Three projections of the same input', body: "Each token vector x is multiplied by three learned matrices: `q = xW_Q`, `k = xW_K`, `v = xW_V`. Queries ask, keys advertise, values carry content." },
        { title: 'Scores = queries · keys, scaled', body: "`scores = QKᵀ / √d_k`. With Q = K = [[1,0],[0,1],[1,1]] and d_k = 2, token 3's raw dots with tokens 1–3 are [1, 1, 2]; divided by √2 they become [0.707, 0.707, 1.414]." },
        { title: 'Why divide by √d_k?', body: "For random unit-variance vectors, a dot product over d dimensions has variance d. Without scaling, large d gives huge scores, softmax saturates to nearly one-hot, and gradients vanish. Dividing by √d_k keeps the variance near 1." },
        { title: 'Softmax each row, blend the values', body: "Row 3 weights = softmax([0.707, 0.707, 1.414]) = [0.248, 0.248, 0.504]. With V = [[1,0],[0,10],[5,5]], output = 0.248·[1,0] + 0.248·[0,10] + 0.504·[5,5] = [2.766, 5.0]." },
        { title: 'Causal mask: no peeking ahead', body: "For next-token prediction, token i may only attend to tokens ≤ i. Set future scores to −∞ before softmax so their weight is exactly 0. Token 2's weights become [0.330, 0.670, 0] instead of [0.198, 0.401, 0.401]." },
        { title: 'Cost grows with the square of length', body: "The score matrix is n × n. Doubling the context quadruples attention compute and memory, which is why long-context serving relies on fused kernels (FlashAttention) and KV caching." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Attention in one line', body: 'Attention(Q, K, V) = softmax(QKᵀ / √d_k + mask) V', flow: ['X', 'Q = XW_Q, K = XW_K, V = XW_V', 'QKᵀ / √d_k', '+ causal mask (−∞)', 'row softmax', '× V'] },
        { kind: 'tip', title: 'Use the lab', body: 'The Attention X-Ray below draws exactly this N × N matrix with the upper triangle masked. Click a row to see what that token attends to, then load the "Classic injection" preset and toggle instruction-hierarchy training to see attention shift away from the injected tokens.' },
      ],
      code: {
        basic: {
          language: 'py',
          filename: 'attention_from_scratch.py',
          explanation: 'Runnable NumPy implementation of scaled dot-product attention with and without a causal mask. Every number from the intuition steps is asserted, and the √d_k variance argument is checked empirically.',
          code: raw`#  SCALED DOT-PRODUCT ATTENTION (3 tokens, d_k = 2)
#
#          k1     k2     k3                 causal mask
#   q1 [ .707   0     .707 ]               [ 0   -inf  -inf ]
#   q2 [ 0     .707   .707 ]   + mask ->   [ 0    0    -inf ]
#   q3 [ .707  .707  1.414 ]               [ 0    0     0   ]
#            |  row softmax
#            v
#   weights @ V  ->  each output row is a weighted blend of value rows
import numpy as np

def softmax(z, axis=-1):
    z = z - z.max(axis=axis, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=axis, keepdims=True)

def attention(Q, K, V, causal=False):
    d_k = Q.shape[-1]
    scores = Q @ K.T / np.sqrt(d_k)
    if causal:
        n = scores.shape[0]
        scores = np.where(np.triu(np.ones((n, n), dtype=bool), k=1), -np.inf, scores)
    w = softmax(scores)
    return w @ V, w, scores

Q = K = np.array([[1.0, 0.0], [0.0, 1.0], [1.0, 1.0]])
V = np.array([[1.0, 0.0], [0.0, 10.0], [5.0, 5.0]])

out, w, scores = attention(Q, K, V)
assert np.allclose(scores, [[.7071, 0, .7071], [0, .7071, .7071], [.7071, .7071, 1.4142]], atol=1e-4)
assert np.allclose(w, [[.4011, .1978, .4011], [.1978, .4011, .4011], [.2483, .2483, .5035]], atol=1e-4)
assert np.allclose(out, [[2.4067, 3.9833], [2.2033, 6.0167], [2.7657, 5.0]], atol=1e-4)
assert np.allclose(w.sum(axis=1), 1.0)

out_c, w_c, _ = attention(Q, K, V, causal=True)
assert np.allclose(w_c, [[1, 0, 0], [.3302, .6698, 0], [.2483, .2483, .5035]], atol=1e-4)
assert np.allclose(out_c, [[1, 0], [.3302, 6.6976], [2.7657, 5.0]], atol=1e-4)
assert np.all(np.triu(w_c, k=1) == 0)                       # exactly zero weight on the future

# why sqrt(d_k): the variance of q.k grows with d; scaling brings it back to ~1
rng = np.random.default_rng(0)
for d in (16, 256):
    q, k = rng.normal(size=(20000, d)), rng.normal(size=(20000, d))
    dots = (q * k).sum(1)
    assert abs(dots.var() / d - 1) < 0.05 and abs((dots / np.sqrt(d)).var() - 1) < 0.05
print("weights\n", w.round(4), "\ncausal output\n", out_c.round(4))`,
        },
        production: {
          language: 'py',
          filename: 'causal_self_attention.py',
          explanation: "Production PyTorch: one fused QKV projection and F.scaled_dot_product_attention with is_causal=True, which dispatches to FlashAttention-style kernels on supported GPUs and never materializes the full n × n matrix.",
          code: raw`import torch
import torch.nn.functional as F
from torch import nn

class CausalSelfAttention(nn.Module):
    def __init__(self, d_model: int, n_heads: int, p_drop: float = 0.0):
        super().__init__()
        assert d_model % n_heads == 0
        self.h, self.dh = n_heads, d_model // n_heads
        self.qkv = nn.Linear(d_model, 3 * d_model, bias=False)   # one matmul for Q, K, V
        self.proj = nn.Linear(d_model, d_model, bias=False)
        self.p_drop = p_drop

    def forward(self, x):                                       # x: [B, T, d_model]
        B, T, D = x.shape
        q, k, v = self.qkv(x).split(D, dim=-1)
        q, k, v = (t.view(B, T, self.h, self.dh).transpose(1, 2) for t in (q, k, v))  # [B, H, T, dh]
        y = F.scaled_dot_product_attention(                     # scale = 1/sqrt(dh) by default
            q, k, v, is_causal=True, dropout_p=self.p_drop if self.training else 0.0)
        return self.proj(y.transpose(1, 2).reshape(B, T, D))

attn = CausalSelfAttention(d_model=512, n_heads=8)
x = torch.randn(2, 16, 512)
y = attn(x)

# causality test: changing a future token must not change earlier outputs
x2 = x.clone(); x2[:, -1] += 1.0
assert torch.allclose(attn(x2)[:, :-1], y[:, :-1], atol=1e-5)`,
        },
        bug: {
          explanation:
            'Multiplying the weights by a 0/1 mask after softmax zeroes the future positions but leaves each row summing to less than 1, and the probability that should have been redistributed to visible tokens is lost. The mask must be applied to the scores (−∞) before softmax.',
          buggy: {
            language: 'py',
            filename: 'mask.py',
            code: raw`# ❌ Mask applied AFTER softmax: rows no longer sum to 1
w = torch.softmax(q @ k.transpose(-2, -1) / dh ** 0.5, dim=-1)
w = w * torch.tril(torch.ones(T, T))          # row 1 of our example sums to 0.401, not 1
y = w @ v`,
          },
          fixed: {
            language: 'py',
            filename: 'mask.py',
            code: raw`# ✅ Mask the scores with -inf BEFORE softmax
scores = q @ k.transpose(-2, -1) / dh ** 0.5
future = torch.triu(torch.ones(T, T, dtype=torch.bool), diagonal=1)
w = torch.softmax(scores.masked_fill(future, float("-inf")), dim=-1)
y = w @ v                                     # or: F.scaled_dot_product_attention(q, k, v, is_causal=True)`,
          },
        },
      },
      takeaways: [
        'Attention = softmax(QKᵀ / √d_k + mask) · V: a weighted blend of value vectors.',
        'Scaling by √d_k keeps score variance near 1 so softmax does not saturate.',
        'Causal masking sets future scores to −∞ before softmax; never multiply after.',
        'Attention cost is O(n²) in sequence length.',
        'Practice drill: with Q = K = [[1,0],[0,1],[1,1]], compute row 1 of the causal attention weights by hand (it attends only to itself → [1, 0, 0]), then row 2 (softmax([0, 0.707]) = [0.330, 0.670]).',
      ],
      labId: 'prompt-security',
      labMode: 'attention',
    },

    // ------------------------------------------------------------------------
    {
      id: 'ai-mha-gqa-rope',
      title: 'Multi-Head Attention, Grouped-Query Attention & RoPE',
      summary: 'Why models use many attention heads, how GQA shrinks the KV cache, and how rotary position embeddings encode word order as rotations.',
      difficulty: 'Advanced',
      minutes: 25,
      xp: 140,
      analogy:
        "Multi-head attention is a newsroom where several editors read the same article at once: one tracks who did what, one tracks dates, one tracks pronouns. Grouped-query attention lets several editors share the same filing cabinet of notes, which saves a lot of storage. RoPE is a clock face: each word's vector is rotated by an angle proportional to its position, so the angle between two words depends only on how far apart they are.",
      intuition: [
        { title: 'Split d_model into heads', body: "With d_model = 4096 and 32 heads, each head works in 128 dimensions. Heads attend independently in parallel, then their outputs are concatenated and projected back. Different heads learn different relations." },
        { title: 'The reshape that splits heads', body: "`[B, T, D]` → view as `[B, T, H, dh]` → transpose to `[B, H, T, dh]`. The order matters: viewing directly as `[B, H, T, dh]` mixes different tokens into the same head." },
        { title: 'MHA → MQA → GQA', body: "Standard multi-head attention has one K/V head per query head. Multi-query attention shares a single K/V head across all query heads. Grouped-query attention is the middle ground: e.g. 32 query heads share 8 K/V heads (groups of 4), cutting the KV cache by 4× with little quality loss." },
        { title: 'Attention alone ignores order', body: "Without position information, attention is permutation-equivariant: shuffling the tokens just shuffles the outputs. Positions must be injected." },
        { title: 'RoPE rotates pairs of dimensions', body: "Each pair of dimensions (2i, 2i+1) of q and k is rotated by angle `pos · θᵢ`, with `θᵢ = 10000^(−2i/d)`. For d = 128: θ₀ = 1, θ₁ ≈ 0.866, θ₃₂ = 0.01, θ₆₃ ≈ 0.0001. Low pairs spin fast (fine position), high pairs spin slowly (coarse position)." },
        { title: 'Relative position for free', body: "Because rotations compose, `R(m)q · R(n)k = q · R(n−m)k`: the score depends only on the distance. Rotating q = [1,0] by 5 and k = [0.6, 0.8] by 3 gives 0.47775, exactly the same as positions 105 and 103." },
      ],
      callouts: [
        { kind: 'architecture', title: 'GQA head layout (Llama-3-8B style)', body: '32 query heads, 8 key/value heads, head_dim 128. Each K/V head serves a group of 4 query heads.', flow: ['x [B,T,4096]', 'Q: 32 heads × 128', 'K,V: 8 heads × 128', 'RoPE on Q and K', 'repeat K,V ×4', 'attention', 'concat → W_O'] },
        { kind: 'tip', title: 'Long context and RoPE scaling', body: 'Context extension methods (position interpolation, NTK-aware scaling, YaRN) work by changing how positions map to RoPE angles, usually followed by a short fine-tune on long documents.' },
      ],
      code: {
        basic: {
          language: 'py',
          filename: 'heads_and_rope.py',
          explanation: 'Runnable NumPy: head split/merge round-trips correctly, GQA output equals MHA with repeated K/V heads, RoPE frequencies match the formula, and the relative-position property is asserted numerically.',
          code: raw`#  ROPE: rotate each (even, odd) dimension pair by pos * theta_i
#
#        ^ dim 2i+1                 score(q at m, k at n)
#        |   . k rotated by n*theta    = q . R((n - m) * theta) k
#        |  /                          depends only on n - m
#        | /  ) angle (n - m)*theta
#        +-------> dim 2i
import numpy as np

rng = np.random.default_rng(0)
B, T, D, H = 2, 5, 16, 4
dh = D // H

# 1) correct head split: view [B,T,H,dh] then transpose -> [B,H,T,dh]
x = rng.normal(size=(B, T, D))
heads = x.reshape(B, T, H, dh).transpose(0, 2, 1, 3)
assert np.allclose(heads[0, 1, 3], x[0, 3, dh:2 * dh])         # head 1 of token 3 = its 2nd slice
assert np.allclose(heads.transpose(0, 2, 1, 3).reshape(B, T, D), x)   # merge round-trips
wrong = x.reshape(B, H, T, dh)                                  # the classic mistake
assert not np.allclose(wrong[0, 1, 3], x[0, 3, dh:2 * dh])

# 2) GQA: 4 query heads share 2 KV heads == MHA with KV heads repeated
def attn(q, k, v):
    s = q @ k.swapaxes(-1, -2) / np.sqrt(q.shape[-1])
    s = s - s.max(-1, keepdims=True); w = np.exp(s); w /= w.sum(-1, keepdims=True)
    return w @ v
q = rng.normal(size=(4, T, dh)); k = rng.normal(size=(2, T, dh)); v = rng.normal(size=(2, T, dh))
gqa = np.stack([attn(q[h], k[h // 2], v[h // 2]) for h in range(4)])
mha = attn(q, np.repeat(k, 2, axis=0), np.repeat(v, 2, axis=0))
assert np.allclose(gqa, mha)
assert 32 // 8 == 4                                             # Llama-3-8B: KV cache 4x smaller than MHA

# 3) RoPE frequencies and rotation
theta = 10000.0 ** (-2 * np.arange(64) / 128)
assert theta[0] == 1.0 and abs(theta[1] - 0.8660) < 1e-4 and abs(theta[32] - 0.01) < 1e-12
assert abs(theta[63] - 1.155e-4) < 1e-6

def rope(vec, pos, th):
    out = vec.copy()
    for i, t in enumerate(th):
        a, b = vec[2 * i], vec[2 * i + 1]
        c, s = np.cos(pos * t), np.sin(pos * t)
        out[2 * i], out[2 * i + 1] = a * c - b * s, a * s + b * c
    return out

qv, kv = np.array([1.0, 0.0]), np.array([0.6, 0.8])
s1 = rope(qv, 5, [1.0]) @ rope(kv, 3, [1.0])
s2 = rope(qv, 105, [1.0]) @ rope(kv, 103, [1.0])
assert abs(s1 - 0.47775) < 1e-5 and abs(s1 - s2) < 1e-9        # only the distance matters
assert abs(np.linalg.norm(rope(kv, 42, [1.0])) - 1.0) < 1e-12  # rotation preserves length
print(f"RoPE score at (5,3) = {s1:.5f}, at (105,103) = {s2:.5f}")`,
        },
        production: {
          language: 'py',
          filename: 'gqa_rope.py',
          explanation: 'Production PyTorch GQA layer with precomputed RoPE tables (the rotate-half formulation used by Llama-style models) and K/V head repetition before the fused attention kernel.',
          code: raw`import torch
import torch.nn.functional as F
from torch import nn

def rope_tables(head_dim: int, max_pos: int, base: float = 10000.0):
    inv_freq = base ** (-torch.arange(0, head_dim, 2).float() / head_dim)   # theta_i
    ang = torch.outer(torch.arange(max_pos).float(), inv_freq)             # [T, dh/2]
    ang = torch.cat([ang, ang], dim=-1)                                     # [T, dh]
    return ang.cos(), ang.sin()

def rotate_half(x):
    x1, x2 = x.chunk(2, dim=-1)
    return torch.cat([-x2, x1], dim=-1)

def apply_rope(x, cos, sin):                      # x: [B, H, T, dh]
    T = x.shape[-2]
    return x * cos[:T] + rotate_half(x) * sin[:T]

class GQAttention(nn.Module):
    def __init__(self, d_model=4096, n_heads=32, n_kv_heads=8, max_pos=8192):
        super().__init__()
        self.h, self.kvh, self.dh = n_heads, n_kv_heads, d_model // n_heads
        self.wq = nn.Linear(d_model, n_heads * self.dh, bias=False)
        self.wk = nn.Linear(d_model, n_kv_heads * self.dh, bias=False)
        self.wv = nn.Linear(d_model, n_kv_heads * self.dh, bias=False)
        self.wo = nn.Linear(n_heads * self.dh, d_model, bias=False)
        cos, sin = rope_tables(self.dh, max_pos)
        self.register_buffer("cos", cos, persistent=False)
        self.register_buffer("sin", sin, persistent=False)

    def forward(self, x):
        B, T, _ = x.shape
        q = self.wq(x).view(B, T, self.h, self.dh).transpose(1, 2)
        k = self.wk(x).view(B, T, self.kvh, self.dh).transpose(1, 2)
        v = self.wv(x).view(B, T, self.kvh, self.dh).transpose(1, 2)
        q, k = apply_rope(q, self.cos, self.sin), apply_rope(k, self.cos, self.sin)
        rep = self.h // self.kvh
        k, v = k.repeat_interleave(rep, dim=1), v.repeat_interleave(rep, dim=1)   # share KV heads
        y = F.scaled_dot_product_attention(q, k, v, is_causal=True)
        return self.wo(y.transpose(1, 2).reshape(B, T, -1))`,
        },
        bug: {
          explanation:
            'Viewing the projection directly as [B, H, T, dh] reinterprets memory laid out as [B, T, D]: each "head" then contains slices from several different tokens. Shapes are valid, so nothing crashes; the model just trains badly. View as [B, T, H, dh] first, then transpose.',
          buggy: {
            language: 'py',
            filename: 'split_heads.py',
            code: raw`# ❌ Valid shape, scrambled semantics: tokens leak across heads
q = self.wq(x).view(B, self.h, T, self.dh)     # memory is [B, T, D], not [B, H, T, dh]`,
          },
          fixed: {
            language: 'py',
            filename: 'split_heads.py',
            code: raw`# ✅ Split the feature dim into heads, then move heads before time
q = self.wq(x).view(B, T, self.h, self.dh).transpose(1, 2)   # [B, H, T, dh]
# ... attention ...
y = y.transpose(1, 2).reshape(B, T, self.h * self.dh)        # merge back (reshape handles non-contiguous)`,
          },
        },
      },
      takeaways: [
        'Heads split d_model into parallel attention subspaces: view [B,T,H,dh], then transpose.',
        'GQA shares each K/V head across a group of query heads, shrinking the KV cache (4× for 32/8).',
        'RoPE rotates (q, k) dimension pairs by pos·θᵢ, so scores depend only on relative distance.',
        'Practice drill: compute θ₁ for head_dim 64 (10000^(−2/64) ≈ 0.750), and the KV-cache reduction for 64 query heads with 8 KV heads (8×).',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'ai-transformer-block',
      title: 'The Decoder Block, Parameter Counting & the Next-Token Objective',
      summary: 'Assemble a full GPT/Llama-style decoder block (pre-norm, attention, SwiGLU MLP, residuals), count the parameters of an 8B model exactly, and train with shifted labels.',
      difficulty: 'Advanced',
      minutes: 25,
      xp: 140,
      analogy:
        "A decoder block is one round of a meeting. First everyone listens to everyone who has already spoken (attention). Then everyone goes away and thinks privately (the MLP). The residual stream is the running minutes of the meeting: each round adds notes but never erases what was written before. A large model is just the same meeting repeated 32 or 80 times.",
      intuition: [
        { title: 'The residual stream', body: "Each block reads from and writes to the same vector per token: `x = x + Attn(Norm(x))` then `x = x + MLP(Norm(x))`. Information flows forward through additions, which keeps gradients healthy in deep stacks." },
        { title: 'Attention mixes across tokens; the MLP works per token', body: "Attention is the only place tokens exchange information. The MLP processes each position independently and holds most of the parameters (and much of the model's stored knowledge)." },
        { title: 'SwiGLU MLP', body: "Modern models use a gated MLP: `down(SiLU(gate(x)) ⊙ up(x))` with three matrices. Llama-3-8B uses d = 4096 and hidden = 14,336, so the MLP alone has 3 × 4096 × 14,336 = 176.2M parameters per layer." },
        { title: 'Counting an 8B model exactly', body: "Per layer: attention 41.9M (Q, O: 4096²; K, V: 4096 × 1024 with GQA) + MLP 176.2M + two RMSNorm vectors ≈ 218.1M. × 32 layers = 6.98B. Add embeddings (128,256 × 4096 = 525M), an untied output head (525M) and the final norm: 8.03B." },
        { title: 'Next-token objective', body: "Logits at position t predict token t + 1. The loss compares `logits[:, :-1]` with `labels[:, 1:]`. Without the shift, the model learns to copy the current input token, and the loss looks suspiciously perfect." },
        { title: 'Weight tying and the output head', body: "The final hidden state is projected to vocabulary logits. Small models often tie this matrix to the input embedding to save parameters; large models such as Llama-3-8B keep them separate." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Pre-norm decoder block', body: 'Repeated N times between the token embedding and the LM head.', flow: ['x', 'RMSNorm → GQA + RoPE', 'x + attn', 'RMSNorm → SwiGLU MLP', 'x + mlp', 'next block … final norm → LM head'] },
        { kind: 'tip', title: 'Count parameters before you train', body: 'A quick parameter count catches config typos (a wrong hidden size or head count) before they cost GPU hours, and it tells you the memory you need: params × bytes per param, before activations and optimizer state.' },
      ],
      code: {
        basic: {
          language: 'py',
          filename: 'tiny_gpt_forward.py',
          explanation: 'Runnable NumPy forward pass of a 2-layer pre-norm decoder with causal attention and a SwiGLU MLP. Asserts causality (future tokens never change past logits), the exact Llama-3-8B parameter count, and the shifted next-token loss.',
          code: raw`#  DECODER-ONLY TRANSFORMER
#
#  tokens -> embed -> [ x + Attn(RMSNorm(x)) ; x + MLP(RMSNorm(x)) ] x N -> RMSNorm -> LM head
#                     \______________ residual stream ______________/
#  position t's logits predict token t+1  (labels shifted left by one)
import numpy as np

rng = np.random.default_rng(0)
V, D, HID, L, T = 50, 32, 64, 2, 6

def rmsnorm(x, eps=1e-6):
    return x / np.sqrt((x ** 2).mean(-1, keepdims=True) + eps)

def softmax(z):
    z = z - z.max(-1, keepdims=True); e = np.exp(z); return e / e.sum(-1, keepdims=True)

silu = lambda z: z / (1 + np.exp(-z))
P = {"emb": rng.normal(0, 0.1, (V, D)), "head": rng.normal(0, 0.1, (D, V))}
for l in range(L):
    for n, s in [("wq", (D, D)), ("wk", (D, D)), ("wv", (D, D)), ("wo", (D, D)),
                 ("gate", (D, HID)), ("up", (D, HID)), ("down", (HID, D))]:
        P[f"{l}.{n}"] = rng.normal(0, 0.1, s)

def forward(ids):
    x = P["emb"][ids]
    mask = np.triu(np.ones((len(ids), len(ids)), dtype=bool), 1)
    for l in range(L):
        h = rmsnorm(x)
        q, k, v = h @ P[f"{l}.wq"], h @ P[f"{l}.wk"], h @ P[f"{l}.wv"]
        s = np.where(mask, -np.inf, q @ k.T / np.sqrt(D))
        x = x + softmax(s) @ v @ P[f"{l}.wo"]                      # attention: mixes tokens
        h = rmsnorm(x)
        x = x + (silu(h @ P[f"{l}.gate"]) * (h @ P[f"{l}.up"])) @ P[f"{l}.down"]   # SwiGLU: per token
    return rmsnorm(x) @ P["head"]                                   # [T, V] logits

ids = rng.integers(0, V, T)
logits = forward(ids)
ids2 = ids.copy(); ids2[-1] = (ids2[-1] + 1) % V
assert np.allclose(forward(ids2)[:-1], logits[:-1])                 # causal: past unaffected

# shifted next-token cross-entropy
p = softmax(logits[:-1])
loss = -np.log(p[np.arange(T - 1), ids[1:]]).mean()
assert abs(loss - np.log(V)) < 0.5                                 # untrained model ~ ln(V)

# exact Llama-3-8B parameter count
d, hidden, layers, vocab, kv = 4096, 14336, 32, 128256, 8 * 128
attn = d * d + d * kv + d * kv + d * d                             # q, k, v, o (GQA)
mlp = 3 * d * hidden                                               # gate, up, down
per_layer = attn + mlp + 2 * d                                     # + two RMSNorm weights
total = layers * per_layer + 2 * vocab * d + d                     # + embed, untied head, final norm
assert attn == 41_943_040 and mlp == 176_160_768 and per_layer == 218_112_000
assert total == 8_030_261_248
print(f"loss {loss:.3f} (ln V = {np.log(V):.3f}); Llama-3-8B params = {total:,}")`,
        },
        production: {
          language: 'py',
          filename: 'decoder_lm.py',
          explanation: 'Production PyTorch decoder LM: pre-norm blocks with the GQA layer from the previous chapter, a SwiGLU MLP, optional weight tying, the shifted loss with ignore_index for padding, and a parameter count printed at start-up.',
          code: raw`import torch
import torch.nn.functional as F
from torch import nn

class SwiGLU(nn.Module):
    def __init__(self, d, hidden):
        super().__init__()
        self.gate = nn.Linear(d, hidden, bias=False)
        self.up = nn.Linear(d, hidden, bias=False)
        self.down = nn.Linear(hidden, d, bias=False)
    def forward(self, x):
        return self.down(F.silu(self.gate(x)) * self.up(x))

class Block(nn.Module):
    def __init__(self, d, hidden, n_heads, n_kv):
        super().__init__()
        self.n1, self.n2 = nn.RMSNorm(d), nn.RMSNorm(d)
        self.attn = GQAttention(d, n_heads, n_kv)          # from the GQA + RoPE chapter
        self.mlp = SwiGLU(d, hidden)
    def forward(self, x):
        x = x + self.attn(self.n1(x))
        return x + self.mlp(self.n2(x))

class DecoderLM(nn.Module):
    def __init__(self, vocab, d=1024, hidden=2816, layers=16, n_heads=16, n_kv=4, tie=True):
        super().__init__()
        self.emb = nn.Embedding(vocab, d)
        self.blocks = nn.ModuleList(Block(d, hidden, n_heads, n_kv) for _ in range(layers))
        self.norm = nn.RMSNorm(d)
        self.head = nn.Linear(d, vocab, bias=False)
        if tie:
            self.head.weight = self.emb.weight                 # weight tying for small models

    def forward(self, ids, labels=None):
        x = self.emb(ids)
        for b in self.blocks:
            x = b(x)
        logits = self.head(self.norm(x))
        if labels is None:
            return logits
        loss = F.cross_entropy(logits[:, :-1].reshape(-1, logits.size(-1)),   # predict t+1
                               labels[:, 1:].reshape(-1), ignore_index=-100)   # -100 = padding/prompt
        return logits, loss

model = DecoderLM(vocab=32000)
print(f"{sum(p.numel() for p in model.parameters()) / 1e6:.1f}M parameters")`,
        },
        bug: {
          explanation:
            'Without shifting, position t is trained to output token t, which it can already see. The loss quickly drops toward zero and the model learns to copy instead of predict. Shift logits and labels by one (Hugging Face causal-LM models do this internally when you pass labels=input_ids, so do not shift twice).',
          buggy: {
            language: 'py',
            filename: 'loss.py',
            code: raw`# ❌ No shift: the model is graded on copying its own input
logits = model(ids)                                        # [B, T, V]
loss = F.cross_entropy(logits.reshape(-1, V), ids.reshape(-1))   # suspiciously near 0`,
          },
          fixed: {
            language: 'py',
            filename: 'loss.py',
            code: raw`# ✅ Logits at t predict the token at t+1
logits = model(ids)
loss = F.cross_entropy(logits[:, :-1].reshape(-1, V), ids[:, 1:].reshape(-1),
                       ignore_index=-100)
# Hugging Face: model(input_ids=ids, labels=ids).loss already shifts internally`,
          },
        },
      },
      takeaways: [
        'A decoder block = x + Attn(Norm(x)), then x + MLP(Norm(x)), repeated N times.',
        'Attention mixes information across tokens; the MLP (most of the parameters) works per token.',
        'Llama-3-8B: 218.1M parameters per layer × 32 + 1.05B embedding/head = 8.03B.',
        'Next-token loss needs logits[:, :-1] vs labels[:, 1:]; an untrained model starts near ln(vocab).',
        'Practice drill: count the parameters of one SwiGLU MLP with d = 2048 and hidden = 5632 (3 × 2048 × 5632 = 34.6M).',
      ],
    },
  ],
};
