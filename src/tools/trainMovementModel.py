"""NumPy-only MLP trainer. Run with OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1.
Usage: python src/tools/trainMovementModel.py corpus.json model.ts report.json
No audio/maps are uploaded. Fixed song-level split and initialization.
"""
import copy
import json
import sys
import numpy as np

corpus = json.load(open(sys.argv[1]))
rng = np.random.default_rng(20261117)
songs = corpus["songs"]
if len(songs) < 8:
    raise ValueError("At least eight distinct songs are needed for grouped evaluation")
order = rng.permutation(len(songs))
count = max(2, len(songs) // 5)
groups = {
    "test": [songs[i] for i in order[:count]],
    "validation": [songs[i] for i in order[count:count * 2]],
    "train": [songs[i] for i in order[count * 2:]],
}
data = {}
for split, members in groups.items():
    rows = [row for song in members for row in song["rows"]]
    # Metrics count mirrored examples; these are not independent recordings.
    x = np.array([r[0] for r in rows], dtype=np.float32)
    y = np.array([r[1] for r in rows], dtype=np.int64)
    data[split] = (x, y)

dims = [data["train"][0].shape[1], 32, 32, len(corpus["bins"])]
weights = [
    (rng.normal(0, np.sqrt(2 / a), (a, b)).astype(np.float32),
     np.zeros(b, dtype=np.float32))
    for a, b in zip(dims, dims[1:])
]


def forward(x):
    layers = [x]
    for i, (w, b) in enumerate(weights):
        z = layers[-1] @ w + b
        layers.append(np.tanh(z) if i < 2 else z)
    z = layers[-1] - layers[-1].max(axis=1, keepdims=True)
    p = np.exp(z)
    p /= p.sum(axis=1, keepdims=True)
    return layers, p


prior = np.bincount(data["train"][1], minlength=dims[-1]) + 1
prior = prior / prior.sum()


def evaluate(split):
    x, y = data[split]
    losses, correct = 0.0, 0
    for start in range(0, len(y), 2048):
        _, p = forward(x[start:start + 2048])
        target = y[start:start + 2048]
        losses -= np.log(p[np.arange(len(target)), target] + 1e-9).sum()
        correct += (p.argmax(axis=1) == target).sum()
    return {
        "nll": float(losses / len(y)),
        "accuracy": float(correct / len(y)),
        "unconditionalNll": float(-np.log(prior[y]).mean()),
        "examplesIncludingMirrors": len(y),
    }


# Adam, minibatches, validation-selected checkpoint. At most 30 epochs on one
# CPU thread; no service or GPU job remains alive after this process exits.
moments = [(np.zeros_like(w), np.zeros_like(b)) for w, b in weights]
variances = copy.deepcopy(moments)
best, best_loss, step = copy.deepcopy(weights), float("inf"), 0
trace = []
for epoch in range(30):
    x, y = data["train"]
    indices = rng.permutation(len(y))
    for start in range(0, len(y), 512):
        chosen = indices[start:start + 512]
        layers, delta = forward(x[chosen])
        delta[np.arange(len(chosen)), y[chosen]] -= 1
        delta /= len(chosen)
        gradients = []
        for i in range(2, -1, -1):
            w, b = weights[i]
            gradients.append((layers[i].T @ delta + w * 1e-4, delta.sum(axis=0)))
            if i:
                delta = (delta @ w.T) * (1 - layers[i] ** 2)
        step += 1
        for i, grads in enumerate(reversed(gradients)):
            for j in range(2):
                g = np.clip(grads[j], -2, 2)
                moments[i][j][:] = .9 * moments[i][j] + .1 * g
                variances[i][j][:] = .999 * variances[i][j] + .001 * g * g
                weights[i][j][:] -= .001 * (moments[i][j] / (1 - .9 ** step)) / (
                    np.sqrt(variances[i][j] / (1 - .999 ** step)) + 1e-8)
    metric = evaluate("validation")
    trace.append(metric["nll"])
    if metric["nll"] < best_loss:
        best_loss, best = metric["nll"], copy.deepcopy(weights)
    print(f"epoch {epoch + 1}: validation NLL {metric['nll']:.4f}", flush=True)
weights = best
report = {
    "architecture": dims,
    "scope": "Conditional horizontal-motion MLP; standard-to-Catch projection, not native Catch or audio transcription",
    "corpus": {k: corpus[k] for k in ["nativeCatch", "convertedStandard", "excluded"]},
    "splits": {s: [{"id": m["id"], "song": m["song"], "maps": m["maps"]} for m in members]
               for s, members in groups.items()},
    "metrics": {s: evaluate(s) for s in data},
    "validationTrace": trace,
    "seed": 20261117,
}
probe = data["test"][0][17:18]
_, probability = forward(probe)
tempered = probability[0] ** (1 / .85)
tempered /= tempered.sum()
report["inferenceFixture"] = {
    "features": probe[0].tolist(),
    "probabilities": tempered.tolist(),
}
model = {
    "schema": 1,
    "bins": corpus["bins"],
    "layers": [{"weights": np.round(w, 7).tolist(), "bias": np.round(b, 7).tolist()}
               for w, b in weights],
}
with open(sys.argv[2], "w") as f:
    f.write("// Locally trained MLP weights. See tools/MOVEMENT_MODEL.md; no source media.\n")
    f.write("export default " + json.dumps(model, separators=(",", ":")) + ";\n")
with open(sys.argv[3], "w") as f:
    json.dump(report, f, ensure_ascii=False, indent=2)
print(json.dumps(report["metrics"], indent=2))
