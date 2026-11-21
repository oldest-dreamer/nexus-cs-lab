import type { Module } from '../../types';

// String.raw keeps backslashes exactly as written inside code samples.
const raw = String.raw;

export const mlFoundationsModule: Module = {
  id: 'ai-math-eval',
  title: 'ML Math & Evaluation Foundations',
  level: 'Scratch',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'ai-vectors-similarity',
      title: 'Vectors, Dot Products & Cosine Similarity',
      summary: 'The three operations behind every recommender, search engine and embedding model, computed by hand.',
      difficulty: 'Scratch',
      minutes: 15,
      xp: 70,
      analogy:
        "Two people point at the sky. The dot product asks: how much do their arms point the same way, multiplied by how long their arms are? Cosine similarity ignores arm length and only asks about direction. Search engines almost always want direction: \"are these about the same thing?\", not \"is this document longer?\".",
      intuition: [
        { title: 'A vector is a list of numbers with a meaning', body: "`[3, 4]` can be a point, an arrow, or features (3 bedrooms, 4 km from town). Embedding models turn text into vectors with hundreds of dimensions where direction encodes meaning." },
        { title: 'Dot product: multiply pairwise, then add', body: "`a·b = a1*b1 + a2*b2 + …`. For a = [3, 4] and b = [4, 3]: 3·4 + 4·3 = 24. A large positive value means aligned, ~0 means unrelated (orthogonal), negative means opposite." },
        { title: 'Length (norm) is a dot product with itself', body: "`|a| = sqrt(a·a) = sqrt(9 + 16) = 5`. Longer vectors produce bigger dot products even when the direction is identical, which is a problem when comparing documents of different lengths." },
        { title: 'Cosine similarity removes length', body: "`cos(a, b) = a·b / (|a| |b|) = 24 / (5·5) = 0.96`. It always lands in [-1, 1]. The vectors [1, 2, 2] and [2, 4, 4] have cosine exactly 1.0 (same direction) even though their dot product is 18." },
        { title: 'Normalize once, then dot = cosine', body: "Divide every vector by its norm (unit length). Now the dot product IS the cosine, and a whole search becomes one matrix multiplication: `scores = Docs @ query`. Vector databases rely on this trick." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Similarity search pipeline', body: 'Normalize at write time and at query time; ranking is then a single matrix-vector product.', flow: ['Text', 'Embedding model → vector', 'L2-normalize', 'scores = D @ q', 'top-k by score'] },
        { kind: 'tip', title: 'Distance vs similarity', body: 'For unit vectors, squared Euclidean distance = 2 − 2·cos. So nearest-by-distance and highest-cosine give the same ranking once vectors are normalized.' },
      ],
      code: {
        basic: {
          language: 'py',
          filename: 'similarity_from_scratch.py',
          explanation: 'Runnable NumPy with assertions: dot product, norm, cosine, and why normalization changes a ranking.',
          code: raw`#  2-D picture of a = [3, 4] and b = [4, 3]
#
#   y
#   4 |   a (3,4)
#   3 |  /     . b (4,3)        angle between them is small -> cos = 0.96
#   2 | /   .
#   1 |/ .
#     +----------- x
#       1 2 3 4
import numpy as np

a, b = np.array([3.0, 4.0]), np.array([4.0, 3.0])
dot = float(a @ b)                                   # 3*4 + 4*3
norm_a = float(np.sqrt(a @ a))                       # sqrt(9 + 16)
cos = dot / (np.linalg.norm(a) * np.linalg.norm(b))  # 24 / 25
assert dot == 24.0 and norm_a == 5.0 and abs(cos - 0.96) < 1e-12

# Ranking trap: raw dot product rewards LENGTH, cosine rewards DIRECTION
q  = np.array([1.0, 2.0, 2.0])
d1 = np.array([2.0, 4.0, 4.0])      # same direction as q, twice as long
d2 = np.array([1.0, 0.0, 0.0])      # different direction
assert q @ d1 == 18.0 and q @ d2 == 1.0

unit = lambda v: v / np.linalg.norm(v)
cos_d1, cos_d2 = unit(q) @ unit(d1), unit(q) @ unit(d2)
assert abs(cos_d1 - 1.0) < 1e-12 and abs(cos_d2 - 1/3) < 1e-12

# Normalized matrix search: one matmul ranks every document
D = np.stack([unit(d1), unit(d2)])
scores = D @ unit(q)
print("scores", scores.round(4), "best doc index", int(scores.argmax()))   # [1. 0.3333] 0`,
        },
        production: {
          language: 'py',
          filename: 'semantic_search.py',
          explanation: 'Production pattern: normalized embeddings at index time, a single matrix product per query, and argpartition for fast top-k.',
          code: raw`# pip install sentence-transformers numpy
import numpy as np
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("all-MiniLM-L6-v2")       # 384-dim embeddings
docs = [
    "Reset your password from the account settings page.",
    "Our refund policy allows returns within 30 days.",
    "Two-factor authentication adds a second login step.",
]

# normalize_embeddings=True -> every row has length 1, so dot product == cosine
D = model.encode(docs, normalize_embeddings=True, batch_size=64).astype(np.float32)

def search(query: str, k: int = 2):
    q = model.encode([query], normalize_embeddings=True)[0]
    scores = D @ q                                    # (n_docs,) cosine scores
    k = min(k, len(docs))
    top = np.argpartition(-scores, k - 1)[:k]         # O(n) top-k, not a full sort
    top = top[np.argsort(-scores[top])]               # then sort only the k winners
    return [(docs[i], float(scores[i])) for i in top]

for text, score in search("how do I change my login password?"):
    print(f"{score:.3f}  {text}")`,
        },
        bug: {
          explanation:
            'Ranking raw (un-normalized) embeddings by dot product lets long or high-norm vectors win regardless of meaning. Normalizing both sides turns the dot product into cosine similarity, so the ranking depends only on direction.',
          buggy: {
            language: 'py',
            filename: 'rank.py',
            code: raw`# ❌ Raw dot product: vector LENGTH leaks into relevance
import numpy as np

def rank(query_vec: np.ndarray, doc_vecs: np.ndarray) -> np.ndarray:
    scores = doc_vecs @ query_vec          # long/verbose docs get inflated scores
    return np.argsort(-scores)`,
          },
          fixed: {
            language: 'py',
            filename: 'rank.py',
            code: raw`# ✅ Cosine: normalize both sides (with an epsilon for zero vectors)
import numpy as np

def rank(query_vec: np.ndarray, doc_vecs: np.ndarray, eps: float = 1e-12) -> np.ndarray:
    q = query_vec / (np.linalg.norm(query_vec) + eps)
    D = doc_vecs / (np.linalg.norm(doc_vecs, axis=1, keepdims=True) + eps)
    return np.argsort(-(D @ q))`,
          },
        },
      },
      takeaways: [
        'Dot product = alignment × length; cosine = alignment only.',
        'Normalize vectors once and dot product becomes cosine; search becomes one matrix multiply.',
        'For unit vectors, Euclidean distance and cosine give identical rankings.',
        'Practice drill: compute by hand the cosine of [1, 0, 1] and [0, 1, 1] (answer: 0.5), then verify it with the Tab 1 code.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'ai-data-splits-leakage',
      title: 'Train/Val/Test Splits, Data Leakage & the Bias-Variance Tradeoff',
      summary: 'Why a model that scores 99% offline can fail in production, and the splitting discipline that prevents it.',
      difficulty: 'Scratch',
      minutes: 18,
      xp: 80,
      analogy:
        "A teacher who gives students the exact exam questions as homework will see perfect scores that mean nothing. The test set is the sealed exam. Data leakage is any way the answers slip into the homework: copied questions (duplicates), statistics computed from the exam (preprocessing on all data), or information from the future (time leakage).",
      intuition: [
        { title: 'Three jobs, three splits', body: "Train fits parameters. Validation picks hyperparameters and models (you look at it many times). Test is opened ONCE at the end to estimate real-world performance. Typical ratios: 70/15/15, or cross-validation on train+val with a held-out test." },
        { title: 'Leakage 1: preprocessing on everything', body: "Fitting a scaler, imputer or vocabulary on the full dataset lets test-set statistics shape training. Fit every transform on train only, then apply it to val/test." },
        { title: 'Leakage 2: duplicates and groups', body: "If the same patient, user or near-duplicate document appears in both train and test, the model memorizes rather than generalizes. Split by group (user ID, patient ID, document source)." },
        { title: 'Leakage 3: time and target', body: "Predicting churn with a feature updated after the churn date, or randomly splitting time-series data, leaks the future. Split by time (train on the past, test on the future) and audit every feature's timestamp." },
        { title: 'Bias vs variance', body: "High bias (underfitting): too simple, train and val error both high. High variance (overfitting): train error low, val error high. Model complexity trades one for the other; the sweet spot minimizes validation error." },
        { title: 'Reading the curves', body: "A big gap between train and val error means variance: get more data, regularize, or simplify. Both high means bias: add features or capacity. Tab 1 fits polynomials of degree 1, 3 and 9 to show both regimes." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Correct order of operations', body: 'Split first. Everything learned from data (scalers, encoders, feature selection) is fit inside the training fold only.', flow: ['Raw data', 'Split (by group / time)', 'Fit transforms on train', 'Apply to val/test', 'Tune on val', 'Report test ONCE'] },
        { kind: 'warning', title: 'The silent killer', body: 'Leakage never throws an error. It shows up as a suspiciously good offline score followed by poor production results. If a metric looks too good, hunt for leakage before celebrating.' },
      ],
      code: {
        basic: {
          language: 'py',
          filename: 'bias_variance_from_scratch.py',
          explanation: 'Runnable NumPy: a seeded split, then polynomials of increasing degree showing underfitting and overfitting through train vs validation error.',
          code: raw`#  ERROR vs MODEL COMPLEXITY
#
#  error |  \                          / validation
#        |   \__                   __/
#        |      \___      ____----     <- sweet spot = lowest validation error
#        |  train    \___/
#        |               ----______   train keeps falling
#        +--------------------------- complexity (polynomial degree)
#          underfit (bias)   overfit (variance)
import numpy as np

rng = np.random.default_rng(0)
x = np.sort(rng.uniform(-1, 1, 40))
y = np.sin(3 * x) + rng.normal(0, 0.2, x.size)        # true signal + noise

idx = rng.permutation(x.size)                          # shuffle BEFORE splitting
tr, va = idx[:28], idx[28:]                            # 70% train / 30% validation

def mse(deg: int, which) -> float:
    coefs = np.polyfit(x[tr], y[tr], deg)              # fit on TRAIN only
    return float(np.mean((np.polyval(coefs, x[which]) - y[which]) ** 2))

results = {deg: (mse(deg, tr), mse(deg, va)) for deg in (1, 3, 9)}
for deg, (t, v) in results.items():
    print(f"degree {deg}: train {t:.3f}  val {v:.3f}")

(t1, v1), (t3, v3), (t9, v9) = results[1], results[3], results[9]
assert t1 > t3 > t9              # more capacity always lowers TRAIN error
assert v3 < v1                   # degree 1 underfits (high bias)
assert v9 > t9 * 1.5             # degree 9 overfits: val error well above train`,
        },
        production: {
          language: 'py',
          filename: 'leak_free_cv.py',
          explanation: 'Production pattern: a scikit-learn Pipeline so preprocessing is re-fit inside every fold, grouped cross-validation so the same user never spans folds, and a test set touched once.',
          code: raw`# pip install scikit-learn pandas
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupKFold, GroupShuffleSplit, cross_val_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

df = pd.read_parquet("events.parquet")              # columns: user_id, features..., label
X, y, groups = df.drop(columns=["label"]), df["label"], df["user_id"]

# 1) hold out a TEST set by group (no user appears in both)
outer = GroupShuffleSplit(n_splits=1, test_size=0.15, random_state=42)
train_idx, test_idx = next(outer.split(X, y, groups))
X_tr, y_tr, g_tr = X.iloc[train_idx], y.iloc[train_idx], groups.iloc[train_idx]

num = ["age", "sessions_30d"]
cat = ["country", "plan"]
pre = ColumnTransformer([
    ("num", Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler())]), num),
    ("cat", OneHotEncoder(handle_unknown="ignore"), cat),
])
model = Pipeline([("pre", pre), ("clf", LogisticRegression(max_iter=2000))])

# 2) every fold re-fits the imputer/scaler/encoder on that fold's TRAIN part only
scores = cross_val_score(model, X_tr, y_tr, groups=g_tr, cv=GroupKFold(n_splits=5), scoring="roc_auc")
print("CV ROC-AUC: %.3f ± %.3f" % (scores.mean(), scores.std()))

# 3) fit on all training data, evaluate on the untouched test set exactly once
from sklearn.metrics import roc_auc_score
model.fit(X_tr, y_tr)
proba = model.predict_proba(X.iloc[test_idx])[:, 1]
print("TEST ROC-AUC:", round(roc_auc_score(y.iloc[test_idx], proba), 3))`,
        },
        bug: {
          explanation:
            'The vulnerable version scales with statistics from the whole dataset and splits rows randomly even though the same user appears many times. The fix splits by user first and fits the scaler inside a Pipeline on training data only.',
          buggy: {
            language: 'py',
            filename: 'train.py',
            code: raw`# ❌ Two leaks: global scaling + row-level split of grouped data
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split

X_scaled = StandardScaler().fit_transform(X)           # mean/std include TEST rows
X_tr, X_te, y_tr, y_te = train_test_split(X_scaled, y, test_size=0.2)   # same user in both
model.fit(X_tr, y_tr)
print(model.score(X_te, y_te))                         # optimistic, will not hold in prod`,
          },
          fixed: {
            language: 'py',
            filename: 'train.py',
            code: raw`# ✅ Split by group first; scaling lives inside the pipeline (fit on train only)
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression

tr, te = next(GroupShuffleSplit(test_size=0.2, random_state=0).split(X, y, groups=user_ids))
pipe = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000))
pipe.fit(X.iloc[tr], y.iloc[tr])
print(pipe.score(X.iloc[te], y.iloc[te]))              # honest estimate`,
          },
        },
      },
      takeaways: [
        'Train fits, validation tunes, test is opened once.',
        'Fit every transform inside the training fold; split by group or time when rows are related.',
        'Large train/val gap = variance (overfit); both high = bias (underfit).',
        'Practice drill: run Tab 1, then change degree 9 to 15 and predict before running whether validation error goes up or down.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'ai-metrics',
      title: 'Metrics That Matter: Precision, Recall, F1, ROC-AUC & RMSE',
      summary: 'Why 97% accuracy can be a useless model, and how to pick the metric that matches the real cost of mistakes.',
      difficulty: 'Scratch',
      minutes: 18,
      xp: 80,
      analogy:
        "A smoke alarm that never beeps is 99.9% accurate, because houses are rarely on fire. Precision asks: when it beeps, is there really a fire? Recall asks: when there is a fire, does it beep? You tune the alarm by deciding which mistake costs more: a false alarm at 3am, or a missed fire.",
      intuition: [
        { title: 'The confusion matrix', body: "TP (predicted yes, truly yes), FP (yes, truly no), FN (no, truly yes), TN (no, truly no). Every classification metric is a ratio of these four counts." },
        { title: 'Accuracy lies on imbalanced data', body: "With TP=40, FP=10, FN=20, TN=930: accuracy = 970/1000 = 0.97. But a model that always says \"no\" scores 0.94 without detecting anything. On rare events, accuracy hides failure." },
        { title: 'Precision, recall, F1', body: "Precision = TP/(TP+FP) = 40/50 = 0.80. Recall = TP/(TP+FN) = 40/60 = 0.667. F1 = harmonic mean = 2PR/(P+R) = 0.727. Use recall when misses are costly (fraud, cancer), precision when false alarms are costly (spam filters on important mail)." },
        { title: 'Thresholds move the trade-off', body: "A classifier outputs a score; the 0.5 cut-off is arbitrary. Lowering it raises recall and lowers precision. Choose the threshold from the precision-recall curve to meet a business target (e.g. recall ≥ 0.9)." },
        { title: 'ROC-AUC is about ranking', body: "AUC = the probability a random positive gets a higher score than a random negative. Scores [0.9, 0.8, 0.6] for positives vs [0.7, 0.4, 0.2] for negatives: 8 of 9 pairs ordered correctly → AUC = 0.889. It must be computed on scores, not hard labels." },
        { title: 'Regression: RMSE vs MAE', body: "Errors [2, −1, 3, 0]: MAE = 1.5, RMSE = sqrt(14/4) = 1.871. RMSE squares errors, so it punishes large misses more; MAE treats every unit of error equally and is more robust to outliers." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Choosing a metric', body: 'Start from the cost of each mistake, not from what is easiest to compute.', flow: ['What does a FP cost?', 'What does a FN cost?', 'Pick metric (P, R, F1, PR-AUC)', 'Pick threshold on validation', 'Report on test'] },
        { kind: 'tip', title: 'PR-AUC for rare positives', body: 'When positives are under ~5%, the precision-recall curve (average precision) is more informative than ROC-AUC, which can look good simply because there are so many true negatives.' },
      ],
      code: {
        basic: {
          language: 'py',
          filename: 'metrics_from_scratch.py',
          explanation: 'Runnable, assertion-checked implementations of every metric from the intuition steps, with no libraries beyond NumPy.',
          code: raw`#  CONFUSION MATRIX (1000 transactions, 60 are fraud)
#
#                    predicted FRAUD   predicted OK
#   actual FRAUD          TP = 40         FN = 20      <- recall = 40/60
#   actual OK             FP = 10         TN = 930
#                           ^
#                     precision = 40/50
import numpy as np

TP, FP, FN, TN = 40, 10, 20, 930
accuracy  = (TP + TN) / (TP + FP + FN + TN)
precision = TP / (TP + FP)
recall    = TP / (TP + FN)
f1        = 2 * precision * recall / (precision + recall)
always_no = (FP + TN) / (TP + FP + FN + TN)        # a model that never predicts fraud
assert accuracy == 0.97 and always_no == 0.94
assert precision == 0.8 and abs(recall - 2/3) < 1e-12 and abs(f1 - 0.7272727) < 1e-6

# ROC-AUC = P(score of random positive > score of random negative)
labels = np.array([1, 1, 0, 1, 0, 0])
scores = np.array([0.9, 0.8, 0.7, 0.6, 0.4, 0.2])
pos, neg = scores[labels == 1], scores[labels == 0]
pairs = [1.0 if p > n else 0.5 if p == n else 0.0 for p in pos for n in neg]
auc = sum(pairs) / len(pairs)
assert abs(auc - 8/9) < 1e-12                       # 8 of 9 pairs ranked correctly

# Regression
err = np.array([2.0, -1.0, 3.0, 0.0])
rmse, mae = float(np.sqrt(np.mean(err ** 2))), float(np.mean(np.abs(err)))
assert abs(rmse - 1.8708287) < 1e-6 and mae == 1.5
print(f"acc={accuracy} P={precision} R={recall:.3f} F1={f1:.3f} AUC={auc:.3f} RMSE={rmse:.3f}")`,
        },
        production: {
          language: 'py',
          filename: 'threshold_selection.py',
          explanation: 'Production pattern: report the full picture, then choose an operating threshold on validation data to hit a recall target, and freeze it for test and production.',
          code: raw`# pip install scikit-learn numpy
import numpy as np
from sklearn.metrics import (average_precision_score, classification_report,
                             precision_recall_curve, roc_auc_score)

proba_val = model.predict_proba(X_val)[:, 1]        # SCORES, not hard labels

print("ROC-AUC:", round(roc_auc_score(y_val, proba_val), 4))
print("PR-AUC (average precision):", round(average_precision_score(y_val, proba_val), 4))

# pick the highest threshold that still reaches the recall target
TARGET_RECALL = 0.90
prec, rec, thr = precision_recall_curve(y_val, proba_val)   # len(thr) = len(prec) - 1
ok = np.where(rec[:-1] >= TARGET_RECALL)[0]
threshold = float(thr[ok[-1]]) if len(ok) else 0.5
print(f"threshold={threshold:.3f} precision={prec[ok[-1]]:.3f} recall={rec[ok[-1]]:.3f}")

# freeze the threshold, then evaluate once on test
proba_test = model.predict_proba(X_test)[:, 1]
print(classification_report(y_test, (proba_test >= threshold).astype(int), digits=3))`,
        },
        bug: {
          explanation:
            'Passing hard 0/1 predictions to roc_auc_score collapses the ranking information, so AUC no longer measures how well the model orders cases, and accuracy on imbalanced data hides missed positives. The fix uses probability scores and threshold-aware metrics.',
          buggy: {
            language: 'py',
            filename: 'evaluate.py',
            code: raw`# ❌ AUC on labels + accuracy on a 6%-positive dataset
from sklearn.metrics import accuracy_score, roc_auc_score

pred = model.predict(X_test)                    # hard labels at an implicit 0.5 threshold
print("AUC", roc_auc_score(y_test, pred))       # ranking info thrown away
print("accuracy", accuracy_score(y_test, pred)) # 0.94+ even if every fraud is missed`,
          },
          fixed: {
            language: 'py',
            filename: 'evaluate.py',
            code: raw`# ✅ Scores for ranking metrics, explicit threshold for P/R/F1
from sklearn.metrics import average_precision_score, f1_score, recall_score, roc_auc_score

proba = model.predict_proba(X_test)[:, 1]
print("ROC-AUC", roc_auc_score(y_test, proba))
print("PR-AUC ", average_precision_score(y_test, proba))
pred = (proba >= THRESHOLD_FROM_VALIDATION).astype(int)
print("recall ", recall_score(y_test, pred), " F1", f1_score(y_test, pred))`,
          },
        },
      },
      takeaways: [
        'Accuracy misleads on imbalanced data; use precision, recall, F1 or PR-AUC.',
        'Thresholds trade precision for recall; pick them on validation data from real costs.',
        'ROC-AUC measures ranking and needs scores; RMSE punishes big misses more than MAE.',
        'Practice drill: for TP=90, FP=30, FN=10, compute precision, recall and F1 by hand (0.75, 0.90, ≈0.818), then check with the Tab 1 formulas.',
      ],
    },
  ],
};
