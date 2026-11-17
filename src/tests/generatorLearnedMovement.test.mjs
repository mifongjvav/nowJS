import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { movementFeatures } from "../generatorLearnedFeatures.ts";
import {
    movementProbabilities,
    createLearnedCatchPath,
} from "../generatorLearnedMovement.ts";
import { createGeneratorCatchPath } from "../generatorCatchPath.ts";
import { buildGeneratedBeatmap } from "../beatmapGenerator.ts";
import { generateBeatmapPack } from "../beatmapGeneratorClient.ts";
import { parseOsu, compileChart } from "../osuParser.ts";
import {
    serializeGeneratorConfig,
    parseGeneratorConfig,
} from "../generatorConfig.ts";
import { getGeneratorDifficulty } from "../generatorDifficulty.ts";

const analysis = {
    bpm: 120,
    offsetMs: 100,
    durationMs: 40000,
    confidence: 1,
    estimatedBpm: false,
    frames: Array.from({ length: 1600 }, (_, i) => ({
        timeMs: i * 25,
        rms: 0.6,
        novelty: 0.4,
        brightness: 0.1,
    })),
    onsets: Array.from({ length: 150 }, (_, i) => ({
        timeMs: 600 + i * 250,
        strength: i % 2 ? 0.3 : 0.9,
        brightness: 0.1,
    })),
};
const options = {
    mode: "catch",
    title: "Test",
    artist: "Test",
    difficulty: 4,
    movementModel: "learned",
    modelSeed: 12,
};
const positions = (seed, difficulty = 4) => {
    const path = createGeneratorCatchPath(analysis, {
        ...options,
        modelSeed: seed,
        difficulty,
    });
    return analysis.onsets.map((o) => path.place(o.timeMs));
};

test("browser MLP matches independent NumPy inference and has normalized, history-dependent probabilities", async () => {
    const report = JSON.parse(
        await readFile(
            new URL("../tools/movementTrainingReport.json", import.meta.url),
            "utf8",
        ),
    );
    const { features, probabilities } = report.inferenceFixture;
    const actual = movementProbabilities(features);
    actual.forEach((p, i) => assert.ok(Math.abs(p - probabilities[i]) < 1e-5));
    assert.ok(Math.abs(actual.reduce((a, b) => a + b, 0) - 1) < 1e-10);
    const a = movementFeatures(256, 0.5, 0.5, 0, 0.5, [
        { dx: 100, beats: 0.5 },
    ]);
    const b = movementFeatures(256, 0.5, 0.5, 0, 0.5, [
        { dx: -100, beats: 0.5 },
    ]);
    assert.notDeepEqual(movementProbabilities(a), movementProbabilities(b));
    assert.throws(() => movementProbabilities([NaN]));
});

test("learned motion is seed-reproducible, seed-variable and respects field and level reach", () => {
    assert.deepEqual(positions(0), positions(0));
    assert.notDeepEqual(positions(1), positions(2));
    for (const difficulty of [1, 4, 16, 100]) {
        const x = positions(7, difficulty);
        assert.ok(x.every((n) => n >= 32 && n <= 480));
        const reach = getGeneratorDifficulty({ difficulty }).spacing * 250;
        assert.ok(x.slice(1).every((n, i) => Math.abs(n - x[i]) <= reach));
    }
});

test("learned slider tails never exceed the actual path length, and showers reset history", () => {
    const path = createLearnedCatchPath(analysis, options);
    let x = path.place(600);
    for (let i = 1; i < 30; i++) {
        const next = path.extend(12.2, 600 + i * 250);
        assert.ok(Math.abs(next - x) <= 12.2);
        x = next;
    }
    path.afterShower(10000);
    assert.equal(path.place(10000), 256);
    assert.equal(path.place(9900), 256);
});

test("the experiment changes layout, not selected rhythms or 4K, and preserves the rule-based fallback", () => {
    const make = (settings) =>
        buildGeneratedBeatmap(analysis, settings, {
            extension: "wav",
            bytes: new Uint8Array([1]),
        });
    const learned = parseOsu(make(options).osu);
    const original = parseOsu(
        make({ ...options, movementModel: "phrases" }).osu,
    );
    assert.deepEqual(
        learned.hitObjects.map((o) => [o.time, o.type, o.length]),
        original.hitObjects.map((o) => [o.time, o.type, o.length]),
    );
    assert.ok(
        learned.hitObjects.some((o, i) => o.x !== original.hitObjects[i].x),
    );
    const a = make({ ...options, mode: "mania" });
    const b = make({ ...options, mode: "mania", movementModel: "phrases" });
    assert.equal(a.osu, b.osu);
    assert.equal(
        make({ ...options, movementModel: undefined }).osu,
        make({ ...options, movementModel: "phrases" }).osu,
    );
    const compiled = compileChart(learned, "catch");
    assert.ok(
        compiled.notes.every(
            (n) => Number.isFinite(n.x) && Number.isFinite(n.time),
        ),
    );
});

test("optional model/seed config survives save/load without breaking older configs", async () => {
    const input = {
        title: "Test",
        artist: "Test",
        bpm: "120",
        mode: "catch",
        density: "normal",
        difficulty: 4,
        movementModel: "learned",
        modelSeed: 0xffffffff,
    };
    const file = new File([new Uint8Array([1])], "audio.wav");
    const json = await serializeGeneratorConfig(input, file, null);
    assert.deepEqual((await parseGeneratorConfig(json)).inputs, input);
    for (const patch of [
        { modelSeed: -1 },
        { modelSeed: 1.5 },
        { modelSeed: 2 ** 32 },
        { movementModel: "unknown" },
    ]) {
        const config = JSON.parse(json);
        Object.assign(config.inputs, patch);
        await assert.rejects(
            parseGeneratorConfig(JSON.stringify(config)),
            (e) => e.code === "config",
        );
        await assert.rejects(
            generateBeatmapPack(null, null, { ...options, ...patch }),
            (e) => e.code === "config",
        );
    }
});

test("training report isolates songs and map hashes across splits; held-out prediction beats marginal sampling", async () => {
    const report = JSON.parse(
        await readFile(
            new URL("../tools/movementTrainingReport.json", import.meta.url),
            "utf8",
        ),
    );
    const ids = new Set(),
        hashes = new Set();
    for (const members of Object.values(report.splits))
        for (const song of members) {
            assert.ok(!ids.has(song.id));
            ids.add(song.id);
            for (const map of song.maps) {
                assert.ok(!hashes.has(map.hash));
                hashes.add(map.hash);
            }
        }
    assert.equal(ids.size, 15);
    assert.equal(hashes.size, 84);
    assert.equal(report.corpus.nativeCatch, 0);
    assert.ok(report.metrics.test.nll < report.metrics.test.unconditionalNll);
});
