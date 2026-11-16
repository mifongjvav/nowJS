import assert from "node:assert/strict";
import { test } from "node:test";

Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { gameWidth: 1280, gameHeight: 720, gameScale: 1 },
});
const { getCatchPlayfield, getCatchPlayerRange, getPlayfield } =
    await import("../layout.ts");

test("catch playfield matches the 4:3 storyboard area", () => {
    assert.deepEqual(getCatchPlayfield(), {
        left: 160,
        width: 960,
        right: 1120,
        center: 640,
    });
    // The plate may overhang by half its width so its centre reaches x=0/512.
    assert.deepEqual(getCatchPlayerRange(100), { minX: 110, maxX: 1070 });
    // Mania keeps its dedicated 512-wide lane field.
    assert.deepEqual(getPlayfield(), {
        left: 384,
        width: 512,
        right: 896,
        center: 640,
    });
});

test("4:3 and 16:9 resolutions map catch coordinates consistently", () => {
    window.gameWidth = 1024;
    window.gameHeight = 768;
    window.gameScale = 768 / 720;
    assert.deepEqual(getCatchPlayfield(), {
        left: 0,
        width: 1024,
        right: 1024,
        center: 512,
    });

    window.gameWidth = 1920;
    window.gameHeight = 1080;
    window.gameScale = 1.5;
    assert.deepEqual(getCatchPlayfield(), {
        left: 240,
        width: 1440,
        right: 1680,
        center: 960,
    });
});
