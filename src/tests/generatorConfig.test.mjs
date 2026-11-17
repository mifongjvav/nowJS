import assert from "node:assert/strict";
import { test } from "node:test";
import { Buffer } from "node:buffer";
import {
    serializeGeneratorConfig,
    parseGeneratorConfig,
    readGeneratorConfigFile,
    generatorConfigFileName,
    GENERATOR_MAX_CONFIG_BYTES,
} from "../generatorConfig.ts";
import { GENERATOR_MAX_AUDIO_BYTES } from "../generatorTypes.ts";

const inputs = {
    title: "  中文标题 🎵  ",
    artist: "Artist <test>",
    bpm: "120.00",
    mode: "mania",
    density: "hard",
};
const source = new Uint8Array(260003);
for (let i = 0; i < source.length; i++) source[i] = (i * 37) % 256;
const audio = new File([source], "节奏测试.wav", {
    type: "audio/wav",
    lastModified: 123456789,
});
const pictureBytes = new Uint8Array([137, 80, 78, 71, 0, 255, 127, 128, 1]);
const background = new File([pictureBytes], "原始背景.webp", {
    type: "image/webp",
    lastModified: 987654321,
});
const sample = async () =>
    JSON.parse(await serializeGeneratorConfig(inputs, audio, background));

test("versioned JSON preserves every form value and the exact original Base64 media", async () => {
    const json = await serializeGeneratorConfig(inputs, audio, background);
    const config = JSON.parse(json);
    assert.equal(config.format, "nowjs-beatmap-generator");
    assert.equal(config.version, 1);
    assert.ok(Number.isFinite(Date.parse(config.createdAt)));
    assert.deepEqual(config.inputs, inputs);
    assert.equal(config.audio.encoding, "base64");
    assert.equal(config.audio.base64, Buffer.from(source).toString("base64"));
    assert.equal(
        config.background.base64,
        Buffer.from(pictureBytes).toString("base64"),
    );
    const loaded = await parseGeneratorConfig(json);
    assert.deepEqual(loaded.inputs, inputs);
    assert.deepEqual(new Uint8Array(await loaded.audio.arrayBuffer()), source);
    assert.deepEqual(
        new Uint8Array(await loaded.background.arrayBuffer()),
        pictureBytes,
    );
    for (const file of ["audio", "background"]) {
        assert.equal(loaded[file].name, config[file].name);
        assert.equal(loaded[file].type, config[file].type);
        assert.equal(loaded[file].lastModified, config[file].lastModified);
        assert.equal(loaded[file].size, config[file].size);
    }
});

test("blank BPM, empty metadata and no background remain explicit rather than becoming guessed values", async () => {
    const fields = {
        title: "",
        artist: "",
        bpm: "",
        mode: "catch",
        density: "easy",
    };
    const json = await serializeGeneratorConfig(fields, audio, null);
    assert.equal(JSON.parse(json).background, null);
    const loaded = await parseGeneratorConfig(json);
    assert.deepEqual(loaded.inputs, fields);
    assert.equal(loaded.background, null);
});

test("the same saved configuration can be restored and re-exported repeatedly without changing inputs", async () => {
    const json = await serializeGeneratorConfig(inputs, audio, background);
    for (let i = 0; i < 3; i++) {
        const loaded = await parseGeneratorConfig(json);
        const next = JSON.parse(
            await serializeGeneratorConfig(
                loaded.inputs,
                loaded.audio,
                loaded.background,
            ),
        );
        const first = JSON.parse(json);
        assert.deepEqual(next.inputs, first.inputs);
        assert.deepEqual(next.audio, first.audio);
        assert.deepEqual(next.background, first.background);
    }
});

