import Meyda from "./vendor/meyda.js";
import {
    GeneratorError,
    GENERATOR_MAX_SECONDS,
    checkGeneratorAbort,
} from "./generatorTypes.ts";
import type {
    AudioFeatureFrame,
    AudioOnset,
    GeneratorAnalysis,
} from "./generatorTypes.ts";

const mod = (x: number, n: number) => ((x % n) + n) % n;

export function estimateGeneratorBpm(onsets: readonly AudioOnset[]) {
    if (onsets.length < 3) return { bpm: 120, confidence: 0 };
    const histogram = new Map<number, number>();
    let total = 0;
    for (let i = 0; i < onsets.length; i++) {
        for (let j = i + 1; j < Math.min(onsets.length, i + 9); j++) {
            const interval = onsets[j].timeMs - onsets[i].timeMs;
            if (interval < 100 || interval > 8000) continue;
            let bpm = 60000 / interval;
            while (bpm < 70) bpm *= 2;
            while (bpm > 190) bpm /= 2;
            if (bpm < 70 || bpm > 190) continue;
            const bin = Math.round(bpm * 2);
            const weight =
                Math.sqrt(onsets[i].strength * onsets[j].strength) / (j - i);
            histogram.set(bin, (histogram.get(bin) ?? 0) + weight);
            total += weight;
        }
    }
    const best = [...histogram.entries()].sort((a, b) => b[1] - a[1])[0];
    return best
        ? {
              bpm: best[0] / 2,
              confidence: Math.min(1, best[1] / Math.max(1e-9, total * 0.35)),
          }
        : { bpm: 120, confidence: 0 };
}

export function estimateGeneratorOffset(
    onsets: readonly AudioOnset[],
    bpm: number,
) {
    const period = 60000 / bpm;
    const bins = new Float64Array(128);
    for (const onset of onsets) {
        const center = Math.round(
            (mod(onset.timeMs, period) / period) * bins.length,
        );
        for (let d = -2; d <= 2; d++) {
            bins[mod(center + d, bins.length)] +=
                onset.strength * (3 - Math.abs(d));
        }
    }
    let best = 0;
    for (let i = 1; i < bins.length; i++) if (bins[i] > bins[best]) best = i;
    const phase = (best / bins.length) * period;
    let x = 0,
        y = 0;
    for (const onset of onsets) {
        const distance = Math.abs(
            mod(onset.timeMs - phase + period / 2, period) - period / 2,
        );
        if (distance > period / 16) continue;
        const angle = (onset.timeMs / period) * Math.PI * 2;
        x += Math.cos(angle) * onset.strength;
        y += Math.sin(angle) * onset.strength;
    }
    let offset =
        x || y
            ? mod((Math.atan2(y, x) / (Math.PI * 2)) * period, period)
            : phase;
    if (offset > period / 2) offset -= period;
    return Math.round(offset * 1000) / 1000;
}

