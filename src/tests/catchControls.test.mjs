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
    });
});
