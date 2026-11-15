import assert from "node:assert/strict";
import { test } from "node:test";
import { openWorker } from "../threads/status.ts";
import {
    startWorkerRuntime,
    createWorkerFrameScheduler,
    installWorkerFrameClock,
} from "../threads/workerRuntime.js";

test("renderer dependency errors are reported before runtime initialization", async () => {
    const messages = [];
    const runtime = startWorkerRuntime(
        () => {
            throw new ReferenceError("worker dependency unavailable");
        },
        (message) => messages.push(message),
    );
    runtime.receive({ data: { type: "init" } });
    await runtime.ready;
    assert.deepEqual(messages, [
        {
            type: "error",
            phase: "load",
            message: "ReferenceError: worker dependency unavailable",
        },
    ]);
    runtime.receive({ data: { type: "scene" } });
    assert.equal(messages.length, 1);
});
test("initialization messages retain transferred object identity while loading", async () => {
    let loaded;
    const gate = new Promise((resolve) => {
        loaded = resolve;
    });
    const received = [],
        messages = [];
    const runtime = startWorkerRuntime(
        async () => {
            await gate;
            return (event) => {
                received.push(event.data);
            };
        },
        (message) => messages.push(message),
    );
    const init = { type: "init", canvas: { transferred: true } };
    runtime.receive({ data: init });
    loaded();
    await runtime.ready;
    await Promise.resolve();
    assert.equal(received[0], init);
    assert.deepEqual(messages, []);
});
test("async renderer initialization failures include the failing phase", async () => {
    const messages = [];
    const runtime = startWorkerRuntime(
        async () => async () => {
            throw new Error("WebGL initialization failed");
        },
        (message) => messages.push(message),
    );
    runtime.receive({ data: { type: "init" } });
    await runtime.ready;
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(messages, [
        {
            type: "error",
            phase: "initialize",
            message: "WebGL initialization failed",
        },
    ]);
});
test("worker frame scheduling falls back when rAF is absent or unsupported", () => {
    for (const raf of [
        undefined,
        () => {
            throw new Error("No associated Window");
        },
    ]) {
        let called = 0,
            delay = 0;
        const schedule = createWorkerFrameScheduler({
            requestAnimationFrame: raf,
            setTimeout: (fn, ms) => {
                called++;
                delay = ms;
                fn();
            },
        });
        let frames = 0;
        schedule(() => frames++);
        schedule(() => frames++);
        assert.equal(called, 2);
        assert.equal(frames, 2);
        assert.equal(delay, 1000 / 60);
    }
    let frames = 0;
    const schedule = createWorkerFrameScheduler({
        requestAnimationFrame: (fn) => fn(),
        setTimeout: () => assert.fail("should use worker rAF"),
    });
    schedule(() => frames++);
    assert.equal(frames, 1);
});

test("global frame clock supports Pixi tickers and cancels fallback timers", () => {
    for (const requestAnimationFrame of [
        undefined,
        () => {
            throw new Error("No associated Window");
        },
    ]) {
        const callbacks = new Map();
        let sequence = 0;
        const scope = {
            requestAnimationFrame,
            performance: { now: () => 123 },
            setTimeout: (fn) => {
                callbacks.set(++sequence, fn);
                return sequence;
            },
            clearTimeout: (id) => callbacks.delete(id),
        };
        installWorkerFrameClock(scope);
        let frames = 0;
        const canceled = scope.requestAnimationFrame(() =>
            assert.fail("canceled frame"),
        );
        scope.cancelAnimationFrame(canceled);
        scope.requestAnimationFrame((timestamp) => {
            frames++;
            assert.equal(timestamp, 123);
        });
        assert.equal(callbacks.size, 1);
        for (const callback of callbacks.values()) callback();
        assert.equal(frames, 1);
    }
});
test("global frame clock retains native scheduling and cancellation", () => {
    let deliver;
    const canceled = [];
    const scope = {
        requestAnimationFrame: (fn) => {
            deliver = fn;
            return 88;
        },
        cancelAnimationFrame: (id) => canceled.push(id),
        setTimeout: () => assert.fail("native rAF available"),
    };
    installWorkerFrameClock(scope);
    const token = scope.requestAnimationFrame(() =>
        assert.fail("canceled native frame"),
    );
    scope.cancelAnimationFrame(token);
    deliver(10);
    assert.deepEqual(canceled, [88]);
});

class TestWorker extends EventTarget {
    terminated = false;
    terminate() {
        this.terminated = true;
    }
    emit(type, data) {
        const event = Object.assign(
            new Event(type, { cancelable: true }),
            data,
        );
        this.dispatchEvent(event);
        return event;
    }
}
test("parent preserves the renderer startup phase instead of a generic Worker error", async () => {
    const worker = new TestWorker(),
        failures = [];
    const connection = openWorker(
        () => worker,
        () => {},
        (reason) => failures.push(reason),
    );
    const rejection = assert.rejects(
        connection.ready,
        /load: ReferenceError: missing dependency/,
    );
    worker.emit("message", {
        data: {
            type: "error",
            phase: "load",
            message: "ReferenceError: missing dependency",
        },
    });
    await rejection;
    assert.deepEqual(failures, ["load: ReferenceError: missing dependency"]);
    assert.equal(worker.terminated, true);
});
test("parent includes script location when the browser exposes it", async () => {
    const worker = new TestWorker(),
        failures = [];
    const connection = openWorker(
        () => worker,
        () => {},
        (reason) => failures.push(reason),
    );
    const rejection = assert.rejects(
        connection.ready,
        /SyntaxError: invalid worker.*render.worker.js:9:3/,
    );
    const event = worker.emit("error", {
        error: new SyntaxError("invalid worker"),
        filename: "render.worker.js",
        lineno: 9,
        colno: 3,
    });
    await rejection;
    assert.equal(event.defaultPrevented, true);
    assert.equal(failures.length, 1);
});