export async function analyzeGeneratorAudio(
    samples: Float32Array,
    sampleRate: number,
    options: {
        bpm?: number;
        signal?: AbortSignal;
        progress?: (value: number) => void;
    } = {},
): Promise<GeneratorAnalysis> {
    checkGeneratorAbort(options.signal);
    const durationMs = (samples.length / sampleRate) * 1000;
    if (
        !Number.isFinite(durationMs) ||
        sampleRate < 8000 ||
        sampleRate > 96000 ||
        durationMs < 2000 ||
        durationMs > GENERATOR_MAX_SECONDS * 1000
    )
        throw new GeneratorError("duration");
    if (
        options.bpm !== undefined &&
        (!Number.isFinite(options.bpm) || options.bpm < 30 || options.bpm > 300)
    )
        throw new GeneratorError("bpm");
    const size = sampleRate <= 12000 ? 512 : 1024;
    const hop = size / 2;
    Meyda.sampleRate = sampleRate;
    Meyda.bufferSize = size;
    Meyda.windowingFunction = "hanning";
    const previous = new Float32Array(size / 2);
    const frames: AudioFeatureFrame[] = [];
    let maxRms = 0,
        maxNovelty = 0,
        previousRms = 0;
    options.progress?.(0);
    for (let start = 0; start < samples.length; start += hop) {
        checkGeneratorAbort(options.signal);
        const frame = new Float32Array(size);
        frame.set(samples.subarray(start, start + size));
        const features = Meyda.extract(
            ["rms", "amplitudeSpectrum", "spectralCentroid"],
            frame,
        );
        if (!Number.isFinite(features.rms)) throw new GeneratorError("decode");
        const rms = features.rms;
        const spectrum: Float32Array = features.amplitudeSpectrum;
        let flux = 0;
        for (let bin = 1; bin < spectrum.length; bin++) {
            if (!Number.isFinite(spectrum[bin]))
                throw new GeneratorError("decode");
            const value = Math.log1p(spectrum[bin]);
            flux += Math.max(0, value - previous[bin]);
            previous[bin] = value;
        }
        const novelty =
            flux / spectrum.length + Math.max(0, rms - previousRms) * 2;
        frames.push({
            timeMs: Math.min(
                durationMs - 1,
                ((start + size / 2) / sampleRate) * 1000,
            ),
            rms,
            novelty,
            brightness: Number.isFinite(features.spectralCentroid)
                ? features.spectralCentroid / spectrum.length
                : 0,
        });
        maxRms = Math.max(maxRms, rms);
        maxNovelty = Math.max(maxNovelty, novelty);
        previousRms = rms;
        if (frames.length % 32 === 0) {
            options.progress?.(start / samples.length);
            // Bounded batches keep the menu and cancellation responsive even
            // when Workers are unavailable in an offline host.
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
    }
    if (maxRms < 0.00001) throw new GeneratorError("silent");
    for (const frame of frames) {
        frame.rms /= maxRms;
        frame.novelty /= maxNovelty || 1;
    }
    const onsets: AudioOnset[] = [];
    for (let i = 0; i < frames.length; i++) {
        const current = frames[i];
        if (
            current.rms < 0.015 ||
            current.novelty < 0.015 ||
            current.novelty < (frames[i - 1]?.novelty ?? 0) ||
            current.novelty < (frames[i + 1]?.novelty ?? 0)
        )
            continue;
        let mean = 0;
        const left = Math.max(0, i - 8),
            right = Math.min(frames.length - 1, i + 8);
        for (let j = left; j <= right; j++) mean += frames[j].novelty;
        if (current.novelty < (mean / (right - left + 1)) * 1.6) continue;
        // Refine an FFT-frame peak to its first substantial waveform sample,
        // avoiding the half-window latency in the exported TimingPoint.
        const start = i * hop,
            end = Math.min(samples.length, start + size);
        let peak = 0,
            offset = start;
        for (let j = start; j < end; j++)
            peak = Math.max(peak, Math.abs(samples[j]));
        while (offset < end && Math.abs(samples[offset]) < peak * 0.25)
            offset++;
        const onset = {
            timeMs: (offset / sampleRate) * 1000,
            strength: current.novelty,
            brightness: current.brightness,
        };
        const last = onsets.at(-1);
        if (last && onset.timeMs - last.timeMs < 90) {
            if (onset.strength > last.strength)
                onsets[onsets.length - 1] = onset;
        } else onsets.push(onset);
    }
    checkGeneratorAbort(options.signal);
    const estimated = estimateGeneratorBpm(onsets);
    const bpm = options.bpm ?? estimated.bpm;
    options.progress?.(1);
    return {
        durationMs,
        bpm,
        estimatedBpm: options.bpm === undefined,
        confidence: options.bpm === undefined ? estimated.confidence : 1,
        offsetMs: estimateGeneratorOffset(onsets, bpm),
        frames,
        onsets,
    };
}
