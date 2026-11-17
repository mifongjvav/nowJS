import assert from "node:assert/strict";
import { test } from "node:test";
import { planGeneratorPhrases } from "../generatorPhrases.ts";
import { createGeneratorCatchPath } from "../generatorCatchPath.ts";
import { buildGeneratedBeatmap } from "../beatmapGenerator.ts";
import { parseOsu, compileChart } from "../osuParser.ts";

function song() {
    return {
        bpm: 120,
        offsetMs: 0,
        durationMs: 24000,
        estimatedBpm: false,
        confidence: 1,
        frames: Array.from({ length: 960 }, (_, i) => ({
            timeMs: i * 25,
            rms: 0.5,
            novelty: 0.4,
            brightness: 0.1,
        })),
        onsets: Array.from({ length: 94 }, (_, i) => ({
            timeMs: 500 + i * 250,
            strength: i % 2 ? 0.4 : 0.8,
            brightness: 0.1,
        })),
    };
}
const positions = (analysis, level = 4) => {
    const path = createGeneratorCatchPath(analysis, { difficulty: level });
    return analysis.onsets.map((n) => path.place(n.timeMs));
};

test("repeated rhythmic phrases retain relative geometry with no bar-count-based regional destinations", () => {
    const analysis = song();
    const phrases = planGeneratorPhrases(analysis);
    const groups = new Map();
    for (const phrase of phrases) {
        assert.equal(phrase.section, 0);
        const shape = phrase.events.map(({ offset, accent }) => ({
            offset,
            accent,
        }));
        if (groups.has(phrase.signature))
            assert.deepEqual(shape, groups.get(phrase.signature));
        else groups.set(phrase.signature, shape);
    }
    const x = positions(analysis);
    assert.deepEqual(x.slice(6, 14), x.slice(14, 22));
    assert.ok(Math.max(...x) - Math.min(...x) < 150);
});

test("energy/timbre changes, not elapsed phrase counts, create section transitions", () => {
    const analysis = song();
    analysis.frames = analysis.frames.map((f) => ({
        ...f,
        rms: f.timeMs < 12000 ? 0.12 : 0.8,
        brightness: f.timeMs < 12000 ? 0.1 : 0.3,
    }));
    const phrases = planGeneratorPhrases(analysis);
    const before = phrases.filter((p) => p.start >= 2000 && p.start < 10000);
    const after = phrases.filter((p) => p.start >= 14000);
    assert.ok(before.every((p) => p.section === before[0].section));
    assert.ok(after[0].section > before[0].section);
    assert.ok(after[0].energy > before[0].energy * 3);
    const x = positions(analysis);
    const range = (values) => Math.max(...values) - Math.min(...values);
    assert.ok(range(x.slice(60, 80)) > range(x.slice(12, 32)) * 1.5);
});

test("shifting the same music in time preserves its gesture geometry", () => {
    const original = song(),
        shift = 137;
    const moved = {
        ...original,
        offsetMs: shift,
        durationMs: original.durationMs + shift,
        frames: original.frames.map((f) => ({
            ...f,
            timeMs: f.timeMs + shift,
        })),
        onsets: original.onsets.map((o) => ({
            ...o,
            timeMs: o.timeMs + shift,
        })),
    };
    assert.deepEqual(positions(moved), positions(original));
});

test("a sustained sound does not require horizontal slider travel or extra direction changes", () => {
    const analysis = { ...song(), onsets: [] };
    analysis.frames = analysis.frames.map((f) => ({ ...f, novelty: 0.01 }));
    const pack = buildGeneratedBeatmap(
        analysis,
        { mode: "catch", title: "Sustain", artist: "Test", difficulty: 4 },
        { extension: "wav", bytes: new Uint8Array([1]) },
    );
    const parsed = parseOsu(pack.osu);
    const sliders = parsed.hitObjects.filter((n) => n.type & 2);
    assert.ok(sliders.length > 0);
    const compiled = compileChart(parsed, "catch").notes.filter(
        (n) => n.type !== "banana",
    );
    assert.ok(compiled.every((n) => Math.abs(n.x - 256) < 0.01));
    assert.ok(
        sliders.every(
            (n) => n.length > 0 && n.curvePoints.some((p) => p.y !== 192),
        ),
    );
});

test("quantised duplicate transients do not generate zero-length subgestures", () => {
    const analysis = song();
    analysis.onsets = analysis.onsets.flatMap((o) => [
        o,
        { ...o, timeMs: o.timeMs + 10, strength: o.strength * 0.5 },
    ]);
    for (const phrase of planGeneratorPhrases(analysis)) {
        const times = phrase.events.map((o) => o.time);
        assert.equal(new Set(times).size, times.length);
        assert.ok(phrase.events.every((o) => Number.isFinite(o.offset)));
    }
});

test("quiet repeated material is not reinterpreted as regular cross-screen jumps at high levels", () => {
    const analysis = song();
    analysis.frames = analysis.frames.map((f) => ({ ...f, rms: 0.06 }));
    analysis.onsets = analysis.onsets.map((o) => ({ ...o, strength: 0.1 }));
    const x = positions(analysis, 100);
    const changes = x.slice(1).map((n, i) => Math.abs(n - x[i]));
    assert.ok(Math.max(...changes) < 180);
    assert.ok(Math.max(...x) - Math.min(...x) < 200);
});
