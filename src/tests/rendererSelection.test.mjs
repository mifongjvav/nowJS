import assert from "node:assert/strict";
import { test } from "node:test";
import {
    getActiveRendererLabel,
    getRendererAttempts,
    isRendererSetting,
} from "../rendererSelection.ts";

test("renderer settings validate only supported values", () => {
    for (const value of ["auto", "webgpu", "webgl2", "webgl1", "canvas"]) {
        assert.equal(isRendererSetting(value), true, value);
    }
    for (const value of ["webgl", "webgl3", "", null, 2, undefined]) {
        assert.equal(isRendererSetting(value), false, String(value));
    }
});

test("automatic and explicit renderer fallback chains", () => {
    assert.deepEqual(getRendererAttempts("auto"), [
        { kind: "webgl", preferWebGLVersion: 2 },
        { kind: "canvas" },
    ]);
    assert.deepEqual(getRendererAttempts("canvas"), [{ kind: "canvas" }]);
    assert.deepEqual(getRendererAttempts("webgl1"), [
        { kind: "webgl", preferWebGLVersion: 1, requireWebGLVersion: 1 },
        { kind: "canvas" },
    ]);
    assert.deepEqual(getRendererAttempts("webgl2"), [
        { kind: "webgl", preferWebGLVersion: 2, requireWebGLVersion: 2 },
        { kind: "webgl", preferWebGLVersion: 1, requireWebGLVersion: 1 },
        { kind: "canvas" },
    ]);
    assert.deepEqual(getRendererAttempts("webgpu"), [
        { kind: "webgpu" },
        { kind: "webgl", preferWebGLVersion: 2 },
        { kind: "canvas" },
    ]);
});

test("active renderer labels distinguish WebGL versions and fallbacks", () => {
    assert.equal(getActiveRendererLabel(null), "—");
    assert.equal(
        getActiveRendererLabel({ name: "webgl", context: { webGLVersion: 1 } }),
        "WebGL 1",
    );
    assert.equal(
        getActiveRendererLabel({ name: "webgl", context: { webGLVersion: 2 } }),
        "WebGL 2",
    );
    assert.equal(getActiveRendererLabel({ name: "webgpu" }), "WebGPU");
    assert.equal(getActiveRendererLabel({ name: "canvas" }), "Canvas");
    assert.equal(getActiveRendererLabel({ name: "custom" }), "custom");
});
