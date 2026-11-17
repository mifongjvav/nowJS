import assert from "node:assert/strict";
import { test } from "node:test";
import {
    extractGeneratorComboColors,
    GENERATOR_DEFAULT_COLORS,
    normalizeGeneratorComboColors,
} from "../generatorColors.ts";
import {
    buildGeneratedBeatmap,
    createGeneratorNotes,
} from "../beatmapGenerator.ts";
import { createGeneratorObjects } from "../generatorObjects.ts";
import { parseOsu, compileChart } from "../osuParser.ts";
import { analyzeGeneratorAudio } from "../beatmapAnalysis.ts";

const options = {
    mode: "catch",
    density: "normal",
    title: "Sustained",
    artist: "Test",
};
const audio = { extension: "wav", bytes: new Uint8Array([1, 2, 3]) };
function sustained(bpm = 120) {
    return {
        bpm,
        offsetMs: 0,
        durationMs: 20000,
        estimatedBpm: false,
        confidence: 1,
        frames: Array.from({ length: 801 }, (_, i) => ({
            timeMs: i * 25,
            rms: 0.7,
            novelty: 0.01,
            brightness: 0.15,
        })),
        onsets: Array.from(
            { length: Math.floor(20000 / (60000 / bpm)) },
            (_, i) => ({
                timeMs: (i * 60000) / bpm,
                strength: 0.2,
                brightness: 0.15,
            }),
        ),
    };
}

test("background extraction preserves dominant hues while producing four readable distinct colors", () => {
    const blue = extractGeneratorComboColors(new Uint8Array([0, 0, 255, 255]));
    const red = extractGeneratorComboColors(new Uint8Array([255, 0, 0, 255]));
    assert.equal(blue.length, 4);
    assert.equal(new Set(blue).size, 4);
    assert.notDeepEqual(blue, red);
    assert.ok((blue[0] & 255) > ((blue[0] >> 16) & 255));
    assert.ok(((red[0] >> 16) & 255) > (red[0] & 255));
    for (const color of [...blue, ...red]) {
        const luma =
            ((color >> 16) & 255) * 0.299 +
            ((color >> 8) & 255) * 0.587 +
            (color & 255) * 0.114;
        assert.ok(luma > 80);
    }
});

test("black, grayscale and transparent images use the high-contrast fallback palette", () => {
    for (const pixel of [
        [0, 0, 0, 255],
        [220, 220, 220, 255],
        [255, 0, 0, 0],
    ]) {
        assert.deepEqual(extractGeneratorComboColors(pixel), [
            ...GENERATOR_DEFAULT_COLORS,
        ]);
    }
    assert.deepEqual(normalizeGeneratorComboColors([NaN, -1, 0x1000000]), [
        ...GENERATOR_DEFAULT_COLORS,
    ]);
});

test("exported combo colors actually cycle in Catch and map to Mania lanes", () => {
    const analysis = sustained();
    analysis.frames = analysis.frames.map((f) => ({ ...f, novelty: 0.5 }));
    const colors = [0xff8899, 0x88ddff, 0xaaff99, 0xddbbff];
    for (const mode of ["catch", "mania"]) {
        const pack = buildGeneratedBeatmap(
            analysis,
            { ...options, mode },
            audio,
            undefined,
            colors,
        );
        const raw = parseOsu(pack.osu),
            compiled = compileChart(raw, mode);
        assert.deepEqual(raw.colours, colors);
        assert.deepEqual(pack.comboColors, colors);
        assert.ok(raw.hitObjects.filter((n) => n.type & 4).length > 1);
        if (mode === "catch")
            assert.ok(new Set(compiled.notes.map((n) => n.color)).size > 1);
        else assert.ok(compiled.notes.every((n) => n.color === colors[n.lane]));
    }
});

