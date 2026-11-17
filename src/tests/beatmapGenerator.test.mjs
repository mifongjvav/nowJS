import assert from "node:assert/strict";
import { test } from "node:test";
import { inflateSync } from "node:zlib";
import { Buffer } from "node:buffer";
import {
    buildGeneratedBeatmap,
    createGeneratorNotes,
    GENERATOR_BLACK_PNG,
} from "../beatmapGenerator.ts";
import { parseOsu, compileChart } from "../osuParser.ts";
import { unzipSync, strFromU8 } from "../vendor/fflate.js";
import { generateBeatmapPack } from "../beatmapGeneratorClient.ts";
import { GENERATOR_MAX_AUDIO_BYTES } from "../generatorTypes.ts";

const analysis = {
    bpm: 120,
    estimatedBpm: true,
    confidence: 0.8,
    offsetMs: 0,
    durationMs: 8000,
    frames: Array.from({ length: 321 }, (_, i) => ({
        timeMs: i * 25,
        rms: 1,
        novelty: 0.5,
        brightness: 0.2,
    })),
    onsets: Array.from({ length: 64 }, (_, i) => ({
        timeMs: i * 125,
        strength: 0.5 + (i % 2) * 0.5,
        brightness: (i % 4) * 0.1,
    })),
};
const options = {
    mode: "catch",
    density: "normal",
    title: "Test track",
    artist: "Test artist",
};
const audio = {
    extension: "wav",
    bytes: new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]),
};

test("generated Catch and Mania OSZ archives round-trip through the real importer", () => {
    for (const mode of ["catch", "mania"]) {
        const pack = buildGeneratedBeatmap(
            analysis,
            { ...options, mode },
            audio,
        );
        const files = unzipSync(pack.bytes);
        assert.deepEqual(Object.keys(files).sort(), [
            "audio.wav",
            "background.png",
            "generated.osu",
        ]);
        assert.deepEqual(files["audio.wav"], audio.bytes);
        const parsed = parseOsu(strFromU8(files["generated.osu"]));
        assert.equal(parsed.general.audioFilename, "audio.wav");
        assert.equal(parsed.events.background, "background.png");
        assert.equal(parsed.general.mode, mode === "mania" ? 3 : 2);
        assert.equal(parsed.hitObjects.length, pack.noteCount);
        assert.equal(compileChart(parsed, mode).notes.length, pack.noteCount);
        assert.ok(
            parsed.hitObjects.every(
                (n, i, ns) =>
                    n.time >= 250 &&
                    n.time < 8000 &&
                    (!i || n.time > ns[i - 1].time),
            ),
        );
        if (mode === "mania")
            assert.ok(
                parsed.hitObjects.every((n) =>
                    [64, 192, 320, 448].includes(n.x),
                ),
            );
    }
});

test("missing backgrounds become an actual opaque black PNG", () => {
    const files = unzipSync(
        buildGeneratedBeatmap(analysis, options, audio).bytes,
    );
    assert.deepEqual(files["background.png"], GENERATOR_BLACK_PNG);
    const png = Buffer.from(files["background.png"]);
    assert.equal(png.readUInt32BE(16), 1);
    assert.equal(png.readUInt32BE(20), 1);
    assert.equal(png[25], 2);
    assert.deepEqual([...inflateSync(png.subarray(41, 53))], [0, 0, 0, 0]);
});

test("custom background bytes and manual BPM are kept in the package", () => {
    const background = GENERATOR_BLACK_PNG.slice();
    const pack = buildGeneratedBeatmap(
        { ...analysis, bpm: 96.5, estimatedBpm: false, offsetMs: 123 },
        options,
        audio,
        background,
    );
    const files = unzipSync(pack.bytes);
    assert.deepEqual(files["background.png"], background);
    const parsed = parseOsu(pack.osu);
    assert.equal(parsed.timingPoints[0].time, 123);
    assert.ok(
        Math.abs(60000 / parsed.timingPoints[0].beatLength - 96.5) < 0.00001,
    );
    assert.equal(pack.analysis.estimatedBpm, false);
});

