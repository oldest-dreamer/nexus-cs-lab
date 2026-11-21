import type { Module } from '../../types';

const raw = String.raw;

export const tokensEmbeddingsModule: Module = {
  id: 'ai-tokens-embeddings',
  title: 'Tokenization & Embeddings',
  level: 'Intermediate',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'ai-bpe-tokenization',
      title: 'Byte-Pair Encoding (BPE) & How LLMs Actually See Text',
      summary: 'Train a BPE tokenizer from scratch, understand why token counts drive cost and context limits, and use chat templates correctly.',
      difficulty: 'Intermediate',
      minutes: 22,
      xp: 110,
      analogy:
        "A tokenizer is a shorthand stenographer. At first they write every letter. After a week they notice \"t-h-e\" appears constantly and invent a single squiggle for it. Then a squiggle for \"ing\", then for \"tion\". BPE is that process written as an algorithm: repeatedly give the most common neighbouring pair its own symbol until the dictionary reaches the size you want.",
      intuition: [
        { title: 'Models read integers, not letters', body: "Text → tokens → integer IDs → embedding vectors. The model never sees characters directly, which is why it can miscount letters in \"strawberry\": the word may be only two or three tokens." },
        { title: 'Start from characters (or bytes)', body: "Split every word into symbols and mark the word end with `</w>`. Byte-level BPE (GPT-2 style) starts from the 256 byte values, so any UTF-8 string, emoji or binary-looking text can be encoded with no unknown token." },
        { title: 'Count pairs, merge the most frequent', body: "Corpus {low: 5, lower: 2, newest: 6, widest: 3}. The pair (e, s) appears 6 + 3 = 9 times, so it becomes the symbol `es`. Then (es, t) = 9 → `est`, then (est, </w>) = 9 → `est</w>`, then (l, o) = 7 → `lo`, and so on." },
        { title: 'Encoding replays the merges in order', body: "To tokenize new text, split it into symbols and apply the learned merges in the order they were learned. Unseen words fall back to smaller pieces: `lowest` becomes `low` + `est</w>`." },
        { title: 'Tokens are the unit of cost and context', body: "Context windows, pricing and rate limits are counted in tokens. English averages roughly ¾ of a word per token, but code, non-English scripts and numbers can need many more tokens per character. Always measure with the model's own tokenizer." },
        { title: 'Special tokens and chat templates', body: "Models are trained with role markers and end-of-turn tokens. Each model family defines its own chat template; formatting prompts by hand with the wrong markers silently degrades quality. Use the tokenizer's template function." },
      ],
      callouts: [
        { kind: 'architecture', title: 'From text to model input', body: 'Every LLM request passes through the same pipeline before a single matrix multiply happens.', flow: ['raw text', 'normalize + pre-split', 'BPE merges', 'token IDs', 'embedding lookup', 'Transformer'] },
        { kind: 'tip', title: 'Use the lab', body: 'The Prompt Security lab below opens in Attention X-Ray mode: every row and column of the heatmap is one token (the lab uses simplified word-level tokens). Load the "Obfuscated injection" preset: `1gn0re` is a completely different token ID from `ignore`, which is exactly why exact-match keyword filters miss it. (The Neural Network lab in Module 3 also has a Token X-Ray tab.)' },
        { kind: 'security', title: 'Tokenizer edge cases are attack surface', body: 'Unicode look-alikes, zero-width characters and unusual spacing change tokenization and can slip past naive keyword filters. Normalize (NFKC) and strip invisible characters before filtering, and never rely on keyword filters alone.' },
      ],
      code: {
        basic: {
          language: 'py',
          filename: 'bpe_from_scratch.py',
          explanation: 'Runnable, dependency-free BPE trainer and encoder on the classic corpus. The learned merge sequence and the encoding of unseen words are asserted.',
          code: raw`#  BPE TRAINING LOOP
#
#   words:  l o w </w> (x5)   l o w e r </w> (x2)   n e w e s t </w> (x6)   w i d e s t </w> (x3)
#   count adjacent pairs  ->  (e,s)=9  (s,t)=9  (t,</w>)=9  (l,o)=7 ...
#   merge the top pair    ->  "e s" becomes "es" everywhere
#   repeat until vocab size reached
from collections import Counter

corpus = {"low": 5, "lower": 2, "newest": 6, "widest": 3}
vocab = {" ".join(list(w)) + " </w>": c for w, c in corpus.items()}

def pair_counts(vocab):
    pairs = Counter()
    for word, freq in vocab.items():
        syms = word.split()
        for a, b in zip(syms, syms[1:]):
            pairs[(a, b)] += freq
    return pairs

def merge(pair, vocab):
    a, b = pair
    out = {}
    for word, freq in vocab.items():
        syms, i, new = word.split(), 0, []
        while i < len(syms):
            if i < len(syms) - 1 and syms[i] == a and syms[i + 1] == b:
                new.append(a + b); i += 2
            else:
                new.append(syms[i]); i += 1
        out[" ".join(new)] = freq
    return out

merges = []
for _ in range(8):
    (best, count), = pair_counts(vocab).most_common(1)   # ties: first seen wins
    merges.append((best, count))
    vocab = merge(best, vocab)

assert merges == [(("e", "s"), 9), (("es", "t"), 9), (("est", "</w>"), 9), (("l", "o"), 7),
                  (("lo", "w"), 7), (("n", "e"), 6), (("ne", "w"), 6), (("new", "est</w>"), 6)]

def encode(word):
    syms = list(word) + ["</w>"]
    for (a, b), _ in merges:                     # replay merges in learned order
        i = 0
        while i < len(syms) - 1:
            if syms[i] == a and syms[i + 1] == b:
                syms[i:i + 2] = [a + b]
            else:
                i += 1
    return syms

assert encode("lowest") == ["low", "est</w>"]    # unseen word, known pieces
assert encode("newest") == ["newest</w>"]        # frequent word = one token
assert encode("slow") == ["s", "low", "</w>"]
print("merges:", [a + "+" + b for (a, b), _ in merges])
print("lowest ->", encode("lowest"))`,
        },
        production: {
          language: 'py',
          filename: 'token_budget.py',
          explanation: "Production pattern: count tokens with the target model's tokenizer, render prompts through its chat template, and trim retrieved context by tokens (not characters) to fit a budget.",
          code: raw`# pip install transformers
from transformers import AutoTokenizer

tok = AutoTokenizer.from_pretrained("Qwen/Qwen2.5-0.5B-Instruct")   # use YOUR model's tokenizer

def n_tokens(text: str) -> int:
    return len(tok.encode(text, add_special_tokens=False))

def fit_to_budget(chunks: list[str], budget: int) -> list[str]:
    """Keep the highest-ranked chunks that fit; never cut a chunk mid-token."""
    kept, used = [], 0
    for c in chunks:                                   # chunks already sorted by relevance
        cost = n_tokens(c)
        if used + cost > budget:
            break
        kept.append(c); used += cost
    return kept

context = fit_to_budget(retrieved_chunks, budget=3000)
messages = [
    {"role": "system", "content": "Answer only from the provided context."},
    {"role": "user", "content": "Context:\n" + "\n---\n".join(context) + "\n\nQuestion: " + question},
]
# the template inserts the exact role markers and end-of-turn tokens this model was trained on
prompt_ids = tok.apply_chat_template(messages, add_generation_prompt=True, return_tensors="pt")
print("prompt tokens:", prompt_ids.shape[-1])

for s in ["hello world", "Привет мир", "x = [i**2 for i in range(10)]", "3.14159265358979"]:
    print(f"{s!r:40} chars={len(s):3} tokens={n_tokens(s)}")`,
        },
        bug: {
          explanation:
            'Hand-written role markers do not match what the model was trained on (different models use different markers), and character-based truncation can cut the prompt mid-token and drop the generation prompt entirely. The fix renders through the chat template and budgets in tokens.',
          buggy: {
            language: 'py',
            filename: 'prompt.py',
            code: raw`# ❌ Guessing the template and truncating by characters
prompt = "### System: be helpful\n### User: " + question + "\n### Assistant:"
prompt = prompt[:8000]                        # 8000 chars != 8000 tokens; may cut the end marker
ids = tok(prompt).input_ids`,
          },
          fixed: {
            language: 'py',
            filename: 'prompt.py',
            code: raw`# ✅ Model-specific template + token-based budget
messages = [{"role": "system", "content": "Be helpful."},
            {"role": "user", "content": question}]
ids = tok.apply_chat_template(messages, add_generation_prompt=True)
assert len(ids) <= MAX_PROMPT_TOKENS, "trim retrieved context, not the template"`,
          },
        },
      },
      takeaways: [
        'BPE repeatedly merges the most frequent adjacent pair; encoding replays merges in learned order.',
        'Byte-level BPE can encode any string with no unknown token.',
        "Cost, latency and context limits are measured in tokens: count with the model's own tokenizer.",
        'Always format chat prompts with the model\'s chat template.',
        'Practice drill: on the corpus {hug: 10, pug: 5, hugs: 8}, find the first two BPE merges by hand (u+g = 23 → "ug", then h+ug = 18 → "hug").',
      ],
      labId: 'prompt-security',
      labMode: 'attention',
    },

    // ------------------------------------------------------------------------
    {
      id: 'ai-embeddings',
      title: 'Embeddings: From Lookup Tables to Sentence Vectors',
      summary: 'How token IDs become vectors, why similar meanings land close together, and how sentence embeddings power semantic search.',
      difficulty: 'Intermediate',
      minutes: 20,
      xp: 110,
      analogy:
        "An embedding is a home address for meaning. Words that keep the same company (\"cat\" and \"dog\" both drink, eat and chase) end up living on the same street, while \"car\" lives across town next to \"truck\" and \"fuel\". Once every word or sentence has coordinates, finding related ideas is just finding neighbours on the map.",
      intuition: [
        { title: 'An embedding layer is a lookup table', body: "A matrix E of shape [vocab_size, d]. Token ID 42 → row 42. Mathematically it is `one_hot(42) @ E`, but implemented as indexing. The rows start random and are learned by backprop." },
        { title: 'You shall know a word by the company it keeps', body: "The distributional hypothesis: words in similar contexts have similar meanings. Counting co-occurrences and compressing the counts (PPMI + SVD) already produces meaningful vectors, as Tab 1 shows." },
        { title: 'Contextual vs static embeddings', body: "word2vec gives \"bank\" one vector. A Transformer gives \"bank\" a different vector in \"river bank\" and \"bank loan\", because every token's vector is updated by attention over its neighbours." },
        { title: 'Sentence embeddings by pooling', body: "Run a Transformer encoder, then average the token vectors (mean pooling, ignoring padding) or take a special token. Models trained with contrastive loss pull matching (query, passage) pairs together and push others apart." },
        { title: 'Normalize, then dot = cosine', body: "L2-normalize every vector once at index time; then the dot product equals cosine similarity and vector databases can use fast inner-product search." },
        { title: 'Dimensions and storage', body: "1M documents × 768 dims × 4 bytes (float32) ≈ 3.07 GB. Halving precision or using a model that supports truncated (Matryoshka) dimensions cuts storage and latency, with a measured quality trade-off." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Sentence embedding pipeline', body: 'The same pipeline embeds documents at index time and queries at search time; both must use the same model and preprocessing.', flow: ['text', 'tokenize', 'encoder', 'masked mean pool', 'L2 normalize', 'vector index'] },
        { kind: 'warning', title: 'Never mix embedding models', body: 'Vectors from two different models (or two versions of one) live in unrelated spaces. Changing models means re-embedding the entire corpus; store the model name and version next to every vector.' },
      ],
      code: {
        basic: {
          language: 'py',
          filename: 'embeddings_from_scratch.py',
          explanation: 'Runnable NumPy: embedding lookup equals one-hot matmul, co-occurrence → PPMI → SVD produces vectors where "cat" is closer to "dog" than to "car", and masked mean pooling ignores padding.',
          code: raw`#  CO-OCCURRENCE -> PPMI -> SVD
#
#            drinks eats chases needs drives fuel ...
#    cat   [   1     1     1     0     0     0  ]      SVD keeps the top-k
#    dog   [   1     1     1     0     0     0  ]  ->  directions of variation
#    car   [   0     0     0     1     1     1  ]      cat ~ dog,  car ~ truck
#    truck [   0     0     0     1     1     1  ]
import numpy as np

# 1) embedding lookup == one_hot @ E
rng = np.random.default_rng(0)
E = rng.normal(size=(10, 4))
assert np.allclose(np.eye(10)[7] @ E, E[7])

# 2) distributional vectors from a toy corpus
corpus = ["the cat drinks milk", "the dog drinks water", "the cat chases the dog",
          "a dog eats food", "a cat eats food", "the car needs fuel", "a truck needs fuel",
          "the car drives fast", "the truck drives fast", "the truck carries cargo"]
words = sorted({w for s in corpus for w in s.split()})
idx = {w: i for i, w in enumerate(words)}
C = np.zeros((len(words), len(words)))
for s in corpus:
    toks = s.split()
    for i, w in enumerate(toks):
        for j in range(max(0, i - 2), min(len(toks), i + 3)):     # window of 2
            if i != j:
                C[idx[w], idx[toks[j]]] += 1

total = C.sum()
pw = C.sum(1, keepdims=True) / total
pc = C.sum(0, keepdims=True) / total
with np.errstate(divide="ignore"):
    ppmi = np.maximum(np.log((C / total) / (pw * pc)), 0)        # positive PMI
U, S, _ = np.linalg.svd(ppmi)
vecs = U[:, :4] * S[:4]                                          # 4-dim word vectors

def cos(a, b):
    va, vb = vecs[idx[a]], vecs[idx[b]]
    return va @ vb / (np.linalg.norm(va) * np.linalg.norm(vb))

assert cos("cat", "dog") > cos("cat", "car")
assert cos("car", "truck") > cos("car", "dog")
print(f"cos(cat,dog)={cos('cat','dog'):.3f}  cos(cat,car)={cos('cat','car'):.3f}  cos(car,truck)={cos('car','truck'):.3f}")

# 3) masked mean pooling: padding must not dilute the sentence vector
tokens = np.array([[1.0, 1.0], [3.0, 3.0], [0.0, 0.0], [0.0, 0.0]])   # 2 real + 2 pad
mask = np.array([1, 1, 0, 0])
pooled = (tokens * mask[:, None]).sum(0) / mask.sum()
assert np.allclose(pooled, [2.0, 2.0]) and not np.allclose(tokens.mean(0), pooled)

# 4) after L2 normalization, dot product == cosine; storage math
a, b = np.array([3.0, 4.0]), np.array([4.0, 3.0])
na, nb = a / np.linalg.norm(a), b / np.linalg.norm(b)
assert abs(na @ nb - 0.96) < 1e-12
assert 1_000_000 * 768 * 4 == 3_072_000_000                     # ~3.07 GB in float32`,
        },
        production: {
          language: 'py',
          filename: 'semantic_search.py',
          explanation: 'Production pattern with sentence-transformers: batch encoding with normalization, model-specific query/passage prefixes, a model-version tag on the index, and a top-k inner-product search.',
          code: raw`# pip install sentence-transformers numpy
import numpy as np
from sentence_transformers import SentenceTransformer

MODEL = "intfloat/e5-base-v2"                     # E5 expects "query: " / "passage: " prefixes
model = SentenceTransformer(MODEL)

def embed_passages(texts: list[str]) -> np.ndarray:
    return model.encode(["passage: " + t for t in texts], batch_size=64,
                        normalize_embeddings=True, convert_to_numpy=True).astype(np.float32)

def embed_query(q: str) -> np.ndarray:
    return model.encode("query: " + q, normalize_embeddings=True).astype(np.float32)

docs = load_documents()                           # list[str]
index = {"model": MODEL, "dim": model.get_sentence_embedding_dimension(),
         "vectors": embed_passages(docs)}

def search(q: str, k: int = 5):
    assert index["model"] == MODEL, "query and index must use the same embedding model"
    scores = index["vectors"] @ embed_query(q)    # dot of unit vectors == cosine
    top = np.argpartition(-scores, k)[:k]
    return sorted(((float(scores[i]), docs[i]) for i in top), reverse=True)

for score, doc in search("how do I rotate an API key?"):
    print(f"{score:.3f}  {doc[:80]}")`,
        },
        bug: {
          explanation:
            'A plain mean over the sequence dimension averages in padding vectors, so the same sentence gets a different embedding depending on what else was in the batch. The fix weights by the attention mask so only real tokens count.',
          buggy: {
            language: 'py',
            filename: 'pooling.py',
            code: raw`# ❌ Padding tokens are averaged into the sentence vector
out = encoder(**batch).last_hidden_state          # [B, T, d]
sentence = out.mean(dim=1)                         # short sentences get diluted by pads`,
          },
          fixed: {
            language: 'py',
            filename: 'pooling.py',
            code: raw`# ✅ Masked mean pooling, then L2 normalize
import torch.nn.functional as F

out = encoder(**batch).last_hidden_state                       # [B, T, d]
mask = batch["attention_mask"].unsqueeze(-1).to(out.dtype)    # [B, T, 1]
sentence = (out * mask).sum(1) / mask.sum(1).clamp(min=1e-9)
sentence = F.normalize(sentence, dim=-1)`,
          },
        },
      },
      takeaways: [
        'An embedding layer is a learned lookup table: one row per token.',
        'Similar contexts → similar vectors; Transformers make them context-dependent.',
        'Sentence vectors = masked mean pooling (or a special token), then L2-normalize.',
        'Never mix vectors from different embedding models; store the model version.',
        'Practice drill: compute float32 storage for 250k chunks × 1024 dims (1.024 GB), then for float16 (0.512 GB).',
      ],
    },
  ],
};