test("sustained Catch sections export real sliders and spinners that import as streams and bananas", () => {
    const analysis = sustained();
    const pack = buildGeneratedBeatmap(analysis, options, audio);
    const raw = parseOsu(pack.osu),
        compiled = compileChart(raw, "catch");
    const sliders = raw.hitObjects.filter((n) => n.type & 2),
        showers = raw.hitObjects.filter((n) => n.type & 8);
    assert.ok(sliders.length > 0 && showers.length > 0);
    assert.equal(pack.objectCounts.sliders, sliders.length);
    assert.equal(pack.objectCounts.bananaShowers, showers.length);
    assert.equal(pack.objectCounts.holds, 0);
    assert.ok(compiled.notes.some((n) => n.type === "droplet"));
    assert.ok(compiled.notes.some((n) => n.type === "banana"));
    assert.ok(
        compiled.notes
            .filter((n) => n.type !== "banana")
            .every((n) => pack.comboColors.includes(n.color)),
    );
    assert.equal(
        Object.values(pack.objectCounts).reduce((a, b) => a + b, 0),
        pack.noteCount,
    );
    const velocity = raw.timingPoints.find(
        (n) => !n.uninherited,
    ).sliderVelocity;
    for (const slider of sliders) {
        const duration =
            (slider.length / (140 * velocity)) * 500 * slider.slides;
        assert.ok(Math.abs(duration - slider.slides * 500) < 1);
        assert.ok(slider.length / 500 <= 0.3);
        assert.ok(slider.time + duration <= analysis.durationMs - 99);
        assert.ok(
            showers.every(
                (s) =>
                    slider.time + duration < s.time || slider.time > s.endTime,
            ),
        );
    }
});

test("native 4K sustained sections use endTime:hitSample holds, never Catch spinners", () => {
    const pack = buildGeneratedBeatmap(
        sustained(),
        { ...options, mode: "mania" },
        audio,
    );
    const raw = parseOsu(pack.osu),
        compiled = compileChart(raw, "mania");
    const holds = raw.hitObjects.filter((n) => n.type & 128);
    assert.ok(holds.length > 0);
    assert.equal(pack.objectCounts.holds, holds.length);
    assert.equal(pack.objectCounts.sliders, 0);
    assert.equal(pack.objectCounts.bananaShowers, 0);
    assert.ok(!raw.hitObjects.some((n) => n.type & (2 | 8)));
    assert.equal(
        compiled.notes.filter((n) => n.holdEndTime).length,
        holds.length,
    );
    for (const hold of holds) {
        assert.ok(hold.endTime > hold.time && hold.endTime <= 19900);
        assert.ok(
            !raw.hitObjects.some(
                (n) =>
                    n !== hold && n.time > hold.time && n.time <= hold.endTime,
            ),
        );
    }
});

test("brief drum tails and silence are not mistaken for sustained special objects", () => {
    const analysis = sustained();
    analysis.frames = analysis.frames.map((f) => ({
        ...f,
        rms: f.timeMs % 500 < 100 ? 1 : 0,
        novelty: f.timeMs % 500 < 25 ? 1 : 0,
    }));
    analysis.onsets = analysis.onsets.map((o) => ({ ...o, strength: 1 }));
    for (const mode of ["catch", "mania"]) {
        const pack = buildGeneratedBeatmap(
            analysis,
            { ...options, mode },
            audio,
        );
        assert.ok(pack.objectCounts.circles > 0);
        assert.equal(
            pack.objectCounts.holds +
                pack.objectCounts.sliders +
                pack.objectCounts.bananaShowers,
            0,
        );
    }
});

test("Catch positioning remains reachable after slider tails and banana showers, even at high BPM", () => {
    const analysis = sustained(300);
    const objects = createGeneratorObjects(
        analysis,
        options,
        createGeneratorNotes(analysis, options),
    );
    let lastX = 256,
        lastTime = -Infinity,
        afterRain = false;
    for (const object of objects) {
        if (object.kind === "bananaShower") {
            afterRain = true;
            lastX = 256;
            lastTime = object.endTime;
            continue;
        }
        if (afterRain) {
            assert.equal(object.x, 256);
            assert.ok(object.time - lastTime >= 500);
        } else
            assert.ok(
                Math.abs(object.x - lastX) <=
                    (object.time - lastTime) * 0.3 + 1,
            );
        afterRain = false;
        assert.ok(object.x >= 32 && object.x <= 480);
        lastX =
            object.kind === "slider" && object.slides % 2
                ? object.x + (object.x > 256 ? -1 : 1) * object.length
                : object.x;
        lastTime = object.kind === "circle" ? object.time : object.endTime;
    }
});

test("real Meyda analysis of sustained audio produces long objects rather than tap-only drafts", async () => {
    const rate = 22050;
    const samples = Float32Array.from(
        { length: rate * 12 },
        (_, i) => 0.25 * Math.sin((2 * Math.PI * 440 * i) / rate),
    );
    const analysis = await analyzeGeneratorAudio(samples, rate, { bpm: 120 });
    const catchPack = buildGeneratedBeatmap(analysis, options, audio);
    const maniaPack = buildGeneratedBeatmap(
        analysis,
        { ...options, mode: "mania" },
        audio,
    );
    assert.ok(catchPack.objectCounts.sliders > 0);
    assert.ok(catchPack.objectCounts.bananaShowers > 0);
    assert.ok(maniaPack.objectCounts.holds > 0);
});
