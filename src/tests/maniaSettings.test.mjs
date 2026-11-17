import assert from "node:assert/strict";
import { test } from "node:test";

const values = new Map();
globalThis.window = {
    localStorage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
    },
};
const settings = await import("../maniaSettings.ts");

test("rectangle mode is optional and independent of hold-tail judgement", () => {
    assert.equal(settings.isManiaRectangleEnabled(), false);
    assert.equal(settings.isHoldTailJudgementEnabled(), true);
    settings.setManiaRectangleEnabled(true);
    assert.equal(settings.isHoldTailJudgementEnabled(), true);
    settings.setHoldTailJudgementEnabled(false);
    assert.equal(settings.isManiaRectangleEnabled(), true);
    assert.equal(values.get("nowjs-mania-rectangles"), "1");
});

test("rectangle changes notify renderers once and restore after reload", async () => {
    let changes = 0;
    const unsubscribe = settings.onManiaRectangleChange(() => changes++);
    settings.setManiaRectangleEnabled(true);
    assert.equal(changes, 0);
    settings.setManiaRectangleEnabled(false);
    settings.setManiaRectangleEnabled(true);
    assert.equal(changes, 2);
    unsubscribe();
    const reloaded = await import("../maniaSettings.ts?reload=rectangle");
    assert.equal(reloaded.isManiaRectangleEnabled(), true);
    assert.equal(reloaded.isHoldTailJudgementEnabled(), false);
});

test("denied storage does not prevent changing the current session's note shape", () => {
    window.localStorage.setItem = () => {
        throw Error("denied");
    };
    assert.doesNotThrow(() => settings.setManiaRectangleEnabled(false));
    assert.equal(settings.isManiaRectangleEnabled(), false);
});
