import assert from "node:assert/strict";
import { test } from "node:test";
import { DOMAdapter } from "../../node_modules/pixi.js/lib/environment/adapter.mjs";
import { Texture } from "../../node_modules/pixi.js/lib/rendering/renderers/shared/texture/Texture.mjs";
import { TexturePool } from "../../node_modules/pixi.js/lib/rendering/renderers/shared/texture/TexturePool.mjs";
import { BackdropBlurFilter } from "../backdropBlurFilter.js";

// Program construction only; real shader/pixel checks run in the browser.
DOMAdapter.set({
    ...DOMAdapter.get(),
    createCanvas: () => ({ getContext: () => null }),
});

test("backdrop filter captures the background at native foreground resolution", () => {
    const filter = new BackdropBlurFilter(9);
    assert.equal(filter.backdropBlur, true);
    assert.equal(filter.blendRequired, true);
    assert.equal(filter.strength, 9);
    assert.equal(filter.resolution, "inherit");
    assert.ok(filter.padding >= 9 * 3);
    assert.equal(filter.blurPass.quality, 2);
    assert.equal(filter.blurPass.repeatEdgePixels, true);
    assert.ok(filter.glProgram);
    assert.ok(filter.gpuProgram);
    // Never advertise Canvas's foreground-only CSS blur as a fallback.
    assert.equal(filter.getCanvasFilterString, undefined);
    filter.destroy();
});

for (const fail of [false, true]) {
    test(`only backdrop pixels are blurred; pooled texture is released${fail ? " on draw failure" : ""}`, () => {
        const filter = new BackdropBlurFilter();
        const background = { source: {} };
        const foreground = { source: {} };
        const blurred = { source: {} };
        const output = {};
        const calls = [];
        const get = TexturePool.getSameSizeTexture;
        const release = TexturePool.returnTexture;
        TexturePool.getSameSizeTexture = (texture) => {
            assert.equal(texture, background);
            return blurred;
        };
        TexturePool.returnTexture = (texture) => {
            assert.equal(texture, blurred);
            calls.push("release");
        };
        const system = {
            activeBackTexture: background,
            applyFilter(effect, input, target, clear) {
                assert.equal(effect, filter);
                assert.equal(input, foreground);
                assert.equal(target, output);
                assert.equal(clear, false);
                assert.equal(filter.resources.uBackground, blurred.source);
                calls.push("composite");
                if (fail) throw Error("draw failed");
            },
        };
        filter.blurPass.apply = (active, input, target, clear) => {
            assert.equal(active, system);
            assert.equal(input, background);
            assert.equal(target, blurred);
            assert.equal(clear, true);
            calls.push("blur");
        };
        try {
            if (fail)
                assert.throws(
                    () => filter.apply(system, foreground, output, false),
                    /draw failed/,
                );
            else filter.apply(system, foreground, output, false);
            assert.deepEqual(calls, ["blur", "composite", "release"]);
            assert.equal(filter.resources.uBackground, Texture.WHITE.source);
        } finally {
            TexturePool.getSameSizeTexture = get;
            TexturePool.returnTexture = release;
            filter.destroy();
        }
    });
}
