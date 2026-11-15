import assert from "node:assert/strict";
import { test } from "node:test";
import { FixedStepClock } from "../fixedStepClock.ts";

test("240Hz simulation is independent of scheduler/render frequency", () => {
    for (const hz of [20, 30, 60, 144, 240]) {
        const clock = new FixedStepClock();
        clock.reset(0);
        const deltas = [];
        for (let frame = 1; frame <= hz; frame++) {
            clock.advance((frame * 1000) / hz, (delta) => deltas.push(delta));
        }
        assert.equal(deltas.length, 240, `${hz}Hz scheduler`);
        assert.ok(deltas.every((delta) => delta === clock.stepMs));
        assert.ok(clock.remainder < 1e-6);
    }
});

test("long stalls cap catch-up work without losing song time", () => {
    const clock = new FixedStepClock();
    clock.reset(100);
    const deltas = [];
    clock.advance(5100, (delta) => deltas.push(delta));
    assert.equal(deltas.length, 61);
    assert.ok(
        Math.abs(deltas.reduce((sum, delta) => sum + delta, 0) - 5000) < 1e-6,
    );
});

test("reset discards paused time and partial steps on restart/seek", () => {
    const clock = new FixedStepClock();
    clock.reset(0);
    clock.advance(2, () => assert.fail("partial step"));
    clock.reset(10000);
    assert.equal(clock.remainder, 0);
    clock.advance(10002, () => assert.fail("paused time must not catch up"));
    let calls = 0;
    clock.advance(10005, () => calls++);
    assert.equal(calls, 1);
});

test("audio start can rebase time without replaying the remaining backlog", () => {
    const clock = new FixedStepClock();
    clock.reset(0);
    let calls = 0;
    clock.advance(100, () => {
        calls++;
        return false;
    });
    assert.equal(calls, 1);
    assert.equal(clock.remainder, 0);
    clock.advance(105, () => {
        calls++;
    });
    assert.equal(calls, 2);
    clock.reset(0);
    calls = 0;
    clock.advance(10000, () => {
        calls++;
        return false;
    });
    assert.equal(calls, 1);
});
