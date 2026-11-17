import assert from "node:assert/strict";
import { test } from "node:test";
import { getGeneratorFormMovement } from "../generatorFormDefaults.ts";
import { createGeneratorNotes } from "../generatorPatterns.ts";
import { createGeneratorObjects } from "../generatorObjects.ts";
import {
    serializeGeneratorConfig,
    parseGeneratorConfig,
} from "../generatorConfig.ts";

const analysis = {
    bpm: 120,
    offsetMs: 100,
    durationMs: 20000,
    estimatedBpm: false,
    confidence: 1,
    frames: Array.from({ length: 800 }, (_, i) => ({
        timeMs: i * 25,
        rms: 0.6,
        novelty: 0.02,
        brightness: 0.1,
    })),
    onsets: Array.from({ length: 150 }, (_, i) => ({
        timeMs: 600 + i * 125,
        strength: i % 4 ? 0.3 : 0.9,
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

test("fresh forms recommend the new layout while restored pre-model forms keep legacy rules", () => {
    assert.deepEqual(getGeneratorFormMovement(), {
        movementModel: "learned",
        modelSeed: 1,
    });
    assert.deepEqual(getGeneratorFormMovement({}), {
        movementModel: "phrases",
        modelSeed: 1,
    });
    assert.deepEqual(
        getGeneratorFormMovement({ movementModel: "learned", modelSeed: 0 }),
        { movementModel: "learned", modelSeed: 0 },
    );
    assert.deepEqual(
        getGeneratorFormMovement({
            movementModel: "phrases",
            modelSeed: 4294967295,
        }),
        { movementModel: "phrases", modelSeed: 4294967295 },
    );
});

test("export/import retains the fresh recommended selection and never silently upgrades legacy configurations", async () => {
    const file = new File([new Uint8Array([1])], "audio.wav");
    const input = {
        title: "Test",
        artist: "Test",
        bpm: "120",
        mode: "catch",
        density: "normal",
        difficulty: 4,
    };
    for (const movement of [
        getGeneratorFormMovement(),
        { movementModel: "phrases", modelSeed: 0 },
        {},
    ]) {
        const restored = await parseGeneratorConfig(
            await serializeGeneratorConfig(
                { ...input, ...movement },
                file,
                null,
            ),
        );
        assert.deepEqual(
            getGeneratorFormMovement(restored.inputs),
            "movementModel" in movement
                ? movement
                : { movementModel: "phrases", modelSeed: 1 },
        );
    }
    const v1 = JSON.parse(await serializeGeneratorConfig(input, file, null));
    v1.version = 1;
    delete v1.inputs.difficulty;
    assert.equal(
        getGeneratorFormMovement(
            (await parseGeneratorConfig(JSON.stringify(v1))).inputs,
        ).movementModel,
        "phrases",
    );
});

test("deferring the discarded Catch pass preserves every final object across models, modes and levels", () => {
    for (const mode of ["catch", "mania"])
        for (const movementModel of ["learned", "phrases"])
            for (const difficulty of [1, 4, 16, 100]) {
                const settings = {
                    ...options,
                    mode,
                    movementModel,
                    difficulty,
                };
                const original = createGeneratorNotes(analysis, settings);
                const deferred = createGeneratorNotes(analysis, settings, {
                    deferCatchLayout: true,
                });
                const rhythm = (notes) =>
                    notes.map(({ time, strength, brightness }) => ({
                        time,
                        strength,
                        brightness,
                    }));
                assert.deepEqual(rhythm(original), rhythm(deferred));
                assert.deepEqual(
                    createGeneratorObjects(analysis, settings, deferred),
                    createGeneratorObjects(analysis, settings, original),
                );
                if (mode === "mania") assert.deepEqual(deferred, original);
            }
});

test("deferred layout also preserves tonal fallback sliders and banana-shower transitions", () => {
    const input = {
        ...analysis,
        onsets: [],
        frames: analysis.frames.map((f) => ({ ...f, novelty: 0.01 })),
    };
    const make = (deferCatchLayout) =>
        createGeneratorObjects(
            input,
            options,
            createGeneratorNotes(input, options, { deferCatchLayout }),
        );
    const objects = make(false);
    assert.ok(objects.some((o) => o.kind === "bananaShower"));
    assert.deepEqual(make(true), objects);
});
