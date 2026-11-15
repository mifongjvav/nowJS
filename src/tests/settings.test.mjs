import assert from "node:assert/strict";
import { test } from "node:test";

test("settings validate persisted values and survive unavailable storage", async () => {
    const stored = new Map([
        [
            "nowjs-settings",
            JSON.stringify({
                backgroundDim: 999,
                backgroundBlur: -5,
                video: false,
                blur: "false",
            }),
        ],
    ]);
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            localStorage: {
                getItem: (key) => stored.get(key) ?? null,
                setItem: (key, value) => stored.set(key, value),
            },
        },
    });
    const { getSettings, updateSettings, onSettingsChange } =
        await import("../settings.ts");
    assert.equal(getSettings().backgroundDim, 100);
    assert.equal(getSettings().backgroundBlur, 0);
    assert.equal(getSettings().video, false);
    assert.equal(getSettings().blur, true);
    assert.equal(getSettings().decoupledRendering, false);
    let notifications = 0;
    const unsubscribe = onSettingsChange(() => notifications++);
    updateSettings({
        backgroundDim: 35,
        backgroundBlur: 12,
        decoupledRendering: true,
    });
    assert.equal(notifications, 1);
    assert.equal(JSON.parse(stored.get("nowjs-settings")).backgroundDim, 35);
    updateSettings({ backgroundDim: NaN, backgroundBlur: Infinity });
    assert.equal(notifications, 1);
    Object.defineProperty(window, "localStorage", {
        get: () => {
            throw new Error("storage denied");
        },
    });
    updateSettings({ blur: false });
    assert.equal(getSettings().blur, false);
    assert.equal(notifications, 2);
    unsubscribe();
    updateSettings({ blur: true });
    assert.equal(notifications, 2);
});