test("unsupported versions, invalid parameters and unsafe file names are rejected", async () => {
    for (const mutate of [
        (c) => {
            c.version = 99;
        },
        (c) => {
            c.format = "other";
        },
        (c) => {
            c.inputs.mode = "invalid";
        },
        (c) => {
            c.inputs.density = "invalid";
        },
        (c) => {
            c.inputs.bpm = "NaN";
        },
        (c) => {
            c.inputs.bpm = "120.";
        },
        (c) => {
            c.inputs.title = "a\nb";
        },
        (c) => {
            c.audio.name = "../../track.wav";
        },
        (c) => {
            c.audio.encoding = "base64url";
        },
        (c) => {
            delete c.background;
        },
    ]) {
        const config = await sample();
        mutate(config);
        await assert.rejects(
            parseGeneratorConfig(JSON.stringify(config)),
            (e) => e.code === "config",
        );
    }
    await assert.rejects(
        parseGeneratorConfig("{not JSON"),
        (e) => e.code === "config",
    );
});

test("malformed, truncated, non-canonical or size-mismatched Base64 fails validation", async () => {
    for (const mutate of [
        (c) => {
            c.audio.size++;
        },
        (c) => {
            c.audio.base64 = c.audio.base64.slice(0, -1);
        },
        (c) => {
            c.audio.base64 = "?" + c.audio.base64.slice(1);
        },
        (c) => {
            c.background.base64 = "invalid";
        },
    ]) {
        const config = await sample();
        mutate(config);
        await assert.rejects(
            parseGeneratorConfig(JSON.stringify(config)),
            (e) => e.code === "config",
        );
    }
    const one = new File(["f"], "one.mp3", { lastModified: 1 });
    const config = JSON.parse(
        await serializeGeneratorConfig(inputs, one, null),
    );
    config.audio.base64 = "Zh=="; // "f" with illegal nonzero padding bits.
    await assert.rejects(
        parseGeneratorConfig(JSON.stringify(config)),
        (e) => e.code === "config",
    );
});

test("size limits are checked before reading a huge JSON file or decoding declared media", async () => {
    await assert.rejects(
        readGeneratorConfigFile({
            size: GENERATOR_MAX_CONFIG_BYTES + 1,
            text() {
                throw Error("must not read");
            },
        }),
        (e) => e.code === "configSize",
    );
    const config = await sample();
    config.audio.size = GENERATOR_MAX_AUDIO_BYTES + 1;
    await assert.rejects(
        parseGeneratorConfig(JSON.stringify(config)),
        (e) => e.code === "configSize",
    );
    await assert.rejects(
        serializeGeneratorConfig(inputs, null, null),
        (e) => e.code === "audio",
    );
});

test("cancellation aborts Base64 export and restore without returning partial media", async () => {
    const large = new File([new Uint8Array(2 * 1024 * 1024)], "large.wav", {
        lastModified: 1,
    });
    const exportAbort = new AbortController();
    await assert.rejects(
        serializeGeneratorConfig(inputs, large, null, {
            signal: exportAbort.signal,
            progress: (p) => {
                if (p > 0) exportAbort.abort();
            },
        }),
        (e) => e.name === "AbortError",
    );
    const json = await serializeGeneratorConfig(inputs, large, null);
    const importAbort = new AbortController();
    await assert.rejects(
        parseGeneratorConfig(json, {
            signal: importAbort.signal,
            progress: (p) => {
                if (p > 0) importAbort.abort();
            },
        }),
        (e) => e.name === "AbortError",
    );
});

test("JSON extensions, Unicode and unknown keys do not become paths, code or prototype mutations", async () => {
    const config = await sample();
    config.inputs.title = "<img src=x onerror=alert(1)>";
    Object.defineProperty(config.inputs, "__proto__", {
        value: { polluted: true },
        enumerable: true,
    });
    const loaded = await parseGeneratorConfig(JSON.stringify(config));
    assert.equal(loaded.inputs.title, "<img src=x onerror=alert(1)>");
    assert.equal({}.polluted, undefined);
    assert.equal(
        generatorConfigFileName("", "节奏测试.wav"),
        "节奏测试.nowjs-generator.json",
    );
    assert.ok(
        !/[<>:"/\\|?*]/.test(
            generatorConfigFileName("../bad:name", audio.name),
        ),
    );
});
