import model from "./generatorMovementWeights.ts";
import { movementFeatures } from "./generatorLearnedFeatures.ts";
import type { MovementHistory } from "./generatorLearnedFeatures.ts";
import { getGeneratorDifficulty } from "./generatorDifficulty.ts";
import { GeneratorError } from "./generatorTypes.ts";
import type { GeneratorAnalysis, GeneratorOptions } from "./generatorTypes.ts";
import { createGeneratorTrigGesture } from "./generatorTrigGestures.ts";

export function validateMovementOptions(options: Partial<GeneratorOptions>) {
    if (
        (options.movementModel !== undefined &&
            !["phrases", "learned"].includes(options.movementModel)) ||
        (options.modelSeed !== undefined &&
            (!Number.isInteger(options.modelSeed) ||
                options.modelSeed < 0 ||
                options.modelSeed > 0xffffffff))
    )
        throw new GeneratorError("config");
}

export function movementProbabilities(features: number[]) {
    if (features.length !== 14 || features.some((v) => !Number.isFinite(v)))
        throw new GeneratorError("failed");
    let values = features;
    for (let layer = 0; layer < model.layers.length; layer++) {
        const { weights, bias } = model.layers[layer];
        values = bias.map((b, j) => {
            const z = weights.reduce(
                (sum, row, i) => sum + row[j] * values[i],
                b,
            );
            return layer + 1 < model.layers.length ? Math.tanh(z) : z;
        });
    }
    const maximum = Math.max(...values);
    const masses = values.map((v) => Math.exp((v - maximum) / 0.85));
    const total = masses.reduce((sum, v) => sum + v, 0);
    return masses.map((v) => v / total);
}

