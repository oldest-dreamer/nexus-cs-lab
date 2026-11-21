import type { Module } from '../../types';

const raw = String.raw;

export const inferenceModule: Module = {
  id: 'ai-inference',
  title: 'Inference, Sampling & Reasoning Models',
  level: 'Advanced',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'ai-sampling',
      title: 'Decoding Strategies: Greedy, Temperature, Top-k & Top-p',
      summary: 'Turn next-token logits into text: how temperature reshapes the distribution, how nucleus sampling cuts the tail, and which settings to use for which job.',
      difficulty: 'Intermediate',
      minutes: 20,
      xp: 110,
      analogy:
        "The model hands you a ranked menu of next words with odds. Greedy decoding always orders the top dish. Temperature is how adventurous you feel: low temperature makes the favourite dominate, high temperature flattens the odds. Top-p tears off the bottom of the menu so that, however adventurous you are, you never order something absurd.",
      intuition: [
        { title: 'The model outputs logits', body: "For the prompt \"The capital of France is\", suppose the logits for [Paris, Lyon, France, banana] are [2.0, 1.0, 0.5, −1.0]. Softmax at T = 1 gives [0.610, 0.224, 0.136, 0.030]." },
        { title: 'Temperature divides the logits', body: "`p = softmax(z / T)`. T = 0.5 sharpens to [0.842, 0.114, 0.042, 0.002]; T = 2 flattens to [0.434, 0.264, 0.205, 0.097]. T → 0 approaches greedy argmax." },
        { title: 'Top-k keeps a fixed number', body: "Keep only the k most likely tokens and renormalize. Simple, but k = 40 is too many when the model is certain and too few when many continuations are reasonable." },
        { title: 'Top-p (nucleus) keeps a probability mass', body: "Sort by probability and keep the smallest set whose cumulative mass reaches p. With p = 0.9 at T = 1: Paris (0.610) + Lyon (0.834) + France (0.970 ≥ 0.9) are kept, banana is cut, and the survivors renormalize to [0.629, 0.231, 0.140]." },
        { title: 'Pick settings by task', body: "Extraction, classification, code and tool calls: T = 0 (or very low) for repeatability. Creative writing and brainstorming: T ≈ 0.7–1.0 with top-p ≈ 0.9–0.95. Note that even T = 0 is not perfectly deterministic on GPUs because batching changes floating-point order." },
        { title: 'Other knobs', body: "Repetition/frequency penalties lower logits of tokens already used; stop sequences end generation; max-tokens caps cost; min-p keeps tokens with probability at least a fraction of the top token's." },
      ],
      callouts: [
        { kind: 'architecture', title: 'One decoding step', body: 'Repeated once per generated token, feeding each chosen token back in.', flow: ['logits z', 'penalties', 'z / T', 'softmax', 'top-k / top-p filter', 'renormalize', 'sample token'] },
        { kind: 'tip', title: 'Use the lab', body: 'In the Attention X-Ray lab below, drag the Temperature and Top-p sliders under "Next-token probabilities". Struck-through tokens are outside the nucleus and can never be sampled; watch how a high temperature with top-p = 1 lets the unsafe continuation through.' },
        { kind: 'security', title: 'Sampling is not a safety control', body: 'Low temperature makes outputs more repeatable, not safer. If a harmful continuation is likely, greedy decoding will pick it every time. Safety comes from training, the instruction hierarchy and output checks.' },
      ],
      code: {
        basic: {
          language: 'py',
          filename: 'sampling_from_scratch.py',
          explanation: 'Runnable NumPy: temperature, top-k, top-p and greedy decoding on the Paris example, with every probability from the intuition steps asserted and an empirical sampling check.',
          code: raw`#  NUCLEUS (TOP-P = 0.9) AT T = 1
#
#   Paris   ############################## 0.610   cum 0.610  keep
#   Lyon    ###########                    0.224   cum 0.834  keep
#   France  #######                        0.136   cum 0.970  keep (crosses 0.9)
#   banana  #                              0.030   cut
import numpy as np

tokens = ["Paris", "Lyon", "France", "banana"]
z = np.array([2.0, 1.0, 0.5, -1.0])

def softmax(x):
    e = np.exp(x - x.max()); return e / e.sum()

def with_temperature(z, T):
    return softmax(z / T)

def top_k(p, k):
    keep = np.argsort(-p)[:k]
    out = np.zeros_like(p); out[keep] = p[keep]; return out / out.sum()

def top_p(p, thresh):
    order = np.argsort(-p)
    cum = np.cumsum(p[order])
    n_keep = int(np.searchsorted(cum, thresh) + 1)   # include the token that crosses p
    out = np.zeros_like(p); out[order[:n_keep]] = p[order[:n_keep]]
    return out / out.sum()

assert np.allclose(with_temperature(z, 1.0), [.6095, .2242, .1360, .0303], atol=1e-4)
assert np.allclose(with_temperature(z, 0.5), [.8420, .1140, .0419, .0021], atol=1e-4)
assert np.allclose(with_temperature(z, 2.0), [.4344, .2635, .2052, .0969], atol=1e-4)
assert np.allclose(top_p(with_temperature(z, 1.0), 0.9), [.6285, .2312, .1402, 0], atol=1e-4)
assert np.allclose(top_k(with_temperature(z, 1.0), 2), [.7311, .2689, 0, 0], atol=1e-4)
assert tokens[int(np.argmax(z))] == "Paris"                       # greedy
assert with_temperature(z, 0.01)[0] > 0.999                       # T -> 0 approaches greedy

# empirical check: sampled frequencies match the nucleus distribution
rng = np.random.default_rng(0)
p = top_p(with_temperature(z, 1.0), 0.9)
draws = rng.choice(len(tokens), size=100_000, p=p)
freq = np.bincount(draws, minlength=4) / len(draws)
assert np.allclose(freq, p, atol=0.01) and freq[3] == 0           # banana never sampled
print({t: round(float(x), 4) for t, x in zip(tokens, p)})`,
        },
        production: {
          language: 'py',
          filename: 'generation_profiles.py',
          explanation: 'Production pattern: named generation profiles per task, applied through Hugging Face generate (the same fields exist in vLLM SamplingParams and most hosted APIs), with a seed for reproducible experiments.',
          code: raw`# pip install transformers torch
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, GenerationConfig

PROFILES = {
    "extract":  GenerationConfig(do_sample=False, max_new_tokens=256),               # greedy
    "code":     GenerationConfig(do_sample=True, temperature=0.2, top_p=0.95, max_new_tokens=1024),
    "chat":     GenerationConfig(do_sample=True, temperature=0.7, top_p=0.9, max_new_tokens=512,
                                 repetition_penalty=1.05),
    "creative": GenerationConfig(do_sample=True, temperature=1.0, top_p=0.95, max_new_tokens=800),
}

name = "Qwen/Qwen2.5-0.5B-Instruct"
tok = AutoTokenizer.from_pretrained(name)
model = AutoModelForCausalLM.from_pretrained(name, torch_dtype=torch.bfloat16, device_map="auto")

def generate(messages, profile="chat", seed=None):
    if seed is not None:
        torch.manual_seed(seed)                                  # reproducible sampling runs
    ids = tok.apply_chat_template(messages, add_generation_prompt=True,
                                  return_tensors="pt").to(model.device)
    out = model.generate(ids, generation_config=PROFILES[profile],
                         pad_token_id=tok.eos_token_id)
    return tok.decode(out[0, ids.shape[-1]:], skip_special_tokens=True)

print(generate([{"role": "user", "content": "Extract the date: 'Invoice issued 3 May 2026'"}], "extract"))`,
        },
        bug: {
          explanation:
            'Dividing probabilities by T and renormalizing cancels out exactly, so temperature appears to do nothing. Temperature must divide the logits before softmax (equivalently, raise probabilities to the power 1/T).',
          buggy: {
            language: 'py',
            filename: 'temperature.py',
            code: raw`# ❌ Temperature applied to probabilities: (p / T) / sum(p / T) == p
p = softmax(z)
p = p / T
p = p / p.sum()            # identical to the original distribution for every T`,
          },
          fixed: {
            language: 'py',
            filename: 'temperature.py',
            code: raw`# ✅ Temperature scales the logits
p = softmax(z / T)         # same as p ** (1 / T) renormalized`,
          },
        },
      },
      takeaways: [
        'Temperature divides logits before softmax: below 1 sharpens, above 1 flattens.',
        'Top-p keeps the smallest set of tokens whose mass reaches p, including the one that crosses it.',
        'Use T = 0 for extraction, code and tool calls; higher T with top-p for open-ended text.',
        'Sampling settings change repeatability, not safety.',
        'Practice drill: for logits [1, 1, 0], compute softmax at T = 1 ([0.422, 0.422, 0.155]) and decide which tokens survive top-p = 0.8 (the first two).',
      ],
      labId: 'prompt-security',
      labMode: 'attention',
    },

    // ------------------------------------------------------------------------
    {
      id: 'ai-kv-cache-quantization',
      title: 'KV Cache, Prefill vs Decode & Quantization',
      summary: 'Why generation is memory-bound, exactly how much memory the KV cache needs, and how int8/int4 quantization lets an 8B model fit on a laptop GPU.',
      difficulty: 'Advanced',
      minutes: 25,
      xp: 140,
      analogy:
        "Without a KV cache, writing each new word means rereading the whole book from page one. The KV cache is a stack of sticky notes summarising every page already read, so each new word only needs to read its own page and glance at the notes. Quantization is writing those notes, and the model itself, in shorthand: a little less precise, a lot less paper.",
      intuition: [
        { title: 'Prefill vs decode', body: "Prefill processes the whole prompt in parallel (compute-bound, fast per token). Decode then generates one token at a time; each step must read all the weights and the whole KV cache from memory (memory-bandwidth-bound). Time-to-first-token is dominated by prefill; tokens-per-second by decode." },
        { title: 'What the cache stores', body: "Past tokens' keys and values never change, so they are stored once. Each new token computes only its own q, k, v and attends to the cache. Without the cache, step n would recompute n tokens: O(n²) total work." },
        { title: 'KV cache size formula', body: "`bytes/token = 2 (K and V) × layers × kv_heads × head_dim × bytes`. Llama-3-8B in fp16: 2 × 32 × 8 × 128 × 2 = 131,072 B = 128 KiB per token. An 8,192-token context = 1 GiB; a batch of 16 such sequences = 16 GiB." },
        { title: 'GQA pays for itself here', body: "With 32 K/V heads (plain MHA) the same model would need 512 KiB per token, 4 GiB per 8K sequence. This is why GQA, paged KV memory (vLLM's PagedAttention) and KV-cache quantization matter for serving throughput." },
        { title: 'Weight quantization', body: "8.03B parameters: fp16 = 16.06 GB, int8 = 8.03 GB, int4 = 4.02 GB (≈ 4.5 GB in practice once per-group scales are included). Symmetric int8: `scale = max|w| / 127`, `q = round(w / scale)`, `w ≈ q · scale`." },
        { title: 'Where quantization hurts', body: "Outlier weights and activations dominate the scale and crush small values to zero. Per-channel or per-group scales (e.g. 128 weights per group), and methods such as GPTQ, AWQ and NF4 reduce the error. Always re-run your evals after quantizing." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Serving one request', body: 'Prompt tokens are processed together, then one token per step reuses the cache.', flow: ['prompt', 'prefill (parallel)', 'KV cache filled', 'decode step: 1 token', 'append k, v to cache', 'repeat until stop'] },
        { kind: 'warning', title: 'Budget memory for the cache, not just the weights', body: 'An int4 8B model fits in ~5 GB, but 16 concurrent 8K-token conversations add 16 GiB of fp16 KV cache. Concurrency × context length usually determines your GPU, not parameter count alone.' },
      ],
      code: {
        basic: {
          language: 'py',
          filename: 'kv_cache_and_quant.py',
          explanation: 'Runnable NumPy: incremental decoding with a KV cache produces exactly the same outputs as full recomputation; exact KV-cache and weight-memory math for Llama-3-8B; symmetric int8 quantization with per-group scales beating a single scale on outliers.',
          code: raw`#  DECODE WITH A KV CACHE
#
#   step 1: q1 . [k1]            cache K=[k1]       V=[v1]
#   step 2: q2 . [k1 k2]         cache K=[k1 k2]    V=[v1 v2]
#   step 3: q3 . [k1 k2 k3]      only the NEW token is projected each step
import numpy as np

rng = np.random.default_rng(0)
D, T = 8, 6
Wq, Wk, Wv = (rng.normal(size=(D, D)) for _ in range(3))
X = rng.normal(size=(T, D))

def softmax(s):
    s = s - s.max(-1, keepdims=True); e = np.exp(s); return e / e.sum(-1, keepdims=True)

# full causal recomputation
Q, K, V = X @ Wq, X @ Wk, X @ Wv
S = np.where(np.triu(np.ones((T, T), bool), 1), -np.inf, Q @ K.T / np.sqrt(D))
full = softmax(S) @ V

# incremental decoding with a cache
k_cache, v_cache, outs = [], [], []
for t in range(T):
    x = X[t]
    k_cache.append(x @ Wk); v_cache.append(x @ Wv)            # store once, reuse forever
    q = x @ Wq
    w = softmax(q @ np.array(k_cache).T / np.sqrt(D))
    outs.append(w @ np.array(v_cache))
assert np.allclose(np.array(outs), full)

# KV cache memory: 2 (K,V) * layers * kv_heads * head_dim * bytes
per_tok = lambda layers, kv_heads, head_dim, nbytes=2: 2 * layers * kv_heads * head_dim * nbytes
GiB = 1024 ** 3
assert per_tok(32, 8, 128) == 131_072                         # 128 KiB / token (GQA, fp16)
assert per_tok(32, 8, 128) * 8192 == 1 * GiB
assert per_tok(32, 32, 128) * 8192 == 4 * GiB                 # same model with plain MHA
assert per_tok(32, 8, 128) * 8192 * 16 == 16 * GiB            # batch of 16

# weight memory for 8.03B params
n = 8.03e9
assert [round(n * b / 1e9, 3) for b in (2, 1, 0.5)] == [16.06, 8.03, 4.015]

# symmetric int8 quantization
w = np.array([0.5, -1.27, 0.03, 1.0])
scale = np.abs(w).max() / 127                                 # 0.01
q = np.round(w / scale).astype(np.int8)
assert np.allclose(scale, 0.01) and q.tolist() == [50, -127, 3, 100]
assert np.allclose(q * scale, w)

# an outlier ruins a single scale; per-group scales fix it
w = np.concatenate([rng.normal(0, 0.01, 127), [5.0]])
def quant_err(w, group):
    err = []
    for g in w.reshape(-1, group):
        s = np.abs(g).max() / 127
        err.append(np.abs(np.round(g / s) * s - g))
    return np.concatenate(err)[:-1].mean()                    # error on the small weights
assert quant_err(w, 16) < quant_err(w, 128) / 5
print("KV cache matches full recompute; int8 q =", q.tolist())`,
        },
        production: {
          language: 'py',
          filename: 'serve.py',
          explanation: 'Production patterns: load a 4-bit NF4 model with bitsandbytes for single-GPU experiments, and serve with vLLM (paged KV cache, continuous batching) with explicit memory and context limits.',
          code: raw`# --- A) single-GPU experiments: 4-bit NF4 weights
# pip install transformers bitsandbytes accelerate
import torch
from transformers import AutoModelForCausalLM, BitsAndBytesConfig

bnb = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4",
                         bnb_4bit_compute_dtype=torch.bfloat16, bnb_4bit_use_double_quant=True)
model = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-3.1-8B-Instruct",
                                             quantization_config=bnb, device_map="auto")
print(f"weights: {model.get_memory_footprint() / 1e9:.2f} GB")

# --- B) production serving: vLLM
# pip install vllm
from vllm import LLM, SamplingParams

llm = LLM(
    model="meta-llama/Llama-3.1-8B-Instruct",
    max_model_len=8192,              # caps KV cache per sequence (~1 GiB fp16 at 8K)
    gpu_memory_utilization=0.90,     # weights + paged KV cache pool
    enable_prefix_caching=True,      # reuse KV for shared system prompts
)
params = SamplingParams(temperature=0.0, max_tokens=256)
outs = llm.generate(["Summarize: ..."] * 32, params)   # continuous batching
for o in outs[:2]:
    print(o.outputs[0].text)`,
        },
        bug: {
          explanation:
            'With RoPE, every new token must be rotated by its absolute position. A hand-written decode loop that passes positions starting from 0 at every step rotates the new key/query as if it were the first token, so attention to the cached tokens is computed at the wrong distances and output quality silently collapses. The fix offsets positions by the cache length.',
          buggy: {
            language: 'py',
            filename: 'decode_loop.py',
            code: raw`# ❌ Position restarts at 0 for each new token
for step in range(max_new):
    pos = torch.arange(next_ids.shape[1])                 # always [0]
    logits, cache = model(next_ids, positions=pos, kv_cache=cache)
    next_ids = logits[:, -1:].argmax(-1)`,
          },
          fixed: {
            language: 'py',
            filename: 'decode_loop.py',
            code: raw`# ✅ New tokens continue from the cached length
past = prompt_len
for step in range(max_new):
    pos = torch.arange(past, past + next_ids.shape[1])    # absolute positions
    logits, cache = model(next_ids, positions=pos, kv_cache=cache)
    past += next_ids.shape[1]
    next_ids = logits[:, -1:].argmax(-1)`,
          },
        },
      },
      takeaways: [
        'Prefill is compute-bound and parallel; decode is memory-bound, one token at a time.',
        'KV cache bytes/token = 2 × layers × kv_heads × head_dim × bytes (128 KiB for Llama-3-8B fp16).',
        'int4 weights fit an 8B model in ~4.5 GB, but concurrency × context sets the KV-cache budget.',
        'Per-group scales limit quantization error from outliers; re-run evals after quantizing.',
        'Practice drill: compute the fp16 KV cache for 80 layers, 8 KV heads, head_dim 128 at 32K tokens (2 × 80 × 8 × 128 × 2 × 32,768 = 10 GiB).',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'ai-reasoning-models',
      title: 'Reasoning Models, Test-Time Compute & Self-Consistency',
      summary: 'How models that "think before answering" trade tokens for accuracy, how to budget that compute, and how voting and verifiers make answers more reliable.',
      difficulty: 'Advanced',
      minutes: 20,
      xp: 120,
      analogy:
        "Asking a model for an instant answer is like asking a student to shout out the result of a long division. Letting it reason is handing them scratch paper. Self-consistency is asking five students independently and taking the majority. A verifier is the teacher who checks the work. Each costs more time and paper, so you only use it where accuracy is worth paying for.",
      intuition: [
        { title: 'Reasoning = generating intermediate tokens', body: "Every token the model generates is extra computation it can condition on. Chain-of-thought prompting asks for steps explicitly; reasoning models are trained (often with reinforcement learning on verifiable tasks) to produce long internal reasoning before the final answer." },
        { title: 'Test-time compute is a dial', body: "Many APIs expose a reasoning effort or thinking-token budget. More thinking usually helps on multi-step maths, code and planning, and helps little on lookups, formatting or simple classification." },
        { title: 'Thinking tokens cost money and latency', body: "Illustrative prices of $3/M input and $15/M output tokens, 1,500 input and 400 answer tokens: no thinking = $0.0105; 2,000 thinking tokens = $0.0405 (≈ 3.9×); 16,000 thinking tokens = $0.2505 (≈ 24×). Route only hard requests to high budgets." },
        { title: 'Self-consistency', body: "Sample n independent reasoning paths and majority-vote the final answers. If each path is right with p = 0.6 and wrong answers happen to agree (the worst case), a 5-vote majority is right with probability 0.683. When wrong answers scatter, voting helps even more." },
        { title: 'Verifiers beat voting when you have them', body: "If you can check an answer (run unit tests, re-derive arithmetic, validate against a schema), generate several candidates and keep one that passes. Best-of-n with a reliable verifier is one of the strongest test-time techniques." },
        { title: 'Treat reasoning text as untrusted, and extract answers strictly', body: "Ask for the final answer in a fixed format or schema and parse only that field. Reasoning text can be long, can mention wrong intermediate values, and should not be shown to end users or logged without review if it may contain sensitive context." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Adaptive reasoning router', body: 'Spend test-time compute only where it changes the outcome.', flow: ['request', 'difficulty classifier', 'easy → fast model, no thinking', 'hard → reasoning budget', 'n samples + verifier/vote', 'structured final answer'] },
        { kind: 'tip', title: 'Measure, do not assume', body: 'Plot accuracy vs. cost for 0, low, medium and high reasoning budgets on your own eval set. The curve usually flattens; pick the knee, not the maximum.' },
      ],
      code: {
        basic: {
          language: 'py',
          filename: 'test_time_compute.py',
          explanation: 'Runnable, dependency-free: exact self-consistency probabilities from the binomial distribution, a simulation confirming them, the thinking-budget cost table, and best-of-n with a verifier.',
          code: raw`#  SELF-CONSISTENCY (n = 5, each path correct with p = 0.6)
#
#   path 1: ... -> 42  OK      votes: 42 x3   41 x2
#   path 2: ... -> 41  wrong                -> answer 42
#   path 3: ... -> 42  OK
#   path 4: ... -> 42  OK      P(majority correct) = sum_{k>=3} C(5,k) p^k (1-p)^(5-k)
#   path 5: ... -> 41  wrong                       = 0.68256
import random
from collections import Counter
from math import comb

def p_majority(p, n):
    return sum(comb(n, k) * p ** k * (1 - p) ** (n - k) for k in range(n // 2 + 1, n + 1))

assert abs(p_majority(0.6, 5) - 0.68256) < 1e-12
assert p_majority(0.6, 1) == 0.6 and p_majority(0.6, 15) > 0.78
assert p_majority(0.4, 5) < 0.4                       # voting HURTS when each path is usually wrong

# simulate: wrong answers all agree on 41 (worst case for voting)
random.seed(0)
trials, wins = 50_000, 0
for _ in range(trials):
    votes = Counter(42 if random.random() < 0.6 else 41 for _ in range(5))
    wins += votes.most_common(1)[0][0] == 42
assert abs(wins / trials - 0.68256) < 0.01

# cost of thinking tokens (illustrative prices, USD per token)
PRICE_IN, PRICE_OUT = 3 / 1e6, 15 / 1e6
def cost(thinking, inp=1500, answer=400):
    return inp * PRICE_IN + (thinking + answer) * PRICE_OUT   # thinking is billed as output
table = {t: round(cost(t), 4) for t in (0, 2000, 16000)}
assert table == {0: 0.0105, 2000: 0.0405, 16000: 0.2505}

# best-of-n with a verifier: keep the first candidate that passes the check
def verifier(candidate):                               # e.g. unit tests; here: is it a root?
    return candidate ** 2 - 5 * candidate + 6 == 0
candidates = [4, 1, 3, 2]                              # four sampled answers
chosen = next((c for c in candidates if verifier(c)), None)
assert chosen == 3
print("P(majority)", round(p_majority(0.6, 5), 5), "costs", table, "verified", chosen)`,
        },
        production: {
          language: 'py',
          filename: 'reasoning_router.py',
          explanation: 'Provider-agnostic production pattern: route by difficulty, request a structured final answer, run n parallel samples only for hard requests, and verify or vote. `call_llm` wraps whichever SDK you use.',
          code: raw`import asyncio
import json
from collections import Counter

ANSWER_SCHEMA = {"type": "object", "properties": {"final_answer": {"type": "string"}},
                 "required": ["final_answer"], "additionalProperties": False}

async def call_llm(messages, *, reasoning: str, temperature: float) -> dict:
    """Wrap your provider SDK here. Return {'final_answer': ..., 'usage': {...}}.
    'reasoning' maps to the provider's effort/budget setting (e.g. none/low/high)."""
    raise NotImplementedError

def is_hard(question: str) -> bool:
    # start with a cheap heuristic or classifier; tune it on your eval set
    return any(w in question.lower() for w in ("prove", "optimize", "debug", "plan", "how many"))

async def answer(question: str, verify=None, n: int = 5) -> str:
    msgs = [{"role": "system", "content": "Respond as JSON matching: " + json.dumps(ANSWER_SCHEMA)},
            {"role": "user", "content": question}]
    if not is_hard(question):
        return (await call_llm(msgs, reasoning="none", temperature=0))["final_answer"]

    runs = await asyncio.gather(*[call_llm(msgs, reasoning="high", temperature=0.8)
                                  for _ in range(n)])
    answers = [r["final_answer"].strip() for r in runs]
    if verify:                                      # verifier first: tests, schema, re-check
        for a in answers:
            if verify(a):
                return a
    best, votes = Counter(answers).most_common(1)[0]
    if votes <= n // 2:
        return "UNSURE: " + best                    # no majority -> escalate / ask a human
    return best`,
        },
        bug: {
          explanation:
            'Grabbing the first number in free-form output often returns an intermediate value from the reasoning rather than the final answer, so evals and downstream code receive the wrong result. The fix asks for a structured final answer and parses only that field, failing loudly if it is missing.',
          buggy: {
            language: 'py',
            filename: 'parse.py',
            code: raw`# ❌ "First we compute 12 * 4 = 48, then subtract 6, so the answer is 42" -> returns 12
import re
answer = re.search(r"-?\d+", output_text).group()`,
          },
          fixed: {
            language: 'py',
            filename: 'parse.py',
            code: raw`# ✅ Request {"final_answer": ...} and parse only that field
import json
data = json.loads(output_text)
if "final_answer" not in data:
    raise ValueError("model did not return a final_answer")
answer = data["final_answer"]`,
          },
        },
      },
      takeaways: [
        'Reasoning = spending more generated tokens per answer; it helps most on multi-step, checkable tasks.',
        'Thinking tokens are billed and add latency: route only hard requests to high budgets.',
        'Self-consistency helps when each path is right more often than not (p > 0.5); verifiers help most.',
        'Always extract a structured final answer instead of scraping free text.',
        'Practice drill: compute P(majority correct) for n = 3, p = 0.7 (3 × 0.49 × 0.3 + 0.343 = 0.784).',
      ],
    },
  ],
};
