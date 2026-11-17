import assert from "node:assert/strict";
import { test } from "node:test";
import {
    analyzeGeneratorAudio,
    estimateGeneratorBpm,
    estimateGeneratorOffset,
} from "../beatmapAnalysis.ts";

const rate = 22050;
function pulseTrack(bpm = 120, duration = 12, offset = 0.123) {
    const samples = new Float32Array(rate * duration);
    for (let time = offset; time < duration; time += 60 / bpm) {
        const start = Math.floor(time * rate);
        for (let i = 0; i < rate * 0.08 && start + i < samples.length; i++) {
            samples[start + i] +=
                0.8 *
                Math.exp(-i / (rate * 0.012)) *
                Math.sin((2 * Math.PI * 100 * i) / rate);
        }
    }
    return samples;
}

test("real Meyda features detect metronome onsets, tempo and audio offset", async () => {
    const progress = [];
    const analysis = await analyzeGeneratorAudio(pulseTrack(), rate, {
        progress: (p) => progress.push(p),
    });
    assert.equal(analysis.bpm, 120);
    assert.ok(Math.abs(analysis.offsetMs - 123) < 10);
    assert.ok(analysis.onsets.length >= 22 && analysis.onsets.length <= 25);
    assert.equal(analysis.estimatedBpm, true);
    assert.ok(analysis.confidence > 0.5);
    assert.equal(progress.at(-1), 1);
    assert.ok(
        analysis.frames.every(
            (f) => Number.isFinite(f.rms) && Number.isFinite(f.brightness),
        ),
    );
});

test("manual BPM is never silently replaced by the estimate", async () => {
    const analysis = await analyzeGeneratorAudio(pulseTrack(120, 4), rate, {
        bpm: 96.5,
    });
    assert.equal(analysis.bpm, 96.5);
    assert.equal(analysis.estimatedBpm, false);
});

test("audio analysis estimates tempos other than the 120 BPM fallback", async () => {
    for (const bpm of [90, 150]) {
        const result = await analyzeGeneratorAudio(pulseTrack(bpm, 8), rate);
        assert.ok(Math.abs(result.bpm - bpm) < 1);
        assert.equal(result.estimatedBpm, true);
        assert.ok(result.confidence > 0.5);
    }
});

test("tempo histogram handles different regular tempos and reports uncertainty", () => {
    for (const bpm of [90, 120, 150, 180]) {
        const onsets = Array.from({ length: 24 }, (_, i) => ({
            timeMs: 123 + (i * 60000) / bpm,
            strength: 1,
            brightness: 0.1,
        }));
        assert.ok(Math.abs(estimateGeneratorBpm(onsets).bpm - bpm) < 1);
        assert.ok(Math.abs(estimateGeneratorOffset(onsets, bpm) - 123) < 1);
    }
    assert.deepEqual(estimateGeneratorBpm([]), { bpm: 120, confidence: 0 });
});

test("tonal tracks remain finite and are marked as weak estimates", async () => {
    const tone = Float32Array.from(
        { length: rate * 3 },
        (_, i) => 0.25 * Math.sin((2 * Math.PI * 440 * i) / rate),
    );
    const result = await analyzeGeneratorAudio(tone, rate);
    assert.ok(Number.isFinite(result.bpm) && Number.isFinite(result.offsetMs));
    assert.ok(result.onsets.length < 4);
    assert.ok(result.confidence < 0.35);
});

test("silence, invalid BPM and too-short audio produce explicit errors", async () => {
    await assert.rejects(
        analyzeGeneratorAudio(new Float32Array(rate * 2), rate),
        (e) => e.code === "silent",
    );
    await assert.rejects(
        analyzeGeneratorAudio(new Float32Array(10), rate),
        (e) => e.code === "duration",
    );
    await assert.rejects(
        analyzeGeneratorAudio(pulseTrack(120, 2), rate, { bpm: 0 }),
        (e) => e.code === "bpm",
    );
});

test("analysis yields to cancellation rather than completing a stale job", async () => {
    const controller = new AbortController();
    await assert.rejects(
        analyzeGeneratorAudio(pulseTrack(), rate, {
            signal: controller.signal,
            progress: (p) => {
                if (p > 0) controller.abort();
            },
        }),
        (e) => e.name === "AbortError",
    );
});

test("invalid decoded samples are rejected instead of exporting NaN timing", async () => {
    const samples = pulseTrack(120, 2);
    samples[10] = NaN;
    await assert.rejects(
        analyzeGeneratorAudio(samples, rate),
        (e) => e.code === "decode",
    );
});
