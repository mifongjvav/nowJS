import { GeneratorError } from "./generatorTypes.ts";
import { getGeneratorDifficulty } from "./generatorDifficulty.ts";
import { createGeneratorCatchPath } from "./generatorCatchPath.ts";
import type {
    AudioOnset,
    GeneratorAnalysis,
    GeneratorOptions,
} from "./generatorTypes.ts";

export interface GeneratorNote {
    x: number;
    time: number;
    strength?: number;
    brightness?: number;
}

const lanePatterns = [
    [0, 2, 1, 3, 1, 2, 0, 3],
    [0, 1, 2, 3, 2, 1, 0, 2],
    [1, 3, 0, 2, 0, 3, 1, 2],
    [0, 3, 1, 2, 1, 3, 0, 2],
];
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

export function createGeneratorNotes(
    analysis: GeneratorAnalysis,
    options: GeneratorOptions,
    { deferCatchLayout = false }: { deferCatchLayout?: boolean } = {},
): GeneratorNote[] {
    if (
        !["catch", "mania"].includes(options.mode) ||
        (options.density !== undefined &&
            !["easy", "normal", "hard"].includes(options.density))
    )
        throw new GeneratorError("failed");
    const profile = getGeneratorDifficulty(options);
    if (
        !Number.isFinite(analysis.bpm) ||
        analysis.bpm < 30 ||
        analysis.bpm > 300 ||
        !Number.isFinite(analysis.offsetMs) ||
        !Number.isFinite(analysis.durationMs)
    )
        throw new GeneratorError("bpm");
    if (!analysis.frames.length) throw new GeneratorError("noNotes");
    const beat = 60000 / analysis.bpm;
    const step = Math.max(1, beat / profile.divisions);
    const grid = new Map<number, AudioOnset>();
    const put = (onset: AudioOnset) => {
        let timeMs = NaN;
        // A harder grid is an extension of the easier one, not a narrower
        // timing window that accidentally deletes earlier musical accents.
        for (
            let divisions = 1;
            divisions <= profile.divisions;
            divisions *= 2
        ) {
            const quantum = beat / divisions;
            const snapped =
                analysis.offsetMs +
                Math.round((onset.timeMs - analysis.offsetMs) / quantum) *
                    quantum;
            if (
                Math.abs(snapped - onset.timeMs) <= Math.min(65, quantum * 0.38)
            ) {
                timeMs = snapped;
                break;
            }
        }
        const index = Math.round((timeMs - analysis.offsetMs) / step);
        if (
            !Number.isFinite(onset.strength) ||
            !Number.isFinite(timeMs) ||
            timeMs < 250 ||
            timeMs > analysis.durationMs - 100
        )
            return;
        if (!grid.has(index) || grid.get(index)!.strength < onset.strength)
            grid.set(index, { ...onset, timeMs });
    };
    for (const onset of analysis.onsets) put(onset);
    // Higher settings can represent quieter real transients that the primary
    // detector omitted. Never add a metronomic stream over sustained/silent
    // audio just to make the level number appear more difficult.
    if (profile.level >= 4) {
        const frames = analysis.frames;
        const ratio = Math.max(1.03, 1.4 - Math.log2(profile.level) * 0.06);
        for (let i = 1; i < frames.length - 1; i++) {
            const frame = frames[i];
            if (
                frame.rms < 0.03 ||
                frame.novelty < 0.015 ||
                frame.novelty < frames[i - 1].novelty ||
                frame.novelty <= frames[i + 1].novelty
            )
                continue;
            let mean = 0;
            const left = Math.max(0, i - 8),
                right = Math.min(frames.length - 1, i + 8);
            for (let j = left; j <= right; j++) mean += frames[j].novelty;
            if (frame.novelty < (mean / (right - left + 1)) * ratio) continue;
            put({
                timeMs: frame.timeMs,
                strength: frame.novelty,
                brightness: frame.brightness,
            });
        }
    }
    // Tonal fallback remains restricted to audible material. It is not a
    // density filler: normal songs are never padded with invented transients.
    if (grid.size < 4) {
        const spacing =
            analysis.frames.length > 1
                ? analysis.frames[1].timeMs - analysis.frames[0].timeMs
                : 1;
        for (
            let i = Math.ceil((250 - analysis.offsetMs) / beat);
            analysis.offsetMs + i * beat < analysis.durationMs - 100;
            i++
        ) {
            const timeMs = analysis.offsetMs + i * beat;
            const frame =
                analysis.frames[
                    clamp(
                        Math.round(
                            (timeMs - analysis.frames[0].timeMs) / spacing,
                        ),
                        0,
                        analysis.frames.length - 1,
                    )
                ];
            if (frame?.rms > 0.015)
                put({ timeMs, strength: 0.3, brightness: frame.brightness });
        }
    }
    const candidates = [...grid.values()].sort((a, b) => a.timeMs - b.timeMs);
    // Relative accents per four-bar phrase preserve quiet verses instead of
    // comparing every note with the loudest chorus in the entire song.
    const phrases = new Map<number, number[]>();
    for (const candidate of candidates) {
        const phrase = Math.floor(
            (candidate.timeMs - analysis.offsetMs) / (beat * 16),
        );
        if (!phrases.has(phrase)) phrases.set(phrase, []);
        phrases.get(phrase)!.push(candidate.strength);
    }
    const thresholds = new Map<number, number>();
    for (const [phrase, strengths] of phrases) {
        strengths.sort((a, b) => a - b);
        const densityBias =
            options.density === "easy"
                ? 0.12
                : options.density === "hard"
                  ? -0.08
                  : 0;
        const percentile = clamp(
            0.32 - profile.complexity * 0.28 + densityBias,
            0,
            0.6,
        );
        thresholds.set(
            phrase,
            strengths[Math.floor((strengths.length - 1) * percentile)] * 0.8,
        );
    }
    let x = 256,
        previousTime = -Infinity,
        previousLane = -1,
        indexInPhrase = 0,
        previousPhrase = -Infinity,
        pattern = 0;
    const notes: GeneratorNote[] = [];
    const catchPath =
        options.mode === "catch" && !deferCatchLayout
            ? createGeneratorCatchPath(analysis, options)
            : null;
    for (const candidate of candidates) {
        const time = Math.round(candidate.timeMs);
        const beatIndex = (time - analysis.offsetMs) / beat;
        const phrase = Math.floor(beatIndex / 16);
        if (candidate.strength < (thresholds.get(phrase) ?? 0)) continue;
        if (time - previousTime < Math.max(20, step * 0.85)) continue;
        if (phrase !== previousPhrase) {
            // Similar timbre/energy chooses the same vocabulary in a reprise.
            pattern = clamp(
                Math.floor(candidate.brightness * 12 + candidate.strength * 2),
                0,
                lanePatterns.length - 1,
            );
            indexInPhrase = 0;
            previousPhrase = phrase;
        }
        if (options.mode === "mania") {
            let lane = lanePatterns[pattern][indexInPhrase % 8];
            if (lane === previousLane && time - previousTime < beat)
                lane = (lane + 2) % 4;
            previousLane = lane;
            x = 64 + lane * 128;
        } else {
            x = catchPath?.place(time) ?? 256;
        }
        notes.push({
            x: Math.round(x),
            time,
            strength: candidate.strength,
            brightness: candidate.brightness,
        });
        indexInPhrase++;
        previousTime = time;
    }
    if (!notes.length) throw new GeneratorError("noNotes");
    return notes;
}
