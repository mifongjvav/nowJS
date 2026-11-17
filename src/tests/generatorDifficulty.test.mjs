import assert from "node:assert/strict";
import { test } from "node:test";
import { getGeneratorDifficulty } from "../generatorDifficulty.ts";
import {
    createGeneratorNotes,
    buildGeneratedBeatmap,
} from "../beatmapGenerator.ts";
import { createGeneratorObjects } from "../generatorObjects.ts";
import { parseOsu } from "../osuParser.ts";

const analysis = {
    bpm: 120,
    offsetMs: 100,
    durationMs: 20000,
    estimatedBpm: false,
    confidence: 1,
    frames: Array.from({ length: 800 }, (_, i) => ({
        timeMs: i * 25,
        rms: 0.7,
        novelty: 0.02,
        brightness: 0.1,
    })),
    onsets: Array.from({ length: 150 }, (_, i) => ({
        timeMs: 600 + i * 125 + (i % 3 === 0 ? 30 : 0),
        strength: i % 4 === 0 ? 0.9 : 0.35,
        brightness: 0.1,
    })),
};
const options = {
    mode: "catch",
    title: "Review",
    artist: "Test",
    difficulty: 1,
};

test("default difficulty is Easy 1, fractional and very large finite levels are accepted", () => {
    assert.equal(getGeneratorDifficulty({}).level, 1);
    assert.equal(getGeneratorDifficulty({}).name, "Easy");
    for (const difficulty of [1, 1.25, 4, 20, 1000, 1e100, Number.MAX_VALUE]) {
        const profile = getGeneratorDifficulty({ difficulty });
        assert.equal(profile.level, difficulty);
        for (const key of [
            "spacing",
            "circleSize",
            "approachRate",
            "hp",
            "divisions",
        ])
            assert.ok(Number.isFinite(profile[key]));
        const notes = createGeneratorNotes(analysis, {
            ...options,
            difficulty,
        });
        assert.ok(notes.length > 0 && notes.length <= analysis.onsets.length);
        assert.ok(
            notes.every(
                (n) => Number.isInteger(n.time) && n.x >= 32 && n.x <= 480,
            ),
        );
    }
});

test("invalid levels fail before browser media are decoded", () => {
    for (const difficulty of [0, -1, NaN, Infinity, -Infinity, "2", null]) {
        if (difficulty === null) continue; // omitted/nullish API input uses default
        assert.throws(
            () => getGeneratorDifficulty({ difficulty }),
            (e) => e.code === "difficulty",
        );
    }
});

test("higher rhythm grids retain easy accents rather than tightening their timing window", () => {
    const easy = createGeneratorNotes(analysis, options);
    for (const difficulty of [2, 4, 8, 16, 100]) {
        const times = new Set(
            createGeneratorNotes(analysis, { ...options, difficulty }).map(
                (n) => n.time,
            ),
        );
        assert.ok(easy.every((n) => times.has(n.time)));
    }
    assert.deepEqual(easy, createGeneratorNotes(analysis, options));
});

test("Easy uses walkable phrases and avoids repeated edge clamping", () => {
    const notes = createGeneratorNotes(analysis, options);
    for (let i = 1; i < notes.length; i++) {
        assert.ok(
            Math.abs(notes[i].x - notes[i - 1].x) <=
                (notes[i].time - notes[i - 1].time) * 0.12 + 1,
        );
        assert.ok(notes[i].time - notes[i - 1].time >= 499);
    }
    assert.ok(!notes.some((n) => n.x === 32 || n.x === 480));
    const harder = getGeneratorDifficulty({ difficulty: 4 });
    assert.ok(harder.circleSize > getGeneratorDifficulty(options).circleSize);
    assert.ok(
        harder.approachRate > getGeneratorDifficulty(options).approachRate,
    );
});

test("native difficulty metadata follows the level and Catch keeps OD equal to AR", () => {
    for (const difficulty of [1, 2.5, 20]) {
        const pack = buildGeneratedBeatmap(
            analysis,
            { ...options, difficulty },
            { extension: "wav", bytes: new Uint8Array([1]) },
        );
        const raw = parseOsu(pack.osu);
        assert.ok(raw.metadata.version.includes(`Lv.${difficulty}`));
        assert.equal(
            raw.difficulty.overallDifficulty,
            raw.difficulty.approachRate,
        );
        assert.ok(pack.fileName.includes(`Lv.${difficulty}`));
    }
});

test("Mania permits other lanes during holds without same-lane overlaps or duplicate chords", () => {
    const settings = { ...options, mode: "mania", difficulty: 4 };
    const objects = createGeneratorObjects(
        analysis,
        settings,
        createGeneratorNotes(analysis, settings),
    );
    const ends = [-Infinity, -Infinity, -Infinity, -Infinity];
    for (const object of objects) {
        const lane = Math.floor(object.x / 128);
        assert.ok(
            object.time > ends[lane],
            `overlap on lane ${lane} at ${object.time}`,
        );
        ends[lane] = object.kind === "hold" ? object.endTime : object.time;
    }
    assert.ok(objects.some((n, i) => i && n.time === objects[i - 1].time));
});

test("a weak transient cannot let a slider swallow a later strong accent", () => {
    const input = {
        ...analysis,
        onsets: [
            { timeMs: 1100, strength: 0.9, brightness: 0.1 },
            { timeMs: 1350, strength: 0.2, brightness: 0.1 },
            { timeMs: 1600, strength: 1, brightness: 0.1 },
            { timeMs: 2100, strength: 0.8, brightness: 0.1 },
        ],
    };
    const settings = { ...options, difficulty: 2 };
    const objects = createGeneratorObjects(
        input,
        settings,
        createGeneratorNotes(input, settings),
    );
    assert.ok(objects.some((n) => n.time === 1600 || n.endTime === 1600));
    assert.ok(
        !objects.some(
            (n) => n.kind === "slider" && n.time < 1600 && n.endTime > 1600,
        ),
    );
});
