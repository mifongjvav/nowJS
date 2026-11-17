import assert from "node:assert/strict";
import { test } from "node:test";
import { getGeneratorComboStarts } from "../generatorCombos.ts";
import {
    createGeneratorObjects,
    serializeGeneratorObjects,
} from "../generatorObjects.ts";
import { createGeneratorNotes } from "../generatorPatterns.ts";
import { createLearnedCatchPath } from "../generatorLearnedMovement.ts";
import { getGeneratorDifficulty } from "../generatorDifficulty.ts";
import { parseOsu } from "../osuParser.ts";
import { buildGeneratedBeatmap } from "../beatmapGenerator.ts";

const analysis = {
    bpm: 120,
    offsetMs: 100,
    durationMs: 40000,
    estimatedBpm: false,
    confidence: 1,
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
    modelSeed: 1,
};
const objectsFor = (settings = options) =>
    createGeneratorObjects(
        analysis,
        settings,
        createGeneratorNotes(analysis, settings),
    );
const splitCombos = (objects) => {
    const groups = [];
    getGeneratorComboStarts(objects, analysis).forEach((start, i) => {
        if (objects[i].kind === "bananaShower") return;
        if (start) groups.push([]);
        groups.at(-1).push(objects[i]);
    });
    return groups;
};
const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;

test("layout groups and exported colour flags share exact boundaries including slider crossings and showers", () => {
    const objects = [
        { kind: "circle", time: 100, x: 256 },
        {
            kind: "slider",
            time: 1900,
            endTime: 2300,
            length: 100,
            slides: 1,
            x: 256,
            endX: 270,
        },
        { kind: "circle", time: 2400, x: 270 },
        { kind: "bananaShower", time: 2500, endTime: 2700, x: 256 },
        { kind: "circle", time: 2800, x: 256 },
        { kind: "circle", time: 2900, x: 256 },
        { kind: "circle", time: 4100, x: 256 },
    ];
    const starts = getGeneratorComboStarts(objects, analysis);
    assert.deepEqual(starts, [true, false, true, false, true, false, true]);
    const lines = serializeGeneratorObjects(objects, analysis);
    assert.deepEqual(
        lines.map((l) => Boolean(Number(l.split(",")[3]) & 4)),
        starts,
    );
});

test("neural colour groups stay locally coherent and shift farther on colour changes than inside a group", () => {
    for (const modelSeed of [1, 2, 3]) {
        const objects = objectsFor({ ...options, modelSeed });
        const groups = splitCombos(objects);
        const transitions = [],
            inside = [];
        for (const [i, object] of objects.entries()) {
            if (!i) continue;
            const distance = Math.abs(
                object.x - (objects[i - 1].endX ?? objects[i - 1].x),
            );
            if (getGeneratorComboStarts(objects, analysis)[i])
                transitions.push(distance);
            else inside.push(distance);
        }
        assert.ok(mean(transitions) > mean(inside) * 1.5);
        const centers = groups.map((g) => mean(g.map((o) => o.x)));
        assert.ok(
            mean(centers.slice(1).map((x, i) => Math.abs(x - centers[i]))) > 50,
        );
        for (const group of groups) {
            const head = group[0].x;
            assert.ok(group.every((o) => Math.abs(o.x - head) <= 60));
            assert.ok(
                group.every(
                    (o) =>
                        o.endX === undefined || Math.abs(o.endX - head) <= 60,
                ),
            );
        }
    }
});

test("combo region changes never override short-gap reach, slider length or shower reset", () => {
    for (const difficulty of [1, 4, 16, 100]) {
        const path = createLearnedCatchPath(analysis, {
            ...options,
            difficulty,
        });
        path.beginCombo(100);
        let x = path.place(100);
        for (let i = 1; i < 40; i++) {
            const time = 100 + i * 30;
            path.beginCombo(time);
            const next = path.place(time);
            assert.ok(
                Math.abs(next - x) <=
                    30 * getGeneratorDifficulty({ difficulty }).spacing,
            );
            x = path.extend(5.2, time + 10);
            assert.ok(Math.abs(x - next) <= 5.2);
        }
        path.afterShower(10000);
        path.beginCombo(10000);
        assert.equal(path.place(10000), 256);
        assert.ok(Math.abs(path.extend(50, 10500) - 256) <= 50);
    }
});

test("combo composition preserves note times, types, lengths, colour flags and reproducibility", () => {
    const make = (settings) =>
        parseOsu(
            buildGeneratedBeatmap(analysis, settings, {
                extension: "wav",
                bytes: new Uint8Array([1]),
            }).osu,
        );
    const learned = make(options),
        rule = make({ ...options, movementModel: "phrases" });
    const rhythm = (map) =>
        map.hitObjects.map((o) => [o.time, o.type, o.length, o.endTime]);
    assert.deepEqual(rhythm(learned), rhythm(rule));
    assert.deepEqual(learned, make(options));
    assert.notDeepEqual(
        learned.hitObjects.map((o) => o.x),
        make({ ...options, modelSeed: 2 }).hitObjects.map((o) => o.x),
    );
});
