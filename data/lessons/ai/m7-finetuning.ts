import type { Module } from '../../types';

const raw = String.raw;

export const finetuningModule: Module = {
  id: 'ai-finetuning',
  title: 'Fine-Tuning & Alignment',
  level: 'Advanced',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'ai-finetune-decision-sft',
      title: 'Prompt vs RAG vs Fine-Tune, and Supervised Fine-Tuning (SFT)',
      summary: 'Decide when fine-tuning is actually the right tool, then build SFT data correctly: chat formatting, loss masking on prompt tokens, EOS handling and clean eval splits.',
      difficulty: 'Intermediate',
      minutes: 22,
      xp: 120,
      analogy:
        "Prompting is giving a skilled contractor written instructions. RAG is handing them the building's blueprints for each job. Fine-tuning is sending them on a training course: worth it when you need a new habit (a format, a tone, a specialised skill) every single time, not when you just need them to know today's facts. Facts change; habits stick.",
      intuition: [
        { title: 'Try the cheap levers first', body: "Start with a strong prompt and a few examples. If the model lacks knowledge (your docs, fresh data), use RAG. Fine-tune when you need consistent behaviour (format, style, a narrow skill), lower latency/cost with a smaller model, or behaviour that is hard to describe but easy to demonstrate." },
        { title: 'Fine-tuning is poor at adding facts', body: "Facts learned by fine-tuning are hard to update, cite or delete, and can increase confident hallucination. Knowledge that changes belongs in retrieval; fine-tuning teaches how to use it." },
        { title: 'SFT data = demonstrations', body: "Each example is a conversation (system, user, assistant). Quality beats quantity: a few hundred to a few thousand clean, diverse, correct examples often beat a large noisy set." },
        { title: 'Mask the prompt in the loss', body: "Train only on assistant tokens: set labels for system/user tokens to −100 so cross-entropy ignores them. Otherwise capacity is wasted learning to imitate user messages." },
        { title: 'Teach the model to stop', body: "The assistant turn must end with the template's end-of-turn/EOS token and that token must be in the labels. Without it, the fine-tuned model rambles past its answer." },
        { title: 'Hold out an eval set first', body: "Split before any augmentation and de-duplicate across splits, measure on the eval set and on a general-capability set to catch regressions (catastrophic forgetting)." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Decision path', body: 'Move to the next stage only when evals show the previous one is not enough.', flow: ['prompt + few-shot', 'add RAG for knowledge', 'SFT / LoRA for behaviour', 'preference tuning (DPO)', 'distil to a smaller model'] },
        { kind: 'warning', title: 'Data is the product', body: 'Never fine-tune on data containing secrets, personal data you are not allowed to use, or unreviewed model outputs. Fine-tuned models can regurgitate training examples verbatim.' },
      ],
      code: {
        basic: {
          language: 'py',
          filename: 'sft_masking_from_scratch.py',
          explanation: 'Runnable NumPy: format a conversation with a toy chat template, build labels that mask everything except assistant tokens plus the end-of-turn token, and show that the masked loss ignores prompt tokens entirely.',
          code: raw`#  SFT EXAMPLE: WHAT THE LOSS SEES
#
#  tokens:  <sys> be brief <user> 2+2? <asst> 4 <eot>
#  labels:  -100  -100 -100 -100  -100  -100 4  <eot>
#                 ^ ignored (prompt)            ^ trained (answer + stop token)
import numpy as np

vocab = {w: i for i, w in enumerate(["<sys>", "<user>", "<asst>", "<eot>", "be", "brief",
                                     "2+2?", "4", "capital", "of", "France?", "Paris"])}
IGNORE = -100

def build(messages):
    ids, labels = [], []
    for m in messages:
        role_tok = {"system": "<sys>", "user": "<user>", "assistant": "<asst>"}[m["role"]]
        content = [vocab[w] for w in m["content"].split()]
        ids += [vocab[role_tok]] + content
        if m["role"] == "assistant":
            ids.append(vocab["<eot>"])
            labels += [IGNORE] + content + [vocab["<eot>"]]    # train on answer AND stop token
        else:
            labels += [IGNORE] * (1 + len(content))
    return np.array(ids), np.array(labels)

ids, labels = build([{"role": "system", "content": "be brief"},
                     {"role": "user", "content": "2+2?"},
                     {"role": "assistant", "content": "4"}])
assert len(ids) == len(labels) == 8
assert (labels != IGNORE).sum() == 2                          # "4" and <eot>
assert labels[-1] == vocab["<eot>"]

def masked_ce(logits, labels):
    # next-token shift: position t predicts token t+1
    lg, lb = logits[:-1], labels[1:]
    keep = lb != IGNORE
    lg = lg - lg.max(-1, keepdims=True)
    logp = lg - np.log(np.exp(lg).sum(-1, keepdims=True))
    return -logp[keep, lb[keep]].mean(), int(keep.sum())

rng = np.random.default_rng(0)
logits = rng.normal(size=(len(ids), len(vocab)))
loss, n = masked_ce(logits, labels)
assert n == 2
# changing the logits at positions that predict prompt tokens must not change the loss
logits2 = logits.copy(); logits2[:4] += rng.normal(size=(4, len(vocab))) * 10
assert np.isclose(masked_ce(logits2, labels)[0], loss)
print(f"trained tokens: {n} of {len(ids)}; masked loss = {loss:.4f}")`,
        },
        production: {
          language: 'py',
          filename: 'sft_dataset.py',
          explanation: "Production pattern with Hugging Face: render with the model's chat template, mask everything before the assistant reply, check that the EOS/end-of-turn token survives truncation, de-duplicate across splits and train with Trainer.",
          code: raw`# pip install transformers datasets
import hashlib
from datasets import load_dataset
from transformers import AutoTokenizer, AutoModelForCausalLM, Trainer, TrainingArguments, DataCollatorForSeq2Seq

name = "Qwen/Qwen2.5-0.5B-Instruct"
tok = AutoTokenizer.from_pretrained(name)
MAX_LEN = 2048

def encode(ex):
    prompt = tok.apply_chat_template(ex["messages"][:-1], add_generation_prompt=True, tokenize=False)
    full = tok.apply_chat_template(ex["messages"], tokenize=False)   # includes end-of-turn token
    p_ids = tok(prompt, add_special_tokens=False).input_ids
    f_ids = tok(full, add_special_tokens=False).input_ids[:MAX_LEN]
    labels = [-100] * len(p_ids) + f_ids[len(p_ids):]                 # loss on the reply only
    return {"input_ids": f_ids, "attention_mask": [1] * len(f_ids), "labels": labels[:len(f_ids)]}

ds = load_dataset("json", data_files="sft.jsonl")["train"]           # {"messages": [...]} per line
key = lambda ex: hashlib.sha256(ex["messages"][-2]["content"].strip().lower().encode()).hexdigest()
ds = ds.map(lambda ex: {"key": key(ex)})
split = ds.train_test_split(test_size=0.05, seed=42)
train_keys = set(split["train"]["key"])
split["test"] = split["test"].filter(lambda ex: ex["key"] not in train_keys)   # no leakage

train = split["train"].map(encode, remove_columns=split["train"].column_names)
test = split["test"].map(encode, remove_columns=split["test"].column_names)
train = train.filter(lambda ex: any(l != -100 for l in ex["labels"]))          # reply not truncated away

model = AutoModelForCausalLM.from_pretrained(name, torch_dtype="auto")
args = TrainingArguments(output_dir="out", per_device_train_batch_size=4, gradient_accumulation_steps=8,
                         learning_rate=1e-5, num_train_epochs=2, lr_scheduler_type="cosine",
                         warmup_ratio=0.03, bf16=True, eval_strategy="steps", eval_steps=200, logging_steps=20)
Trainer(model=model, args=args, train_dataset=train, eval_dataset=test,
        data_collator=DataCollatorForSeq2Seq(tok, label_pad_token_id=-100)).train()`,
        },
        bug: {
          explanation:
            'Formatting examples by hand as "question + answer" without the end-of-turn token means the model never sees where an answer ends, so after fine-tuning it keeps generating (often inventing a new user turn). The fix renders with the chat template, which appends the end-of-turn token, and keeps that token in the labels.',
          buggy: {
            language: 'py',
            filename: 'format.py',
            code: raw`# ❌ No end-of-turn token: the fine-tuned model never learns to stop
text = "User: " + ex["question"] + "\nAssistant: " + ex["answer"]
ids = tok(text).input_ids`,
          },
          fixed: {
            language: 'py',
            filename: 'format.py',
            code: raw`# ✅ Chat template adds role markers and the end-of-turn token
msgs = [{"role": "user", "content": ex["question"]},
        {"role": "assistant", "content": ex["answer"]}]
ids = tok.apply_chat_template(msgs)
END_OF_TURN = "<|im_end|>"        # Qwen; Llama 3 uses "<|eot_id|>": check your template
assert tok.decode(ids).rstrip().endswith(END_OF_TURN)`,
          },
        },
      },
      takeaways: [
        'Prompt first, RAG for knowledge, fine-tune for consistent behaviour or a cheaper model.',
        'SFT trains only on assistant tokens (labels −100 elsewhere), including the end-of-turn token.',
        'Split and de-duplicate before training; evaluate on held-out and general-capability sets.',
        'Practice drill: for a 3-turn chat (system 20 tokens, user 50, assistant 30 + 1 EOS), how many tokens contribute to the loss? (31.)',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'ai-lora-qlora',
      title: 'LoRA & QLoRA: Parameter-Efficient Fine-Tuning',
      summary: 'Fine-tune an 8B model by training 0.17–0.5% of its parameters: the low-rank math, exact parameter counts, alpha scaling, and the QLoRA recipe for a single GPU.',
      difficulty: 'Advanced',
      minutes: 25,
      xp: 140,
      analogy:
        "Full fine-tuning repaints the whole house. LoRA leaves the walls alone and adds a thin, removable layer of tinted film on a few windows. The film is tiny (two skinny matrices), can be peeled off or swapped per customer, and still changes how the whole room looks. QLoRA does the same while storing the house itself in compressed form.",
      intuition: [
        { title: 'Freeze W, learn a low-rank update', body: "Instead of updating a d × k weight W, learn `ΔW = B·A` with B: d × r and A: r × k, r ≪ d. The layer computes `Wx + (α/r)·B(Ax)`. Weight updates during fine-tuning tend to be low-rank, so small r works." },
        { title: 'Exact parameter savings', body: "For one 4096 × 4096 projection: full = 16,777,216 parameters; LoRA r = 16 = 16 × (4096 + 4096) = 131,072, which is 0.78%. For Llama-3-8B with LoRA on q, k, v, o: 425,984 per layer × 32 = 13.6M (0.17% of 8.03B)." },
        { title: 'All linear layers', body: "Adding the MLP's gate, up and down projections (884,736 per layer at r = 16) gives 41.9M trainable parameters (0.52%). Targeting all linear layers usually matches full fine-tuning more closely." },
        { title: 'Initialization and alpha', body: "A is random, B is zero, so at step 0 the model is exactly the base model. α/r scales the update (α = 32, r = 16 → 2). Keeping α proportional to r lets you change r without retuning the learning rate much. LoRA typically uses a higher LR (1e-4 to 2e-4) than full fine-tuning." },
        { title: 'Merge or swap', body: "After training, `W' = W + (α/r)BA` can be merged for zero inference overhead, or kept separate so one base model serves many adapters." },
        { title: 'QLoRA', body: "Load the frozen base in 4-bit NF4 (≈ 4.5 GB for 8B), compute in bf16, and train LoRA adapters in higher precision. Add gradient checkpointing and a paged optimizer, and an 8B model fine-tunes on a single 24 GB GPU." },
      ],
      callouts: [
        { kind: 'architecture', title: 'A LoRA linear layer', body: 'The frozen path and the trainable low-rank path run in parallel and are summed.', flow: ['x', 'frozen W·x', 'A·x (r dims) → B·(Ax)', '× α/r', 'sum', 'output'] },
        { kind: 'tip', title: 'Sensible defaults', body: 'r = 16, α = 32, dropout 0.05, all linear layers, LR 2e-4 with cosine decay, 1–3 epochs. Change one thing at a time and compare on your eval set.' },
      ],
      code: {
        basic: {
          language: 'py',
          filename: 'lora_from_scratch.py',
          explanation: 'Runnable NumPy: a LoRA layer that equals the base layer at initialization, a merge that matches the unmerged forward pass, a tiny gradient-descent fit through only A and B, and every parameter count from the intuition steps asserted.',
          code: raw`#  LoRA:  h = W x + (alpha / r) * B (A x)
#
#   x [k] --+--> W [d x k] (frozen) -------------+
#           |                                    (+) --> h [d]
#           +--> A [r x k] --> B [d x r] * a/r --+
#                  trainable: r*(d+k)  instead of d*k
import numpy as np

rng = np.random.default_rng(0)
d, k, r, alpha = 64, 64, 4, 8
W = rng.normal(size=(d, k))
A = rng.normal(0, 0.01, size=(r, k))
B = np.zeros((d, r))                                     # zero init -> starts as the base model
scale = alpha / r
x = rng.normal(size=k)
assert np.allclose(W @ x + scale * B @ (A @ x), W @ x)

# fit a low-rank target change by training only A and B
target = W + rng.normal(size=(d, 2)) @ rng.normal(size=(2, k)) * 0.1   # true rank-2 delta
X = rng.normal(size=(k, 256))
B = rng.normal(0, 0.01, size=(d, r))
lr = 0.02
def loss():
    return np.mean(((W + scale * B @ A) @ X - target @ X) ** 2)
start = loss()
for _ in range(1500):
    E = ((W + scale * B @ A) @ X - target @ X) / X.shape[1]
    gB = scale * E @ (A @ X).T
    gA = scale * B.T @ E @ X.T
    B -= lr * gB; A -= lr * gA
assert loss() < start * 0.01

# merging gives the same outputs with zero extra inference cost
W_merged = W + scale * B @ A
assert np.allclose(W_merged @ x, W @ x + scale * B @ (A @ x))

# parameter counts (r = 16)
lora = lambda din, dout, r=16: r * (din + dout)
assert 4096 * 4096 == 16_777_216 and lora(4096, 4096) == 131_072
assert lora(4096, 4096) / (4096 * 4096) == 0.0078125                # 0.78%
attn = lora(4096, 4096) + 2 * lora(4096, 1024) + lora(4096, 4096)   # q, k, v (GQA), o
mlp = 2 * lora(4096, 14336) + lora(14336, 4096)                      # gate, up, down
assert attn == 425_984 and attn * 32 == 13_631_488
assert mlp == 884_736 and (attn + mlp) * 32 == 41_943_040
assert round(attn * 32 / 8.03e9 * 100, 2) == 0.17 and 32 / 16 == 2
print(f"LoRA fit: loss {start:.4f} -> {loss():.6f}; q,k,v,o adapters = {attn * 32:,} params")`,
        },
        production: {
          language: 'py',
          filename: 'qlora_train.py',
          explanation: 'Production QLoRA recipe with transformers + peft + bitsandbytes: 4-bit NF4 base, k-bit training preparation, LoRA on all linear projections, and a printout confirming the trainable fraction. Uses the tokenized, prompt-masked dataset from the SFT chapter.',
          code: raw`# pip install transformers peft bitsandbytes accelerate datasets
import torch
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from transformers import AutoModelForCausalLM, BitsAndBytesConfig, Trainer, TrainingArguments

base = "meta-llama/Llama-3.1-8B-Instruct"
bnb = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4",
                         bnb_4bit_compute_dtype=torch.bfloat16, bnb_4bit_use_double_quant=True)
model = AutoModelForCausalLM.from_pretrained(base, quantization_config=bnb, device_map="auto")
model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)

cfg = LoraConfig(
    r=16, lora_alpha=32, lora_dropout=0.05, bias="none", task_type="CAUSAL_LM",
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
)
model = get_peft_model(model, cfg)
model.print_trainable_parameters()        # ~41.9M trainable (~0.5%) for Llama-3-8B at r=16

args = TrainingArguments(
    output_dir="qlora-out", per_device_train_batch_size=2, gradient_accumulation_steps=16,
    learning_rate=2e-4, lr_scheduler_type="cosine", warmup_ratio=0.03, num_train_epochs=2,
    bf16=True, optim="paged_adamw_8bit", logging_steps=10, save_strategy="epoch",
)
Trainer(model=model, args=args, train_dataset=train, eval_dataset=test,
        data_collator=collator).train()
model.save_pretrained("adapters/support-bot-v1")   # saves only the adapter weights (tens of MB)`,
        },
        bug: {
          explanation:
            'Merging adapters directly into a 4-bit quantized base rounds the small LoRA update back onto the 4-bit grid, which can erase much of what was learned (and some versions refuse or warn). Reload the base in bf16, merge there, evaluate, and only then quantize the merged model for deployment.',
          buggy: {
            language: 'py',
            filename: 'merge.py',
            code: raw`# ❌ Merge into the 4-bit training model: the delta is rounded away
model = PeftModel.from_pretrained(base_4bit, "adapters/support-bot-v1")
merged = model.merge_and_unload()
merged.save_pretrained("support-bot-merged")`,
          },
          fixed: {
            language: 'py',
            filename: 'merge.py',
            code: raw`# ✅ Merge in bf16, evaluate, then quantize the merged weights for serving
import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM

base = AutoModelForCausalLM.from_pretrained(BASE_ID, torch_dtype=torch.bfloat16)
merged = PeftModel.from_pretrained(base, "adapters/support-bot-v1").merge_and_unload()
merged.save_pretrained("support-bot-merged-bf16")       # run evals on THIS, then quantize`,
          },
        },
      },
      takeaways: [
        'LoRA learns ΔW = BA with r ≪ d; B starts at zero so training begins from the base model.',
        'r = 16 on q/k/v/o of Llama-3-8B trains 13.6M params (0.17%); all 7 linear layers: 41.9M.',
        'QLoRA = 4-bit NF4 frozen base + bf16 compute + LoRA adapters: 8B on a single 24 GB GPU.',
        'Merge adapters into a bf16 base, evaluate, then quantize for serving.',
        'Practice drill: count LoRA parameters for r = 8 on a 2048 × 2048 projection (8 × 4096 = 32,768, i.e. 0.78% again: the ratio is 2r/d for square matrices).',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'ai-dpo-rlhf-distillation',
      title: 'Preference Alignment (RLHF, DPO) & Knowledge Distillation',
      summary: 'How models learn which of two answers people prefer, the DPO loss computed by hand, and how distillation transfers a large model\'s behaviour into a smaller one.',
      difficulty: 'Advanced',
      minutes: 25,
      xp: 140,
      analogy:
        "SFT teaches by example: here is a good answer. Preference tuning teaches by comparison: of these two answers, this one is better. RLHF hires a judge (reward model) and coaches the student to please the judge without straying too far from their original style. DPO skips the judge and learns directly from the comparisons. Distillation is an apprenticeship where the student copies not just the master's final answers but how confident the master was about every alternative.",
      intuition: [
        { title: 'Preference data', body: "Each example is (prompt, chosen, rejected). Comparisons are easier and more consistent for people to label than writing ideal answers, and they capture qualities like helpfulness, honesty and harmlessness." },
        { title: 'Classic RLHF', body: "Train a reward model on comparisons, then optimise the policy with RL (e.g. PPO) to maximise reward minus a KL penalty that keeps it close to the SFT reference model. Powerful, but complex and unstable to run." },
        { title: 'DPO in one formula', body: "`L = −log σ(β[(log π(y_w) − log π_ref(y_w)) − (log π(y_l) − log π_ref(y_l))])`. It raises the chosen answer's likelihood relative to the reference and lowers the rejected one's. β controls how far the policy may move from the reference." },
        { title: 'DPO by hand', body: "β = 0.1, log π(y_w) = −12 (ref −14), log π(y_l) = −15 (ref −13). Chosen improved by +2, rejected dropped by −2, margin = 0.1 × 4 = 0.4, loss = −log σ(0.4) = 0.513. At margin 0 (policy = reference), loss = ln 2 = 0.693." },
        { title: 'Reward hacking and over-optimisation', body: "Optimising hard against an imperfect reward (or preference set) can produce verbose, sycophantic or evasive answers that score well but are worse. Watch length, refusal rate and held-out human or rubric evals, not just training reward." },
        { title: 'Knowledge distillation', body: "Train a small student to match the teacher's softened distribution: `KL(softmax(t/T) ‖ softmax(s/T)) · T²`, often mixed with normal cross-entropy. For LLMs, sequence-level distillation (fine-tuning on teacher-generated answers) is common; check the teacher model's licence and terms first." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Post-training pipeline', body: 'A typical modern sequence after pre-training.', flow: ['base model', 'SFT on demonstrations', 'preference data (chosen vs rejected)', 'DPO / RLHF with KL anchor', 'safety + capability evals', 'optional distillation'] },
        { kind: 'security', title: 'Alignment is a layer, not a guarantee', body: 'Preference tuning shapes typical behaviour but does not make a model immune to jailbreaks or prompt injection. Keep system-level controls (permissions, output checks, the instruction hierarchy) in place.' },
      ],
      code: {
        basic: {
          language: 'py',
          filename: 'dpo_and_distill_from_scratch.py',
          explanation: 'Runnable, dependency-light: the DPO loss and its gradient sign computed by hand with the worked numbers asserted, plus a temperature-scaled distillation loss with its key properties checked.',
          code: raw`#  DPO: push chosen up, rejected down, relative to a frozen reference
#
#   log-ratio(chosen)   = log pi(y_w) - log ref(y_w) = -12 - (-14) = +2
#   log-ratio(rejected) = log pi(y_l) - log ref(y_l) = -15 - (-13) = -2
#   margin = beta * (2 - (-2)) = 0.1 * 4 = 0.4  ->  loss = -log sigmoid(0.4) = 0.5130
import math
import numpy as np

sigmoid = lambda z: 1 / (1 + math.exp(-z))

def dpo_loss(lp_w, ref_w, lp_l, ref_l, beta=0.1):
    margin = beta * ((lp_w - ref_w) - (lp_l - ref_l))
    return -math.log(sigmoid(margin)), margin

loss, margin = dpo_loss(-12, -14, -15, -13)
assert abs(margin - 0.4) < 1e-12 and abs(loss - 0.5130) < 1e-4
assert abs(dpo_loss(-14, -14, -13, -13)[0] - math.log(2)) < 1e-12        # policy == reference
assert dpo_loss(-10, -14, -17, -13)[0] < loss                             # bigger margin, lower loss

# gradient wrt the chosen log-prob is negative (increasing it lowers the loss)
eps = 1e-6
g_w = (dpo_loss(-12 + eps, -14, -15, -13)[0] - dpo_loss(-12 - eps, -14, -15, -13)[0]) / (2 * eps)
g_l = (dpo_loss(-12, -14, -15 + eps, -13)[0] - dpo_loss(-12, -14, -15 - eps, -13)[0]) / (2 * eps)
assert g_w < 0 < g_l and abs(g_w + 0.1 * (1 - sigmoid(0.4))) < 1e-6

# knowledge distillation with temperature
def softmax(z, T=1.0):
    z = np.asarray(z) / T; z = z - z.max(); e = np.exp(z); return e / e.sum()

def kd_loss(teacher, student, T=2.0):
    p, q = softmax(teacher, T), softmax(student, T)
    return float((p * np.log(p / q)).sum() * T * T)                       # T^2 keeps gradient scale

teacher = [2.0, 1.0, 0.1]
assert kd_loss(teacher, teacher) < 1e-12                                  # identical -> zero
assert kd_loss(teacher, [0.0, 0.0, 0.0]) > kd_loss(teacher, [1.5, 0.8, 0.1]) > 0
soft = softmax(teacher, 2.0)
assert soft[1] > softmax(teacher, 1.0)[1]          # higher T reveals the teacher's "dark knowledge"
print(f"DPO loss {loss:.4f} (margin {margin}); KD loss vs uniform student {kd_loss(teacher, [0, 0, 0]):.4f}")`,
        },
        production: {
          language: 'py',
          filename: 'dpo_train.py',
          explanation: "Production DPO with Hugging Face TRL on top of an SFT checkpoint, using a LoRA adapter so the frozen base doubles as the reference model. Field names follow TRL's DPOConfig/DPOTrainer; pin the TRL version you test against, since its API evolves.",
          code: raw`# pip install trl peft transformers datasets
from datasets import load_dataset
from peft import LoraConfig
from transformers import AutoModelForCausalLM, AutoTokenizer
from trl import DPOConfig, DPOTrainer

sft_ckpt = "my-org/support-bot-sft"                      # start from your SFT model
tok = AutoTokenizer.from_pretrained(sft_ckpt)
model = AutoModelForCausalLM.from_pretrained(sft_ckpt, torch_dtype="auto")

# each row: {"prompt": [...messages], "chosen": [...assistant msg], "rejected": [...assistant msg]}
prefs = load_dataset("json", data_files="prefs.jsonl")["train"].train_test_split(0.05, seed=0)

args = DPOConfig(
    output_dir="dpo-out", beta=0.1,                      # strength of the KL anchor
    learning_rate=5e-6, per_device_train_batch_size=2, gradient_accumulation_steps=16,
    num_train_epochs=1, bf16=True, logging_steps=10,
    max_length=2048,
)
trainer = DPOTrainer(
    model=model, ref_model=None,                         # with peft: adapters off = reference
    args=args, train_dataset=prefs["train"], eval_dataset=prefs["test"],
    processing_class=tok,
    peft_config=LoraConfig(r=16, lora_alpha=32, target_modules="all-linear", task_type="CAUSAL_LM"),
)
trainer.train()
# watch: rewards/margins rising, rewards/accuracies > 0.5, AND response length / refusal rate on evals`,
        },
        bug: {
          explanation:
            'Passing the policy itself as the reference makes the two log-ratios identical at every step (both move together), so the margin is always 0, the loss is stuck at ln 2, and the KL anchor disappears. The reference must be a frozen copy (or, with LoRA, the base with adapters disabled, which TRL handles when ref_model=None).',
          buggy: {
            language: 'py',
            filename: 'dpo_setup.py',
            code: raw`# ❌ Reference == policy: same object, same weights, margin always 0
trainer = DPOTrainer(model=model, ref_model=model, args=args,
                     train_dataset=prefs["train"], processing_class=tok)`,
          },
          fixed: {
            language: 'py',
            filename: 'dpo_setup.py',
            code: raw`# ✅ A separate frozen reference (or ref_model=None with a peft_config)
import copy
ref = copy.deepcopy(model).eval()
for p in ref.parameters():
    p.requires_grad_(False)
trainer = DPOTrainer(model=model, ref_model=ref, args=args,
                     train_dataset=prefs["train"], processing_class=tok)`,
          },
        },
      },
      takeaways: [
        'Preference data compares two answers; RLHF trains a reward model then RL with a KL penalty.',
        'DPO optimises comparisons directly: loss = −log σ(β · margin of log-ratios); ln 2 at the start.',
        'Monitor length, refusals and held-out evals to catch reward hacking.',
        'Distillation matches the teacher\'s softened distribution (KL × T²) or its generated answers.',
        'Practice drill: with β = 0.2 and the same log-probs as the worked example, compute the DPO margin (0.8) and loss (−log σ(0.8) ≈ 0.371).',
      ],
    },
  ],
};
