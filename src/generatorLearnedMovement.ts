import model from "./generatorMovementWeights.ts";
import { movementFeatures } from "./generatorLearnedFeatures.ts";
import type { MovementHistory } from "./generatorLearnedFeatures.ts";
import { getGeneratorDifficulty } from "./generatorDifficulty.ts";
import { GeneratorError } from "./generatorTypes.ts";
import type { GeneratorAnalysis, GeneratorOptions } from "./generatorTypes.ts";

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
    const place = (at: number, length = Infinity) => {
        if (!Number.isFinite(time)) {
            time = at;
            return x;
        }
        if (at <= time) return x;
        const elapsed = at - time;
        if (elapsed > beat * 8) history.length = 0;
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
        const candidates = probabilities.map((mass, i) => {
            const dx = Math.round(x + model.bins[i] * 256) - x;
            if (Math.abs(dx) > reach || x + dx < 32 || x + dx > 480) return 0;
            // Engine-specific recovery safeguard, not a learned quality score.
            if (
                previous &&
                Math.abs(previous.dx) / Math.max(1, previous.beats * beat) >
                    0.65 &&
                dx * previous.dx < 0
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
        x = Math.max(
            32,
            Math.min(480, Math.round(x + model.bins[chosen] * 256)),
        );
        history.push({ dx: x - before, beats: elapsed / beat });
        if (history.length > 4) history.shift();
        time = at;
        return x;
    };
    return {
        place,
        extend: (length: number, endTime: number) => place(endTime, length),
        afterShower(endTime: number) {
            x = 256;
            time = endTime;
            history.length = 0;
        },
    };
}