test("generated patterns are deterministic, density-controlled and have playable Catch jumps", () => {
    const easy = createGeneratorNotes(analysis, {
        ...options,
        density: "easy",
    });
    const normal = createGeneratorNotes(analysis, options);
    const hard = createGeneratorNotes(analysis, {
        ...options,
        density: "hard",
    });
    assert.ok(easy.length < normal.length && normal.length < hard.length);
    assert.deepEqual(normal, createGeneratorNotes(analysis, options));
    for (let i = 1; i < normal.length; i++) {
        assert.ok(
            Math.abs(normal[i].x - normal[i - 1].x) <=
                (normal[i].time - normal[i - 1].time) * 0.3 + 1,
        );
    }
    assert.ok(normal.every((n) => n.x >= 32 && n.x <= 480));
});

test("sustained audio can use audible beat positions, but silence is never filled with notes", () => {
    assert.ok(
        createGeneratorNotes({ ...analysis, onsets: [] }, options).length > 0,
    );
    assert.throws(
        () =>
            createGeneratorNotes(
                {
                    ...analysis,
                    onsets: [],
                    frames: analysis.frames.map((f) => ({ ...f, rms: 0 })),
                },
                options,
            ),
        (e) => e.code === "noNotes",
    );
});

test("metadata cannot inject extra .osu sections or unsafe ZIP/download paths", () => {
    const pack = buildGeneratedBeatmap(
        analysis,
        {
            ...options,
            title: '../Bad\n[HitObjects]\r\n0,0,0,1,0:"\\title',
            artist: "Artist\r\nMode:3",
        },
        audio,
    );
    const parsed = parseOsu(pack.osu);
    assert.equal(parsed.general.mode, 2);
    assert.equal(parsed.hitObjects.length, pack.noteCount);
    assert.ok(!/[<>:"/\\|?*\r\n]/.test(pack.fileName));
    assert.ok(pack.fileName.endsWith(".osz"));
    assert.equal((pack.osu.match(/^\[HitObjects\]$/gm) || []).length, 1);
});

test("bad options and browser-side files fail before decoding or allocation", async () => {
    const fake = {
        name: "track.wav",
        size: 1,
        arrayBuffer() {
            throw Error("must not read");
        },
    };
    await assert.rejects(
        generateBeatmapPack(null, null, options),
        (e) => e.code === "audio",
    );
    await assert.rejects(
        generateBeatmapPack(
            { ...fake, size: GENERATOR_MAX_AUDIO_BYTES + 1 },
            null,
            options,
        ),
        (e) => e.code === "audioSize",
    );
    await assert.rejects(
        generateBeatmapPack(fake, { name: "bad.svg", size: 1 }, options),
        (e) => e.code === "image",
    );
    await assert.rejects(
        generateBeatmapPack(fake, null, { ...options, bpm: Infinity }),
        (e) => e.code === "bpm",
    );
    assert.throws(
        () =>
            buildGeneratedBeatmap(analysis, options, {
                ...audio,
                extension: "../mp3",
            }),
        (e) => e.code === "audio",
    );
    assert.throws(
        () => createGeneratorNotes({ ...analysis, bpm: 0 }, options),
        (e) => e.code === "bpm",
    );
    const abort = new AbortController();
    abort.abort();
    await assert.rejects(
        generateBeatmapPack(fake, null, options, abort.signal),
        (e) => e.name === "AbortError",
    );
});

test("Unicode titles and artists survive UTF-8 serialization and packing", () => {
    const pack = buildGeneratedBeatmap(
        analysis,
        {
            ...options,
            title: "测试曲目 🎵",
            artist: "测试曲师",
        },
        audio,
    );
    const parsed = parseOsu(strFromU8(unzipSync(pack.bytes)["generated.osu"]));
    assert.equal(parsed.metadata.titleUnicode, "测试曲目 🎵");
    assert.equal(parsed.metadata.artistUnicode, "测试曲师");
    assert.ok(pack.fileName.startsWith("测试曲目 🎵"));
});
