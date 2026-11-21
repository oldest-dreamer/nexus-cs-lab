import type { Module } from '../../types';

const raw = String.raw;

export const deepLearningModule: Module = {
  id: 'ai-deep-learning',
  title: 'Deep Learning & Backpropagation From Scratch',
  level: 'Intermediate',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'ai-neurons-gradient-descent',
      title: 'Perceptrons, Activations (ReLU, GELU, Sigmoid, Softmax) & Cross-Entropy',
      summary: 'From a single weighted vote to a multi-class network: the activation functions modern models use, and the loss that trains them.',
      difficulty: 'Beginner',
      minutes: 20,
      xp: 90,
      analogy:
        "A neuron is a committee member who weighs the evidence, adds a personal bias, and then decides how loudly to speak (the activation). ReLU stays silent for bad news and speaks in proportion to good news. Softmax is the committee chair who turns everyone's raw enthusiasm into percentages that add up to 100. Cross-entropy is the bill you pay for having been confident about the wrong answer.",
      intuition: [
        { title: 'Perceptron: weighted sum + step', body: "`z = w·x + b`, output 1 if z > 0. One perceptron draws one straight line, so it can learn AND and OR but never XOR. Stacking layers with non-linear activations removes that limit." },
        { title: 'Why non-linearity is essential', body: "Two linear layers collapse into one: `W2(W1x) = (W2W1)x`. Activations between layers are what let depth represent curved boundaries." },
        { title: 'The activation zoo', body: "Sigmoid squashes to (0, 1) but saturates (gradient ≤ 0.25). ReLU = max(0, z): cheap, no saturation for positives, but zero gradient for negatives. GELU = z·Φ(z) is a smooth ReLU used in Transformers: GELU(1) = 0.841, GELU(−1) = −0.159." },
        { title: 'Softmax turns logits into a distribution', body: "`softmax(z)ᵢ = e^zᵢ / Σ e^zⱼ`. Logits [2.0, 1.0, 0.1] → [0.659, 0.242, 0.099]. Subtracting max(z) first changes nothing mathematically but prevents overflow." },
        { title: 'Cross-entropy punishes confident mistakes', body: "`CE = −log p(correct class)`. If the true class got 0.659, the loss is 0.417; at 0.01 it is 4.6. Combined with softmax, the gradient with respect to the logits is simply `p − one_hot(y)`." },
        { title: 'Gradient descent', body: "Every parameter moves a small step against its gradient: `θ ← θ − lr·∂L/∂θ`. Try a learning rate that is too large in the lab below and watch the loss oscillate or explode." },
      ],
      callouts: [
        { kind: 'architecture', title: 'A classification network', body: 'Hidden layers use ReLU/GELU; the output layer emits raw logits; softmax + cross-entropy are applied together in the loss.', flow: ['x', 'Linear → GELU', 'Linear → GELU', 'Linear → logits', 'softmax + CE loss', 'backprop'] },
        { kind: 'tip', title: 'Use the lab', body: 'The Neural Network lab below trains a real MLP in your browser. Load the XOR preset with 1 hidden layer, then change neurons and learning rate to see capacity and step size in action (Network Trainer tab).' },
      ],
      code: {
        basic: {
          language: 'py',
          filename: 'activations_from_scratch.py',
          explanation: 'Runnable NumPy implementations of every activation and the softmax + cross-entropy pair, with the exact values from the intuition steps asserted, plus the p − y gradient checked numerically.',
          code: raw`#  ACTIVATIONS  (z on the x-axis)
#
#   ReLU          GELU            Sigmoid           Softmax over 3 logits
#     |   /         |   /           1|     ____      z = [2.0, 1.0, 0.1]
#     |  /          |  /             |   /           p = [0.659, 0.242, 0.099]
#  ___|_/        __.|_/          0.5 |--/            sum(p) = 1
#     |          (dips below 0)    0 |_/
import math
import numpy as np

relu = lambda z: np.maximum(0.0, z)
sigmoid = lambda z: 1.0 / (1.0 + np.exp(-z))
gelu = lambda z: 0.5 * z * (1.0 + math.erf(z / math.sqrt(2.0)))   # exact GELU = z * Phi(z)

def softmax(z):
    e = np.exp(z - np.max(z))          # subtract max for numerical stability
    return e / e.sum()

def cross_entropy(logits, target):
    return -math.log(softmax(logits)[target])

assert relu(-1.0) == 0.0 and relu(3.0) == 3.0
assert abs(gelu(1.0) - 0.8413447) < 1e-6 and abs(gelu(-1.0) + 0.1586553) < 1e-6
assert sigmoid(0.0) * (1 - sigmoid(0.0)) == 0.25                     # max sigmoid gradient

z = np.array([2.0, 1.0, 0.1])
p = softmax(z)
assert np.allclose(p, [0.6590012, 0.2424330, 0.0985659], atol=1e-6) and abs(p.sum() - 1) < 1e-12
assert abs(cross_entropy(z, 0) - 0.4170300) < 1e-6
assert np.allclose(softmax(z + 1000), p)                              # stable with huge logits

# gradient of CE wrt logits is p - one_hot(y): verify with finite differences
y, eps = 0, 1e-6
analytic = p - np.eye(3)[y]
numeric = np.array([(cross_entropy(z + eps * np.eye(3)[i], y) - cross_entropy(z - eps * np.eye(3)[i], y)) / (2 * eps)
                    for i in range(3)])
assert np.allclose(analytic, numeric, atol=1e-6)
print("softmax", p.round(4), "CE", round(cross_entropy(z, 0), 4), "grad", analytic.round(4))`,
        },
        production: {
          language: 'py',
          filename: 'mlp_classifier.py',
          explanation: 'Production PyTorch pattern: an MLP that outputs raw logits, nn.CrossEntropyLoss (which applies log-softmax internally), AdamW, and a clean train/eval loop.',
          code: raw`# pip install torch
import torch
from torch import nn

class MLP(nn.Module):
    def __init__(self, d_in: int, d_hidden: int, n_classes: int):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(d_in, d_hidden), nn.GELU(),
            nn.Linear(d_hidden, d_hidden), nn.GELU(),
            nn.Linear(d_hidden, n_classes),          # raw logits: NO softmax here
        )

    def forward(self, x):
        return self.net(x)

model = MLP(d_in=20, d_hidden=128, n_classes=5)
loss_fn = nn.CrossEntropyLoss()                     # = log_softmax + negative log-likelihood
opt = torch.optim.AdamW(model.parameters(), lr=3e-4, weight_decay=0.01)

for epoch in range(20):
    model.train()
    for xb, yb in train_loader:                     # yb: class indices (long), not one-hot
        opt.zero_grad(set_to_none=True)
        loss = loss_fn(model(xb), yb)
        loss.backward()
        opt.step()

    model.eval()
    with torch.no_grad():
        correct = total = 0
        for xb, yb in val_loader:
            probs = torch.softmax(model(xb), dim=-1) # softmax only for reporting/inference
            correct += (probs.argmax(-1) == yb).sum().item(); total += len(yb)
    print(f"epoch {epoch}: val acc {correct / total:.3f}")`,
        },
        bug: {
          explanation:
            'nn.CrossEntropyLoss already applies log-softmax. Adding a softmax layer to the model applies it twice, compressing the logits into [0, 1], which flattens the gradients and slows or stalls training. The fix returns raw logits from the model.',
          buggy: {
            language: 'py',
            filename: 'model.py',
            code: raw`# ❌ Double softmax: model ends with Softmax, loss applies log_softmax again
model = nn.Sequential(
    nn.Linear(20, 128), nn.ReLU(),
    nn.Linear(128, 5),
    nn.Softmax(dim=-1),            # outputs in [0, 1] become the "logits" of CE
)
loss = nn.CrossEntropyLoss()(model(x), y)   # tiny, flat gradients -> slow, poor training`,
          },
          fixed: {
            language: 'py',
            filename: 'model.py',
            code: raw`# ✅ Model emits logits; softmax lives in the loss (training) or at inference only
model = nn.Sequential(
    nn.Linear(20, 128), nn.ReLU(),
    nn.Linear(128, 5),             # logits
)
loss = nn.CrossEntropyLoss()(model(x), y)
probs = torch.softmax(model(x), dim=-1)     # when you need probabilities`,
          },
        },
      },
      takeaways: [
        'Non-linear activations between layers are what make depth useful.',
        'ReLU/GELU for hidden layers; raw logits out; softmax + cross-entropy in the loss.',
        'Softmax + CE has the gradient p − one_hot(y); subtract max(z) for stability.',
        'Practice drill: compute softmax([1, 1, 1]) by hand (⅓ each) and the cross-entropy if the true class is any one of them (ln 3 ≈ 1.099). Then train XOR in the lab.',
      ],
      labId: 'neural-net',
      labMode: 'net',
    },

    // ------------------------------------------------------------------------
    {
      id: 'ai-backprop',
      title: 'Backpropagation, the Chain Rule & the Adam Optimizer',
      summary: 'Derive every gradient of a two-layer network by hand, prove it with a numerical gradient check, then see what Adam adds on top of plain SGD.',
      difficulty: 'Intermediate',
      minutes: 25,
      xp: 120,
      analogy:
        "Backprop is a factory audit after a defective product. Start at the end of the line (the loss) and ask each station how much its output contributed to the defect, passing the blame backwards, station by station. Each station's blame is its local sensitivity times the blame it received. Adam is a shop-floor manager who adjusts each worker's pace using both their recent direction (momentum) and how erratic they have been (variance).",
      intuition: [
        { title: 'Forward pass: save everything', body: "For `h = tanh(W1 x + b1)`, `z = W2 h + b2`, `p = softmax(z)`, `L = −log p_y`, keep x, h and p. The backward pass reuses them instead of recomputing." },
        { title: 'Start at the loss', body: "For softmax + cross-entropy, `∂L/∂z = p − one_hot(y)`. That vector (call it δ2) is the blame on each output logit." },
        { title: 'Weight gradient = input × blame', body: "`∂L/∂W2 = δ2 · hᵀ` (outer product) and `∂L/∂b2 = δ2`. Every weight's gradient is the activation that flowed into it times the blame on the unit it feeds." },
        { title: 'Pass blame backwards through the weights', body: "`δ1 = (W2ᵀ δ2) ⊙ (1 − h²)`, because tanh′(a) = 1 − tanh(a)². Then `∂L/∂W1 = δ1 · xᵀ`. That is the whole algorithm, repeated for any depth." },
        { title: 'Always gradient-check new code', body: "Perturb one weight by ±ε, measure the loss change, and compare to the analytic gradient. A relative error below ~1e-6 means your backprop is correct. Tab 1 does exactly this." },
        { title: 'Adam: momentum + per-parameter scaling', body: "Adam keeps an exponential average of gradients (m, β1 = 0.9) and of squared gradients (v, β2 = 0.999), bias-corrects both, and steps by `lr · m̂ / (√v̂ + ε)`. Parameters with noisy gradients take smaller steps. AdamW applies weight decay directly to the weights instead of through the gradient." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Gradient flow in a 2-layer network', body: 'The same three rules repeat at every layer: δ from above, weight grad = δ × input, δ below = Wᵀδ ⊙ activation′.', flow: ['δ2 = p − y', '∂W2 = δ2 hᵀ', 'δ1 = W2ᵀδ2 ⊙ (1 − h²)', '∂W1 = δ1 xᵀ', 'Adam update'] },
        { kind: 'tip', title: 'See it live', body: 'The Neural Network lab below runs exactly this backward pass (tanh hidden, sigmoid output) every animation frame. Try a 2-layer network on the spiral preset.' },
      ],
      code: {
        basic: {
          language: 'py',
          filename: 'backprop_gradcheck.py',
          explanation: 'Runnable NumPy: a two-layer network with a hand-written backward pass, verified against finite differences, then trained with an Adam implementation written from the formulas.',
          code: raw`#  FORWARD                                   BACKWARD
#  x --W1,b1--> a1 --tanh--> h --W2,b2--> z --softmax--> p --CE--> L
#                                                       delta2 = p - onehot(y)
#                         delta1 = (W2^T delta2) * (1 - h^2)  <-----+
#  dW1 = delta1 x^T             dW2 = delta2 h^T
import numpy as np

rng = np.random.default_rng(0)
D, H, C = 4, 5, 3
params = {"W1": rng.normal(0, 0.5, (H, D)), "b1": np.zeros(H),
          "W2": rng.normal(0, 0.5, (C, H)), "b2": np.zeros(C)}
x, y = rng.normal(size=D), 2

def forward(p):
    h = np.tanh(p["W1"] @ x + p["b1"])
    z = p["W2"] @ h + p["b2"]
    e = np.exp(z - z.max()); prob = e / e.sum()
    return -np.log(prob[y]), h, prob

def backward(p):
    _, h, prob = forward(p)
    d2 = prob - np.eye(C)[y]                       # dL/dz
    d1 = (p["W2"].T @ d2) * (1 - h ** 2)           # dL/da1 through tanh
    return {"W2": np.outer(d2, h), "b2": d2, "W1": np.outer(d1, x), "b1": d1}

# ---- gradient check: analytic vs central finite differences
grads, eps = backward(params), 1e-6
for name, P in params.items():
    num = np.zeros_like(P)
    for i in np.ndindex(P.shape):
        old = P[i]
        P[i] = old + eps; lp = forward(params)[0]
        P[i] = old - eps; lm = forward(params)[0]
        P[i] = old; num[i] = (lp - lm) / (2 * eps)
    rel = np.linalg.norm(num - grads[name]) / (np.linalg.norm(num) + np.linalg.norm(grads[name]))
    assert rel < 1e-7, (name, rel)

# ---- Adam from the paper's formulas
m = {k: np.zeros_like(v) for k, v in params.items()}
v = {k: np.zeros_like(v) for k, v in params.items()}
lr, b1, b2, eps_a = 0.05, 0.9, 0.999, 1e-8
start = forward(params)[0]
for t in range(1, 101):
    g = backward(params)
    for k in params:
        m[k] = b1 * m[k] + (1 - b1) * g[k]               # momentum (1st moment)
        v[k] = b2 * v[k] + (1 - b2) * g[k] ** 2          # adaptive scale (2nd moment)
        m_hat, v_hat = m[k] / (1 - b1 ** t), v[k] / (1 - b2 ** t)   # bias correction
        params[k] -= lr * m_hat / (np.sqrt(v_hat) + eps_a)
end = forward(params)[0]
assert end < start * 0.05
assert np.exp(-end) > 0.95                           # the network now assigns >95% to class y
print(f"gradient check passed; Adam loss {start:.4f} -> {end:.5f}")`,
        },
        production: {
          language: 'py',
          filename: 'train_loop.py',
          explanation: 'Production PyTorch loop: autograd does the backward pass, AdamW with a warmup + cosine schedule, gradient-norm logging, and torch.autograd.gradcheck for custom layers.',
          code: raw`import math
import torch
from torch import nn

model = MLP(d_in=20, d_hidden=256, n_classes=5)
opt = torch.optim.AdamW(model.parameters(), lr=3e-4, betas=(0.9, 0.999), weight_decay=0.01)

total_steps, warmup = 10_000, 500
def lr_lambda(step):                                    # linear warmup, then cosine decay
    if step < warmup:
        return step / warmup
    progress = (step - warmup) / (total_steps - warmup)
    return 0.5 * (1 + math.cos(math.pi * progress))
sched = torch.optim.lr_scheduler.LambdaLR(opt, lr_lambda)

for step, (xb, yb) in zip(range(total_steps), infinite_loader):
    opt.zero_grad(set_to_none=True)                     # clear grads from the previous step
    loss = nn.functional.cross_entropy(model(xb), yb)
    loss.backward()                                     # autograd = backprop
    gnorm = torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
    opt.step(); sched.step()
    if step % 100 == 0:
        print(f"step {step} loss {loss.item():.4f} grad_norm {gnorm:.3f} lr {sched.get_last_lr()[0]:.2e}")

# verify a hand-written autograd.Function in float64 before trusting it
inp = torch.randn(4, 3, dtype=torch.double, requires_grad=True)
assert torch.autograd.gradcheck(MyCustomOp.apply, (inp,), eps=1e-6, atol=1e-4)`,
        },
        bug: {
          explanation:
            'PyTorch accumulates gradients into .grad by default. Without zero_grad(), every step adds the previous gradients, so the effective step size grows with each iteration and training diverges. The fix clears gradients at the start of each step (or deliberately accumulates for N micro-batches and scales the loss).',
          buggy: {
            language: 'py',
            filename: 'train.py',
            code: raw`# ❌ Gradients pile up across iterations
for xb, yb in loader:
    loss = loss_fn(model(xb), yb)
    loss.backward()               # .grad += new gradient (never reset)
    opt.step()`,
          },
          fixed: {
            language: 'py',
            filename: 'train.py',
            code: raw`# ✅ Reset each step (or accumulate on purpose and scale the loss)
ACCUM = 4
for i, (xb, yb) in enumerate(loader):
    loss = loss_fn(model(xb), yb) / ACCUM      # average over the accumulated micro-batches
    loss.backward()
    if (i + 1) % ACCUM == 0:
        opt.step()
        opt.zero_grad(set_to_none=True)`,
          },
        },
      },
      takeaways: [
        'Backprop: δ from above, weight gradient = δ × input, δ below = Wᵀδ ⊙ activation′.',
        'Gradient-check new code against finite differences; relative error under ~1e-6 means it is right.',
        'Adam = momentum + per-parameter adaptive scaling with bias correction; AdamW decouples weight decay.',
        'Practice drill: by hand, for L = (tanh(w·x) − y)² with w = 0.8, x = 1.5, y = 0.2, compute dL/dw (≈ 0.58). Then train the spiral preset in the lab with 2 hidden layers.',
      ],
      labId: 'neural-net',
      labMode: 'net',
    },

    // ------------------------------------------------------------------------
    {
      id: 'ai-training-stability',
      title: 'Training Stability: Vanishing/Exploding Gradients, Dropout, LayerNorm & RMSNorm',
      summary: 'Why deep networks stop learning or blow up, and the toolkit (initialization, normalization, residuals, clipping, dropout) that keeps them stable.',
      difficulty: 'Intermediate',
      minutes: 22,
      xp: 120,
      analogy:
        "Backprop is a game of telephone through dozens of layers. If each person whispers a little quieter (gradients multiplied by numbers below 1), the message vanishes. If each shouts a little louder, it becomes noise. Normalization is giving everyone the same microphone volume; residual connections are a direct phone line that skips the chain.",
      intuition: [
        { title: 'Gradients are products of many factors', body: "Through L layers, the gradient picks up L factors of (weight × activation slope). Sigmoid slopes are at most 0.25, so 30 sigmoid layers can shrink a gradient by more than 0.25³⁰ ≈ 10⁻¹⁸: vanishing." },
        { title: 'Exploding is the mirror image', body: "If factors are above 1, the product grows exponentially, the loss turns into NaN, and recurrent or very deep networks are especially prone. Gradient clipping (rescale when the norm exceeds a threshold) is the standard guard." },
        { title: 'Initialization sets the starting scale', body: "He/Kaiming init (`std = sqrt(2/fan_in)`) keeps ReLU activations at a stable variance from layer to layer; Xavier/Glorot suits tanh. Tab 1 shows activations dying with a naive init and surviving with He init." },
        { title: 'LayerNorm and RMSNorm', body: "LayerNorm rescales each token's vector to zero mean and unit variance, then applies a learned scale and shift. RMSNorm skips the mean subtraction (`x / sqrt(mean(x²) + ε) · g`): cheaper, and used in Llama-style models." },
        { title: 'Residual connections', body: "`x + f(x)` gives the gradient an identity path, so it reaches early layers even if f's gradient is small. Pre-norm (`x + f(norm(x))`) is the modern default for stable deep Transformers." },
        { title: 'Dropout regularizes, but only in training', body: "During training, dropout zeroes a random fraction p of activations and scales the rest by 1/(1−p) so the expected value is unchanged. At inference, `model.eval()` disables it; forgetting this makes predictions random." },
      ],
      callouts: [
        { kind: 'architecture', title: 'A stable pre-norm block', body: 'Normalization before each sublayer and a residual around it: the recipe behind deep Transformers.', flow: ['x', 'RMSNorm', 'sublayer (attention / MLP)', 'dropout', 'x + sublayer', 'next block'] },
        { kind: 'warning', title: 'Watch the gradient norm', body: 'Log the global gradient norm every step. A steady climb or sudden spikes predict a NaN loss before it happens; lower the learning rate, add warmup, or clip.' },
      ],
      code: {
        basic: {
          language: 'py',
          filename: 'stability_from_scratch.py',
          explanation: 'Runnable NumPy: activation scale through 30 layers with naive vs He initialization, gradient shrinkage through sigmoids, LayerNorm and RMSNorm from their formulas, and inverted dropout.',
          code: raw`#  SIGNAL SCALE THROUGH 30 LAYERS
#
#   std |\  naive init (std 0.01): shrinks to ~0
#       | \____________________________
#       |------------------------------  He init (std sqrt(2/fan_in)): stays ~constant
#       +-------------------------------- layer
import numpy as np

rng = np.random.default_rng(0)
n, depth = 256, 30
x0 = rng.normal(size=(64, n))

def run(std_fn):
    h = x0
    for _ in range(depth):
        W = rng.normal(0, std_fn(n), (n, n))
        h = np.maximum(0, h @ W)                 # ReLU layer
    return h.std()

naive = run(lambda fan_in: 0.01)
he = run(lambda fan_in: np.sqrt(2.0 / fan_in))
assert naive < 1e-20 and 0.1 < he < 10.0          # naive init collapses, He init survives
print(f"activation std after {depth} layers: naive {naive:.2e}, He {he:.3f}")

# gradient through 30 sigmoids (max slope 0.25)
assert 0.25 ** 30 < 1e-18                          # vanishing, even in the best case

# LayerNorm and RMSNorm for one token vector
v = np.array([2.0, 4.0, 6.0, 8.0])
g, b, eps = np.ones(4), np.zeros(4), 1e-5
ln = (v - v.mean()) / np.sqrt(v.var() + eps) * g + b
rms = v / np.sqrt(np.mean(v ** 2) + eps) * g
assert abs(ln.mean()) < 1e-9 and abs(ln.std() - 1) < 1e-4    # zero mean, unit variance
assert abs(np.sqrt(np.mean(rms ** 2)) - 1) < 1e-4             # unit RMS (mean NOT removed)
assert rms.mean() > 0.9

# inverted dropout keeps the expected activation unchanged
p, acts = 0.1, np.ones(1_000_000)
mask = rng.random(acts.shape) >= p
dropped = acts * mask / (1 - p)
assert abs(dropped.mean() - 1.0) < 0.01 and abs((dropped == 0).mean() - p) < 0.01
print("LayerNorm", ln.round(3), "RMSNorm", rms.round(3))`,
        },
        production: {
          language: 'py',
          filename: 'stable_block.py',
          explanation: 'Production PyTorch: a pre-norm residual block with RMSNorm, dropout, bf16 autocast, gradient clipping, and NaN detection that stops a run before it corrupts a checkpoint.',
          code: raw`import torch
from torch import nn

class PreNormBlock(nn.Module):
    def __init__(self, d: int, hidden: int, p_drop: float = 0.1):
        super().__init__()
        self.norm = nn.RMSNorm(d)                       # torch >= 2.4
        self.ff = nn.Sequential(nn.Linear(d, hidden), nn.GELU(), nn.Linear(hidden, d))
        self.drop = nn.Dropout(p_drop)
        nn.init.kaiming_normal_(self.ff[0].weight, nonlinearity="relu")
        nn.init.zeros_(self.ff[2].weight)               # block starts as identity: x + 0

    def forward(self, x):
        return x + self.drop(self.ff(self.norm(x)))     # residual path keeps gradients alive

model = nn.Sequential(*[PreNormBlock(512, 2048) for _ in range(24)]).cuda()
opt = torch.optim.AdamW(model.parameters(), lr=3e-4, weight_decay=0.1)

for step, (xb, yb) in enumerate(loader):
    model.train()
    opt.zero_grad(set_to_none=True)
    with torch.autocast("cuda", dtype=torch.bfloat16):  # bf16: fp32 range, no loss scaling needed
        loss = loss_fn(model(xb.cuda()), yb.cuda())
    if not torch.isfinite(loss):
        raise RuntimeError(f"non-finite loss at step {step}: lower lr / check data")
    loss.backward()
    gnorm = torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
    opt.step()`,
        },
        bug: {
          explanation:
            'Without model.eval(), dropout keeps zeroing random activations at inference, so the same input produces different predictions and accuracy drops. Wrapping inference in model.eval() plus torch.inference_mode() makes it deterministic and also skips building the autograd graph.',
          buggy: {
            language: 'py',
            filename: 'predict.py',
            code: raw`# ❌ Model left in training mode: dropout active, graph built for nothing
def predict(model, x):
    return model(x).argmax(-1)          # two calls on the same x can disagree`,
          },
          fixed: {
            language: 'py',
            filename: 'predict.py',
            code: raw`# ✅ Eval mode (dropout off, norms use inference behaviour) + no autograd
import torch

@torch.inference_mode()
def predict(model, x):
    model.eval()
    return model(x).argmax(-1)`,
          },
        },
      },
      takeaways: [
        'Deep gradients are products of many factors: they vanish below 1 and explode above 1.',
        'He/Xavier init, pre-norm (LayerNorm/RMSNorm), residuals and gradient clipping keep training stable.',
        'Dropout is inverted (scaled by 1/(1−p)) in training and must be disabled with model.eval().',
        'Practice drill: compute RMSNorm of [3, 4] by hand (RMS = √12.5 ≈ 3.536 → [0.849, 1.131]) and say why its mean is not zero.',
      ],
      labId: 'neural-net',
      labMode: 'net',
    },
  ],
};
