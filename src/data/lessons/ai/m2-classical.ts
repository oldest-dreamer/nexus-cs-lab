import type { Module } from '../../types';

const raw = String.raw;

export const classicalModule: Module = {
  id: 'ai-classical',
  title: 'Classical Machine Learning',
  level: 'Beginner',
  lessons: [
    // ------------------------------------------------------------------------
    {
      id: 'ai-linear-logistic',
      title: 'Linear & Logistic Regression',
      summary: 'Fitting a line by least squares, squashing it into a probability with the sigmoid, and training both with gradient descent.',
      difficulty: 'Beginner',
      minutes: 18,
      xp: 80,
      analogy:
        "Linear regression is laying a ruler through a scatter of points so the total squared gap to the points is as small as possible. Logistic regression takes that ruler's output and bends it through an S-shaped dimmer switch (the sigmoid) so it reads as a probability between 0 and 1.",
      intuition: [
        { title: 'The model is a weighted sum', body: "`ŷ = w·x + b`. Each weight says how much one feature pushes the prediction. With one feature it is the line `y = wx + b`." },
        { title: 'Least squares has a closed form', body: "Slope `w = Σ(x−x̄)(y−ȳ) / Σ(x−x̄)²`, intercept `b = ȳ − w·x̄`. For x = 1..5, y = [2.1, 3.9, 6.2, 7.8, 10.1]: w = 1.99, b = 0.05, so x = 6 predicts 11.99." },
        { title: 'Sigmoid turns scores into probabilities', body: "`σ(z) = 1/(1+e^−z)`. σ(0) = 0.5, σ(2) = 0.881, σ(−2) = 0.119. Logistic regression predicts `P(y=1) = σ(w·x + b)`." },
        { title: 'Log loss, not squared error', body: "For classification we minimise binary cross-entropy `−[y log p + (1−y) log(1−p)]`. Its gradient with respect to the weights is simply `(p − y)·x`, so the update is clean and convex: one global minimum." },
        { title: 'Gradient descent', body: "Repeat: compute predictions, compute the gradient averaged over the data, step `w ← w − lr·grad`. Feature scaling matters: features on very different scales make the loss surface a long narrow valley that slows convergence." },
        { title: 'Regularization', body: "L2 (ridge) adds `λ‖w‖²` to the loss and shrinks weights; L1 (lasso) adds `λ‖w‖₁` and can zero some out. In scikit-learn, `C = 1/λ`, so a SMALLER C means STRONGER regularization." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Logistic regression forward pass', body: 'A linear score, a sigmoid, then a threshold chosen for the business cost.', flow: ['features x', 'z = w·x + b', 'p = σ(z)', 'loss = BCE(p, y)', 'predict p ≥ threshold'] },
        { kind: 'tip', title: 'Coefficients are explanations', body: 'On standardized features, a logistic weight w means "one standard deviation more of this feature multiplies the odds by e^w". That interpretability is why these models still dominate regulated domains.' },
      ],
      code: {
        basic: {
          language: 'py',
          filename: 'regression_from_scratch.py',
          explanation: 'Runnable NumPy: closed-form least squares, then logistic regression trained with plain gradient descent. Every number from the intuition steps is asserted.',
          code: raw`#  LINEAR:   y = w*x + b                LOGISTIC:  p = sigmoid(w*x + b)
#
#  y |          o                       p 1 |            _______
#    |       o /                          |          /
#    |     o/                         0.5 |- - - - -/        <- decision boundary at z = 0
#    |   o/                               |        /
#    | o/   least-squares line          0 |______/
#    +-------------- x                    +------------------ z
import numpy as np

# ---- closed-form least squares
x = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
y = np.array([2.1, 3.9, 6.2, 7.8, 10.1])
w = np.sum((x - x.mean()) * (y - y.mean())) / np.sum((x - x.mean()) ** 2)
b = y.mean() - w * x.mean()
assert abs(w - 1.99) < 1e-9 and abs(b - 0.05) < 1e-9 and abs(w * 6 + b - 11.99) < 1e-9

# ---- sigmoid values
sigmoid = lambda z: 1.0 / (1.0 + np.exp(-z))
assert sigmoid(0) == 0.5 and abs(sigmoid(2) - 0.8807971) < 1e-6 and abs(sigmoid(-2) - 0.1192029) < 1e-6

# ---- logistic regression by gradient descent (hours studied -> passed?)
hours  = np.array([0.5, 1.0, 1.5, 2.0, 3.0, 3.5, 4.0, 5.0])
passed = np.array([0,   0,   0,   1,   0,   1,   1,   1  ])
xs = (hours - hours.mean()) / hours.std()               # scale features first
wl, bl, lr = 0.0, 0.0, 0.5
for _ in range(2000):
    p = sigmoid(wl * xs + bl)
    grad_w = np.mean((p - passed) * xs)                 # d(BCE)/dw = (p - y) * x
    grad_b = np.mean(p - passed)
    wl, bl = wl - lr * grad_w, bl - lr * grad_b

p = sigmoid(wl * xs + bl)
loss = -np.mean(passed * np.log(p) + (1 - passed) * np.log(1 - p))
acc = np.mean((p >= 0.5) == passed)
assert wl > 0 and loss < 0.45 and acc >= 0.75           # more study -> higher pass probability
print(f"w={wl:.3f} b={bl:.3f} loss={loss:.3f} acc={acc:.2f}")`,
        },
        production: {
          language: 'py',
          filename: 'logreg_pipeline.py',
          explanation: 'Production pattern: scaling inside a pipeline, cross-validated regularization strength, class weighting for imbalance, and calibrated probabilities.',
          code: raw`# pip install scikit-learn
import math
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegressionCV
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

base = make_pipeline(
    StandardScaler(),                                  # equal footing for the L2 penalty
    LogisticRegressionCV(
        Cs=10,                                         # search 10 values of C = 1/lambda
        cv=5,
        penalty="l2",
        scoring="average_precision",                   # tuned for the rare positive class
        class_weight="balanced",                       # reweight by inverse class frequency
        max_iter=5000,
    ),
)
# calibrate so predict_proba matches observed frequencies (important when you threshold on it)
model = CalibratedClassifierCV(base, method="isotonic", cv=3).fit(X_train, y_train)

# interpret the uncalibrated fitted coefficients (on standardized features)
base.fit(X_train, y_train)
coefs = base[-1].coef_[0]
for name, w in sorted(zip(feature_names, coefs), key=lambda t: -abs(t[1]))[:10]:
    print(f"{name:25s} weight={w:+.3f}  odds x{math.exp(w):.2f} per std dev")`,
        },
        bug: {
          explanation:
            'Regularization penalises all weights equally, so an unscaled feature measured in thousands (income) needs a tiny weight and escapes the penalty, while a feature in small units is crushed. Gradient descent also crawls. Scaling inside the pipeline fixes both.',
          buggy: {
            language: 'py',
            filename: 'fit.py',
            code: raw`# ❌ Regularized model on raw features with wildly different scales
from sklearn.linear_model import LogisticRegression

# income in dollars (1e4..1e5), age in years (18..90), visits (0..10)
clf = LogisticRegression(C=0.1, max_iter=100)   # strong L2 + few iterations
clf.fit(X_train_raw, y_train)                    # ConvergenceWarning + distorted weights`,
          },
          fixed: {
            language: 'py',
            filename: 'fit.py',
            code: raw`# ✅ Standardize inside the pipeline so the penalty treats features fairly
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

clf = make_pipeline(StandardScaler(), LogisticRegression(C=0.1, max_iter=2000))
clf.fit(X_train_raw, y_train)`,
          },
        },
      },
      takeaways: [
        'Linear regression minimizes squared error; logistic regression minimizes log loss on a sigmoid.',
        'The logistic gradient is (p − y)·x; scale features so gradient descent and regularization behave.',
        'In scikit-learn, smaller C means stronger regularization.',
        'Practice drill: by hand, compute σ(w·x + b) for w = 1.5, b = −3, x = 2 (answer: 0.5) and say which side of the decision boundary x = 3 falls on.',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'ai-trees-ensembles',
      title: 'Decision Trees, Random Forests & Gradient Boosting (XGBoost Intuition)',
      summary: 'How a tree picks splits with Gini impurity, why averaging many trees reduces variance, and how boosting fixes errors one tree at a time.',
      difficulty: 'Beginner',
      minutes: 22,
      xp: 100,
      analogy:
        "A decision tree is the game of 20 Questions: each question splits the remaining possibilities as cleanly as possible. A random forest asks 500 slightly different players and takes a vote, so one player's odd guess does not matter. Gradient boosting is a relay team where each new runner only practises the stretch the previous runners ran badly.",
      intuition: [
        { title: 'Gini impurity measures mixture', body: "`Gini = 1 − Σ pᵢ²`. A node with 6 positives and 4 negatives: 1 − (0.6² + 0.4²) = 0.48. A pure node scores 0; a 50/50 node scores 0.5." },
        { title: 'A split is chosen to reduce impurity most', body: "Split the 10 rows into left [5 pos, 1 neg] (Gini 0.278) and right [1 pos, 3 neg] (Gini 0.375). Weighted child impurity = (6·0.278 + 4·0.375)/10 = 0.317, so the gain is 0.48 − 0.317 = 0.163. The tree tries every feature and threshold and keeps the best gain." },
        { title: 'Deep trees overfit', body: "A fully grown tree can memorize every training row (high variance). Limit depth, minimum samples per leaf, or prune." },
        { title: 'Random forest = bagging + feature sampling', body: "Train each tree on a bootstrap sample with a random subset of features per split, then average. Errors of uncorrelated trees cancel, so variance drops without raising bias much." },
        { title: 'Gradient boosting = sequential correction', body: "Start with a constant prediction. Each new shallow tree fits the gradient of the loss (for squared error: the residuals). Add it with a small learning rate. XGBoost/LightGBM add regularization, second-order gradients and fast histogram splits." },
        { title: 'Early stopping is mandatory', body: "Boosting keeps lowering training loss forever. Watch a VALIDATION set and stop when it stops improving; never use the test set for this." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Bagging vs boosting', body: 'Forests average independent trees (variance down). Boosting adds dependent trees (bias down).', flow: ['Data', 'Forest: N trees in parallel → average', 'Boosting: tree₁ → residuals → tree₂ → …', 'Early stop on validation', 'Prediction'] },
        { kind: 'tip', title: 'Tabular data default', body: 'On medium-sized tabular datasets, gradient-boosted trees remain a strong baseline that often matches or beats deep networks with far less tuning.' },
      ],
      code: {
        basic: {
          language: 'py',
          filename: 'tree_and_boosting_from_scratch.py',
          explanation: 'Runnable NumPy: Gini impurity and split gain exactly as in the intuition steps, a best-split search, and a tiny gradient-boosting loop with stumps that shrinks the residual error.',
          code: raw`#  ROOT [6+ 4-]  Gini 0.48
#     |  feature x <= t ?
#    / \
#  [5+ 1-]   [1+ 3-]
#  Gini .278  Gini .375      weighted = 0.317   gain = 0.163
import numpy as np

def gini(counts):
    p = np.asarray(counts, dtype=float) / np.sum(counts)
    return 1.0 - np.sum(p ** 2)

assert abs(gini([6, 4]) - 0.48) < 1e-12
left, right = [5, 1], [1, 3]
weighted = (sum(left) * gini(left) + sum(right) * gini(right)) / 10
assert abs(weighted - 0.3166667) < 1e-6 and abs(0.48 - weighted - 0.1633333) < 1e-6

def best_split(x, y):
    """Try every threshold on one feature, return the one with the largest Gini gain."""
    base, best = gini(np.bincount(y, minlength=2)), (0.0, None)
    for t in np.unique(x)[:-1]:
        l, r = y[x <= t], y[x > t]
        w = (len(l) * gini(np.bincount(l, minlength=2)) + len(r) * gini(np.bincount(r, minlength=2))) / len(y)
        if base - w > best[0]:
            best = (base - w, float(t))
    return best

x = np.array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], float)
y = np.array([0, 0, 0, 0, 1, 1, 1, 1, 1, 1])
gain, threshold = best_split(x, y)
assert threshold == 4.0 and abs(gain - 0.48) < 1e-12        # a perfect split

# ---- gradient boosting with depth-1 stumps on a regression target (squared error)
xr = np.linspace(0, 6, 60); yr = np.sin(xr)
pred, lr, mses = np.full_like(yr, yr.mean()), 0.3, []
for _ in range(50):
    resid = yr - pred                                         # negative gradient of squared error
    cand = [(np.sum((resid - np.where(xr <= t, resid[xr <= t].mean(), resid[xr > t].mean())) ** 2), t)
            for t in xr[1:-1]]
    _, t = min(cand)
    stump = np.where(xr <= t, resid[xr <= t].mean(), resid[xr > t].mean())
    pred += lr * stump
    mses.append(float(np.mean((yr - pred) ** 2)))
assert mses[-1] < mses[0] * 0.25                               # error keeps shrinking
print(f"boosting MSE: first round {mses[0]:.4f} -> after 50 rounds {mses[-1]:.4f}")`,
        },
        production: {
          language: 'py',
          filename: 'boosting.py',
          explanation: 'Production pattern: XGBoost with early stopping on a dedicated validation split, then model-agnostic permutation importance on held-out data.',
          code: raw`# pip install xgboost scikit-learn
from sklearn.inspection import permutation_importance
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier

X_tr, X_val, y_tr, y_val = train_test_split(X_train, y_train, test_size=0.2,
                                            stratify=y_train, random_state=0)
model = XGBClassifier(
    n_estimators=2000,            # upper bound; early stopping picks the real number
    learning_rate=0.05,           # smaller steps + more trees generalize better
    max_depth=6,
    subsample=0.8,                # row sampling per tree (adds randomness like a forest)
    colsample_bytree=0.8,         # feature sampling per tree
    reg_lambda=1.0,               # L2 on leaf weights
    eval_metric="logloss",
    early_stopping_rounds=100,    # stop when validation logloss has not improved for 100 rounds
)
model.fit(X_tr, y_tr, eval_set=[(X_val, y_val)], verbose=False)
print("best iteration:", model.best_iteration)

# importance measured on held-out data (built-in gain importance can mislead)
imp = permutation_importance(model, X_val, y_val, n_repeats=10, scoring="roc_auc", random_state=0)
for i in imp.importances_mean.argsort()[::-1][:10]:
    print(f"{feature_names[i]:25s} {imp.importances_mean[i]:.4f} ± {imp.importances_std[i]:.4f}")`,
        },
        bug: {
          explanation:
            'Using the test set as the early-stopping eval_set means the number of trees is tuned on the test data, so the reported test score is optimistically biased. The fix carves a separate validation split from training data.',
          buggy: {
            language: 'py',
            filename: 'train.py',
            code: raw`# ❌ Early stopping tuned on the test set -> leaked, optimistic score
model = XGBClassifier(n_estimators=2000, early_stopping_rounds=50, eval_metric="logloss")
model.fit(X_train, y_train, eval_set=[(X_test, y_test)])
print("test AUC", roc_auc_score(y_test, model.predict_proba(X_test)[:, 1]))`,
          },
          fixed: {
            language: 'py',
            filename: 'train.py',
            code: raw`# ✅ Validation split for early stopping; test touched once at the end
X_tr, X_val, y_tr, y_val = train_test_split(X_train, y_train, test_size=0.2, stratify=y_train, random_state=0)
model = XGBClassifier(n_estimators=2000, early_stopping_rounds=50, eval_metric="logloss")
model.fit(X_tr, y_tr, eval_set=[(X_val, y_val)], verbose=False)
print("test AUC", roc_auc_score(y_test, model.predict_proba(X_test)[:, 1]))`,
          },
        },
      },
      takeaways: [
        'Trees pick splits that maximize impurity reduction; deep trees overfit.',
        'Forests average decorrelated trees to cut variance; boosting adds trees that fit residuals to cut bias.',
        'Early-stop boosting on a validation split, never on the test set.',
        'Practice drill: compute the Gini gain of splitting [8+, 2−] into [4+, 0−] and [4+, 2−] (answer: 0.32 − 0.2667 = 0.0533).',
      ],
    },

    // ------------------------------------------------------------------------
    {
      id: 'ai-kmeans-pipelines',
      title: 'K-Means Clustering & Clean Feature Pipelines',
      summary: 'Unsupervised grouping with K-Means, choosing k, and the preprocessing pipeline that makes distance-based models trustworthy.',
      difficulty: 'Beginner',
      minutes: 18,
      xp: 90,
      analogy:
        "K-Means is setting up k ice-cream stands on a beach. Each sunbather walks to the nearest stand; then each stand moves to the middle of its crowd. Repeat until nobody switches stands. If one axis of the beach is measured in kilometres and the other in centimetres, the stands only care about the centimetre axis, which is why scaling comes first.",
      intuition: [
        { title: 'Two alternating steps', body: "Assign: each point joins the nearest centroid (squared Euclidean distance). Update: each centroid moves to the mean of its points. Repeat until assignments stop changing. Each step can only lower the inertia (sum of squared distances to centroids)." },
        { title: 'Worked example', body: "Points (1,1), (1.5,2), (1,0.5), (8,8), (9,8.5), (8.5,9.5) with starting centroids at the first and fourth point converge in one round to centroids (1.167, 1.167) and (8.5, 8.667), inertia 3.0." },
        { title: 'Initialization matters', body: "Bad starting centroids give bad local minima. k-means++ spreads initial centroids out, and running several initializations (n_init) keeps the best result." },
        { title: 'Choosing k', body: "Inertia always falls as k grows, so look for an elbow, or use the silhouette score (how much closer a point is to its own cluster than to the next one, from −1 to 1). Domain sense beats any single number." },
        { title: 'Pipelines make preprocessing repeatable', body: "Impute missing values, scale numerics, one-hot encode categoricals, then cluster or classify, all inside one Pipeline object that is fit once and applied identically at inference." },
        { title: 'Limits', body: "K-Means assumes roughly round clusters of similar size. For odd shapes or noise use DBSCAN/HDBSCAN; for mixed categorical data consider k-prototypes or embeddings first." },
      ],
      callouts: [
        { kind: 'architecture', title: 'Clustering pipeline', body: 'Every step is fitted on the same data and replayed exactly at inference time.', flow: ['Raw table', 'Impute', 'Scale / one-hot', 'K-Means (k-means++, n_init)', 'Silhouette / inspect', 'Label segments'] },
        { kind: 'warning', title: 'Distances need comparable units', body: 'Any distance-based method (K-Means, KNN, SVM with RBF) is dominated by the feature with the largest numeric range unless you scale.' },
      ],
      code: {
        basic: {
          language: 'py',
          filename: 'kmeans_from_scratch.py',
          explanation: 'Runnable NumPy K-Means with the assign/update loop, asserted against the worked example, plus a demonstration of how an unscaled feature hijacks the clusters.',
          code: raw`#  ITERATION (k = 2)
#
#   y |                 * (8.5, 9.5)
#   9 |              x C2 (8.5, 8.667)      x = centroid, * = point
#   8 |          *       * (9, 8.5)
#     |
#   2 |  *  (1.5, 2)
#   1 | * x C1 (1.167, 1.167)
#     |  *  (1, 0.5)
#     +------------------------------ x
import numpy as np

def kmeans(X, C, iters=10):
    for _ in range(iters):
        d2 = ((X[:, None, :] - C[None, :, :]) ** 2).sum(-1)    # (n_points, k) squared distances
        labels = d2.argmin(1)                                   # ASSIGN to nearest centroid
        newC = np.array([X[labels == k].mean(0) for k in range(len(C))])   # UPDATE to mean
        if np.allclose(newC, C):
            break
        C = newC
    inertia = float(((X - C[labels]) ** 2).sum())
    return labels, C, inertia

X = np.array([[1, 1], [1.5, 2], [1, 0.5], [8, 8], [9, 8.5], [8.5, 9.5]], float)
labels, C, inertia = kmeans(X, X[[0, 3]].copy())
assert labels.tolist() == [0, 0, 0, 1, 1, 1]
assert np.allclose(C, [[7/6, 7/6], [8.5, 26/3]]) and abs(inertia - 3.0) < 1e-12

# Unscaled feature hijack: income (dollars) swamps age (years)
age    = np.array([22, 25, 23, 61, 65, 63], float)
income = np.array([52_000, 51_000, 53_000, 52_500, 51_500, 52_800], float)
raw = np.c_[age, income]
lab_raw, _, _ = kmeans(raw, raw[[0, 3]].copy())
z = (raw - raw.mean(0)) / raw.std(0)
lab_z, _, _ = kmeans(z, z[[0, 3]].copy())
assert lab_z.tolist() == [0, 0, 0, 1, 1, 1]                     # scaled: splits young vs old
assert lab_raw.tolist() != lab_z.tolist()                       # raw: grouped by income noise
print("raw labels", lab_raw.tolist(), "| scaled labels", lab_z.tolist())`,
        },
        production: {
          language: 'py',
          filename: 'segment_customers.py',
          explanation: 'Production pattern: a ColumnTransformer pipeline that handles missing values and unseen categories, plus a silhouette sweep to choose k, saved as one artifact for inference.',
          code: raw`# pip install scikit-learn pandas joblib
import joblib
from sklearn.cluster import KMeans
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.metrics import silhouette_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

num = ["age", "orders_90d", "avg_basket"]
cat = ["country", "channel"]
# numeric: fill gaps with the median, then standardize (k-means is distance-based)
# categorical: one-hot, ignoring categories never seen during fit
pre = ColumnTransformer([
    ("num", Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler())]), num),
    ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), cat),
])
Z = pre.fit_transform(df[num + cat])

scores = {}
for k in range(2, 9):                          # silhouette: higher = tighter, better-separated clusters
    km = KMeans(n_clusters=k, n_init="auto", random_state=0).fit(Z)
    scores[k] = silhouette_score(Z, km.labels_, sample_size=min(5000, len(Z)), random_state=0)
best_k = max(scores, key=scores.get)
print({k: round(s, 3) for k, s in scores.items()}, "-> best k =", best_k)

pipe = Pipeline([("pre", pre), ("km", KMeans(n_clusters=best_k, n_init="auto", random_state=0))])
pipe.fit(df[num + cat])
joblib.dump(pipe, "segmenter.joblib")          # one artifact: preprocessing + model together`,
        },
        bug: {
          explanation:
            'Fitting a new scaler at inference time (on the incoming batch) changes the coordinate system, so the same customer can land in a different cluster depending on who else is in the batch. The fix persists and reuses the fitted pipeline.',
          buggy: {
            language: 'py',
            filename: 'predict.py',
            code: raw`# ❌ Re-fitting preprocessing on each inference batch
from sklearn.preprocessing import StandardScaler

def assign_segment(batch_df, kmeans_model):
    Z = StandardScaler().fit_transform(batch_df[num])   # batch-dependent mean/std!
    return kmeans_model.predict(Z)`,
          },
          fixed: {
            language: 'py',
            filename: 'predict.py',
            code: raw`# ✅ Load the pipeline fitted at training time; transform only
import joblib

PIPE = joblib.load("segmenter.joblib")                  # contains the fitted scaler + encoder + kmeans

def assign_segment(batch_df):
    return PIPE.predict(batch_df[num + cat])             # identical transform for every request`,
          },
        },
      },
      takeaways: [
        'K-Means alternates assign-to-nearest and move-to-mean; it only reaches a local minimum.',
        'Scale features before any distance-based model, or the widest-range feature decides everything.',
        'Persist the fitted pipeline and only transform at inference time.',
        'Practice drill: with centroids (0,0) and (10,0), assign the point (4,3) by hand (distances² 25 vs 45 → cluster 1) and compute the new centroid if it is the only point there.',
      ],
    },
  ],
};