export function createLearnedCatchPath(
    analysis: GeneratorAnalysis,
    options: Partial<GeneratorOptions>,
) {
    validateMovementOptions(options);
    const profile = getGeneratorDifficulty(options);
    const beat = 60000 / analysis.bpm;
    let seed = (options.modelSeed ?? 1) >>> 0;
    const random = () => {
        seed = (seed + 0x6d2b79f5) >>> 0;
        let value = seed;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
    let x = 256,
        time = NaN,
        onsetIndex = 0;
    const history: MovementHistory[] = [];
    // Combo-level composition is an explicit layout constraint, not knowledge
    // learned by the MLP. Keep its local sampling, but give each colour a home.
    const regionRadius = Math.min(90, 40 + Math.log2(profile.level) * 10);
    let regionCenter: number | null = null,
        pendingCenter: number | null = null;
    let comboSum = 0,
        comboCount = 0;
    let localVelocity = 0;
    let gesture: ReturnType<typeof createGeneratorTrigGesture> | null = null;
    let gestureDirection = 1;
    const orientGesture = () => {
        if (!gesture || regionCenter === null) return;
        gestureDirection = gesture.direction;
        // Prefer the available side near edges; this is not a fixed L/R cycle.
        if (
            regionCenter + gestureDirection * regionRadius < 32 ||
            regionCenter + gestureDirection * regionRadius > 480
        )
            gestureDirection *= -1;
    };
    const record = () => {
        comboSum += x;
        comboCount++;
    };
    const place = (at: number, length = Infinity) => {
        if (!Number.isFinite(time)) {
            time = at;
            regionCenter = pendingCenter === null ? null : x;
            pendingCenter = null;
            orientGesture();
            record();
            return x;
        }
        if (at <= time) return x;
        const elapsed = at - time;
        if (elapsed > beat * 8) {
            history.length = 0;
            localVelocity = 0;
        }
        while (
            onsetIndex < analysis.onsets.length &&
            analysis.onsets[onsetIndex].timeMs <= at + beat * 0.08
        )
            onsetIndex++;
        const next = analysis.onsets[onsetIndex]?.timeMs ?? at + beat;
        const features = movementFeatures(
            x,
            elapsed / beat,
            (next - at) / beat,
            (((at - analysis.offsetMs) / beat) % 4) / 4,
            Math.min(2, profile.spacing / 0.8),
            history,
        );
        const probabilities = movementProbabilities(features);
        const previous = history.at(-1);
        const reach = Math.min(length, elapsed * profile.spacing);
        // Ease local gestures, not the larger colour-change entrance. Keep
        // audible accents crisp instead of applying inertia indiscriminately.
        const onset = analysis.onsets[Math.max(0, onsetIndex - 1)];
        const accent =
            onset &&
            onset.strength >= 0.65 &&
            Math.abs(onset.timeMs - at) < beat * 0.18;
        const roundGesture =
            regionCenter !== null && pendingCenter === null && !accent;
        const displacements = model.bins.map((bin) =>
            bin === 0
                ? 0
                : Math.round(
                      bin * 256 * (roundGesture ? 0.65 : 1) +
                          (roundGesture
                              ? localVelocity * Math.min(elapsed, beat) * 0.35
                              : 0),
                  ),
        );
        const candidates = probabilities.map((mass, i) => {
            const step = displacements[i];
            if (Math.abs(step) > reach || x + step < 32 || x + step > 480)
                return 0;
            if (pendingCenter !== null) {
                const sigma = Math.max(18, Math.abs(pendingCenter - x) * 0.3);
                mass *= Math.exp(
                    -0.5 * ((x + step - pendingCenter) / sigma) ** 2,
                );
            } else if (
                regionCenter !== null &&
                Math.abs(x + step - regionCenter) > regionRadius
            )
                return 0;
            // Engine-specific recovery safeguard, not a learned quality score.
            if (
                previous &&
                Math.abs(previous.dx) / Math.max(1, previous.beats * beat) >
                    0.65 &&
                step * previous.dx < 0
            )
                return mass * 0.25;
            return mass;
        });
        const total = candidates.reduce((sum, mass) => sum + mass, 0);
        let ticket = random() * total,
            chosen = model.bins.indexOf(0);
        if (total > 0)
            for (let i = 0; i < candidates.length; i++) {
                ticket -= candidates[i];
                if (ticket < 0) {
                    chosen = i;
                    break;
                }
            }
        const before = x;
        x = Math.max(32, Math.min(480, x + displacements[chosen]));
        if (roundGesture && gesture && regionCenter !== null) {
            const guide = regionCenter + gestureDirection * gesture.sample(at);
            // The network supplies a little local variation, while most of
            // the geometry follows a continuous arc rather than noisy steps.
            const target = Math.round(guide * 0.85 + x * 0.15);
            x = Math.max(
                Math.max(
                    32,
                    Math.ceil(before - reach),
                    Math.ceil(regionCenter - regionRadius),
                ),
                Math.min(
                    Math.min(
                        480,
                        Math.floor(before + reach),
                        Math.floor(regionCenter + regionRadius),
                    ),
                    target,
                ),
            );
        }
        history.push({ dx: x - before, beats: elapsed / beat });
        if (history.length > 4) history.shift();
        time = at;
        if (pendingCenter !== null) {
            regionCenter = x;
            pendingCenter = null;
            localVelocity = 0;
            orientGesture();
        } else {
            localVelocity = (x - before) / elapsed;
        }
        record();
        return x;
    };
    return {
        place,
        beginCombo(at: number, endTime = at + beat * 4, signature = "") {
            localVelocity = 0;
            gesture = createGeneratorTrigGesture(
                at,
                endTime,
                regionRadius,
                profile.spacing,
                signature || String(Math.round(((endTime - at) / beat) * 4)),
                options.modelSeed ?? 1,
            );
            if (!Number.isFinite(time)) {
                pendingCenter = x;
            } else if (at <= time) {
                regionCenter = x;
                pendingCenter = null;
                orientGesture();
            } else {
                const mean = comboCount ? comboSum / comboCount : x;
                const heading = Math.sign(history.at(-1)?.dx ?? 0) || 1;
                const direction =
                    Math.abs(x - mean) > 8 ? Math.sign(x - mean) : heading;
                const separation = Math.min(
                    170,
                    70 + Math.log2(profile.level) * 30,
                );
                const reach = Math.max(0, at - time) * profile.spacing * 0.9;
                const margin = 32 + regionRadius * 0.35;
                const left = margin,
                    right = 512 - margin;
                const goal = (sign: number) =>
                    Math.max(
                        x - reach,
                        Math.min(
                            x + reach,
                            Math.max(
                                left,
                                Math.min(right, mean + sign * separation),
                            ),
                        ),
                    );
                const preferred = goal(direction),
                    alternative = goal(-direction);
                // Separate from the previous group's *centre*, not merely its
                // last note: a round gesture can finish back near its entrance.
                pendingCenter =
                    Math.abs(preferred - mean) >=
                    Math.abs(alternative - mean) * 0.8
                        ? preferred
                        : alternative;
            }
            comboSum = 0;
            comboCount = 0;
        },
        extend: (length: number, endTime: number) => place(endTime, length),
        afterShower(endTime: number) {
            x = 256;
            time = endTime;
            history.length = 0;
            regionCenter = pendingCenter = null;
            comboSum = comboCount = 0;
            localVelocity = 0;
            gesture = null;
        },
    };
}
