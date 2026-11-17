import assert from "node:assert/strict";
import { test } from "node:test";

const values = new Map();
globalThis.window = {
    localStorage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
    },
};
const controls = await import("../catchControls.ts");

test("Catch defaults to keyboard A/S/D and Enter is reserved for autoplay", () => {
    controls.resetCatchControls();
    assert.deepEqual(controls.getCatchControls(), {
        mode: "keyboard",
        left: "KeyA",
        right: "KeyS",
        dash: "KeyD",
        speed: 0.65,
    });
    for (const code of ["Enter", "NumpadEnter", "Escape", "Tab", "bad-key"]) {
        assert.equal(controls.setCatchBinding("left", code), false);
    }
});

test("rebinding persists physical codes and swaps duplicates instead of losing actions", () => {
    controls.resetCatchControls();
    controls.setCatchBinding("left", "KeyS");
    assert.equal(controls.getCatchControls().left, "KeyS");
    assert.equal(controls.getCatchControls().right, "KeyA");
    controls.setCatchBinding("dash", "ShiftLeft");
    controls.setCatchControlMode("pointer");
    assert.deepEqual(
        JSON.parse(values.get("nowjs-catch-controls")),
        controls.getCatchControls(),
    );
    assert.equal(controls.catchKeyLabel("KeyA"), "A");
    assert.equal(controls.catchKeyLabel("ArrowLeft"), "←");
});

test("stored controls reload and invalid conflicting controls fall back safely", async () => {
    let loaded = await import("../catchControls.ts?reload=valid");
    assert.equal(loaded.getCatchControls().dash, "ShiftLeft");
    values.set(
        "nowjs-catch-controls",
        JSON.stringify({
            mode: "keyboard",
            left: "KeyA",
            right: "KeyA",
            dash: "Enter",
        }),
    );
    loaded = await import("../catchControls.ts?reload=invalid");
    assert.deepEqual(loaded.getCatchControls(), {
        mode: "keyboard",
        left: "KeyA",
        right: "KeyS",
        dash: "KeyD",
        speed: 0.65,
    });
});

test("movement speed persists, stays bounded and does not overwrite key bindings", () => {
    controls.resetCatchControls();
    controls.setCatchBinding("left", "ArrowLeft");
    controls.setCatchSpeed(0.5);
    assert.equal(controls.getCatchControls().speed, 0.5);
    assert.equal(controls.getCatchControls().left, "ArrowLeft");
    assert.equal(JSON.parse(values.get("nowjs-catch-controls")).speed, 0.5);
    controls.setCatchSpeed(Infinity);
    assert.equal(controls.getCatchControls().speed, 0.5);
    controls.setCatchSpeed(2);
    assert.equal(controls.getCatchControls().speed, 1);
    controls.setCatchSpeed(0.01);
    assert.equal(controls.getCatchControls().speed, 0.25);
});

test("legacy saved key bindings receive the slower default without losing custom keys", async () => {
    values.set(
        "nowjs-catch-controls",
        JSON.stringify({
            mode: "keyboard",
            left: "KeyZ",
            right: "KeyX",
            dash: "ShiftLeft",
        }),
    );
    const loaded = await import("../catchControls.ts?reload=legacy");
    assert.equal(loaded.getCatchControls().left, "KeyZ");
    assert.equal(loaded.getCatchControls().dash, "ShiftLeft");
    assert.equal(loaded.getCatchControls().speed, 0.65);
});
