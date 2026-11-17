import assert from "node:assert/strict";
import { test } from "node:test";
import {
    CatchPresentation,
    projectHorizontalMotion,
} from "../catchPresentation.ts";

const moving = { velocity: 0.609375, minX: 110, maxX: 1070 };
const stopped = { ...moving, velocity: 0 };
const close = (actual, expected) =>
    assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

test("144 Hz display remains continuous when physics snapshots arrive at 30 Hz", () => {
    const presentation = new CatchPresentation();
    presentation.reset(200, 0);
    let last = 199;
    for (let frame = 0; frame < 100; frame++) {
        const wall = (frame * 1000) / 144;
        const sampleWall = Math.floor(wall / (1000 / 30)) * (1000 / 30);
        presentation.sample(200 + moving.velocity * sampleWall, sampleWall);
        const state = presentation.frame(moving, wall);
        close(state.x, 200 + moving.velocity * wall);
        assert.ok(state.x > last);
        last = state.x;
    }
});

test("message delivery jitter is compensated using physics timestamps, not receipt times", () => {
    const presentation = new CatchPresentation();
    presentation.reset(200, 0);
    for (const [sampleWall, arrival] of [
        [10, 21],
        [30, 49],
        [60, 65],
        [70, 100],
    ]) {
        presentation.sample(200 + moving.velocity * sampleWall, sampleWall);
        close(
            presentation.frame(moving, arrival).x,
            200 + moving.velocity * arrival,
        );
    }
});

test("new key presses are predicted without letting stale snapshots undo them", () => {
    const presentation = new CatchPresentation();
    presentation.reset(200, 1000);
    presentation.input(stopped, 1008);
    close(presentation.frame(moving, 1016).x, 200 + moving.velocity * 8);
    presentation.sample(200, 1004);
    close(presentation.frame(moving, 1020).x, 200 + moving.velocity * 12);
    presentation.sample(200 + moving.velocity * 8, 1016);
    close(presentation.frame(moving, 1020).x, 200 + moving.velocity * 12);
});

test("release stops immediately and direction changes add no easing or inertia", () => {
    const presentation = new CatchPresentation();
    presentation.reset(200, 0);
    presentation.input(moving, 10);
    const stopX = 200 + moving.velocity * 10;
    close(presentation.frame(stopped, 20).x, stopX);
    presentation.sample(201, 8);
    close(presentation.frame(stopped, 30).x, stopX);
    presentation.input(stopped, 30);
    close(
        presentation.frame({ ...moving, velocity: -moving.velocity }, 40).x,
        200,
    );
});

test("display prediction respects field boundaries and hyperdash destinations", () => {
    assert.equal(
        projectHorizontalMotion(1060, { ...moving, wall: 0 }, 40),
        1070,
    );
    assert.equal(
        projectHorizontalMotion(120, { ...moving, velocity: -1, wall: 0 }, 40),
        110,
    );
    assert.equal(
        projectHorizontalMotion(
            200,
            { ...moving, velocity: 20, wall: 0, stopX: 400 },
            40,
        ),
        400,
    );
    assert.equal(
        projectHorizontalMotion(
            500,
            { ...moving, velocity: -20, wall: 0, stopX: 300 },
            40,
        ),
        300,
    );
});

test("main and render workers share one bounded prediction budget", () => {
    const presentation = new CatchPresentation();
    presentation.reset(200, 1000);
    const frame = presentation.frame(moving, 1030);
    assert.equal(frame.remainingMs, 70);
    close(
        projectHorizontalMotion(
            frame.x,
            {
                ...moving,
                wall: 1030,
                maxMs: frame.remainingMs,
            },
            1100,
        ),
        200 + moving.velocity * 100,
    );
    close(presentation.frame(moving, 1200).x, 200 + moving.velocity * 100);
});

test("pause/reset, backwards timestamps and old snapshots cannot leak motion", () => {
    const presentation = new CatchPresentation();
    presentation.reset(200, 1000);
    presentation.sample(210, 1020);
    presentation.sample(100, 1010);
    close(presentation.frame(stopped, 1030).x, 210);
    assert.equal(
        projectHorizontalMotion(210, { ...moving, wall: 1040 }, 1030),
        210,
    );
    assert.equal(
        projectHorizontalMotion(210, { ...moving, wall: 1040, maxMs: 0 }, 1100),
        210,
    );
    presentation.reset(600, 2000);
    close(presentation.frame(stopped, 2010).x, 600);
});
