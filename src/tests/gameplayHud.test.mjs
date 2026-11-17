import assert from "node:assert/strict";
import { test } from "node:test";
import {
    getGameplayHudLayout,
    getHudProgressFillWidth,
    hudProgressAtPoint,
} from "../gameplayHudLayout.ts";

test("HUD anchors use the full canvas, not the Catch 4:3 playfield", () => {
    const layout = getGameplayHudLayout(1280, 720);
    assert.equal(layout.right, 1264);
    assert.equal(layout.bottom, 704);
    assert.equal(layout.inset, 16);
    assert.equal(layout.metadataWidth, 360);
    assert.deepEqual(layout.progress, {
        x: 16,
        y: 6,
        width: 1248,
        height: 6,
        hitHeight: 26,
    });
});

test("progress fill retains circular caps at low progress without scaling", () => {
    assert.equal(getHudProgressFillWidth(0, 1248, 6), 0);
    assert.equal(getHudProgressFillWidth(0.001, 1248, 6), 6);
    assert.equal(getHudProgressFillWidth(0.25, 1248, 6), 312);
    assert.equal(getHudProgressFillWidth(1, 1248, 6), 1248);
    assert.equal(getHudProgressFillWidth(0.001, 1248, 12), 12);
});

test("HUD scales at 1080p and keeps metadata inside a 4:3 canvas", () => {
    const fullHd = getGameplayHudLayout(1920, 1080);
    assert.equal(fullHd.scale, 1.5);
    assert.equal(fullHd.right, 1896);
    assert.equal(fullHd.bottom, 1056);
    assert.equal(fullHd.metadataWidth, 540);
    const narrow = getGameplayHudLayout(1024, 768);
    assert.ok(narrow.inset + narrow.metadataWidth < narrow.right);
});

test("progress hit testing accounts for CSS scale and letterboxing", () => {
    const rect = { left: 100, top: 80, width: 640, height: 360 };
    const point = hudProgressAtPoint(420, 85, rect, 1280, 720);
    assert.deepEqual(point, { progress: 0.5, inside: true });
    assert.equal(hudProgressAtPoint(420, 110, rect, 1280, 720).inside, false);
    assert.equal(hudProgressAtPoint(420, 70, rect, 1280, 720).inside, false);
});

test("dragging outside the canvas clamps progress to its endpoints", () => {
    const rect = { left: 100, top: 80, width: 640, height: 360 };
    assert.deepEqual(hudProgressAtPoint(0, 85, rect, 1280, 720), {
        progress: 0,
        inside: false,
    });
    assert.deepEqual(hudProgressAtPoint(900, 85, rect, 1280, 720), {
        progress: 1,
        inside: false,
    });
});

test("zero-sized hidden canvases cannot begin seeking", () => {
    for (const [width, height] of [
        [0, 360],
        [640, 0],
    ]) {
        assert.equal(
            hudProgressAtPoint(
                100,
                100,
                { left: 0, top: 0, width, height },
                1280,
                720,
            ),
            null,
        );
    }
});
