import assert from "node:assert/strict";
import { test } from "node:test";
import {
    getCatchSizeScale,
    getCatchPlayerWidthOsu,
} from "../catchDifficulty.ts";
import { CatchMovement, assignHyperDashTargets } from "../catchMovement.ts";
import { Simulation } from "../threads/simulation.ts";

test("CS scales fruit and catcher dimensions relative to the existing CS4 size", () => {
    assert.equal(getCatchSizeScale(4), 1);
    assert.ok(getCatchSizeScale(2) > 1);
    assert.ok(getCatchSizeScale(8) < 1);
    assert.ok(
        Math.abs(getCatchSizeScale(5) / getCatchSizeScale(0) - 1 / 1.7) < 1e-10,
    );
    assert.ok(Math.abs(getCatchPlayerWidthOsu(4) - (100 / 960) * 512) < 1e-10);
    assert.equal(getCatchSizeScale(NaN), 1);
    assert.equal(getCatchSizeScale(99), getCatchSizeScale(10));
});

test("comfort speed slows both walking and dash without inventing a CS-speed formula", () => {
    const movement = new CatchMovement();
    movement.state.right = true;
    assert.equal(movement.move(100, 100, 0, 0, 512, 100, true, 0.65), 132.5);
    movement.state.dash = true;
    assert.equal(movement.move(100, 100, 0, 0, 512, 100, true, 0.65), 165);
});

test("hyperfruit detection uses both selected speed and the CS-sized catcher margin", () => {
    const notes = [
        { x: 100, time: 1000, type: "fruit" },
        { x: 200, time: 1120, type: "fruit" },
    ];
    assignHyperDashTargets(notes, 0, 1);
    assert.equal(notes[0].hyperDashTarget, undefined);
    assignHyperDashTargets(notes, 0, 0.65);
    assert.ok(notes[0].hyperDashTarget);
    notes[1].x = 219;
    notes[1].time = 1100;
    assignHyperDashTargets(notes, getCatchPlayerWidthOsu(0), 1);
    assert.equal(notes[0].hyperDashTarget, undefined);
    assignHyperDashTargets(notes, getCatchPlayerWidthOsu(10), 1);
    assert.ok(notes[0].hyperDashTarget);
});

test("hyperdash compensates for slower base speed and still reaches its target", () => {
    const movement = new CatchMovement();
    movement.state.right = movement.state.dash = true;
    const red = {
        x: 100,
        time: 1000,
        type: "fruit",
        hyperDashTarget: { x: 500, time: 1100 },
    };
    movement.judge(red, true, 100, 0.65);
    assert.ok(movement.state.hyper.multiplier > 4.8);
    assert.equal(movement.move(50, 100, 1100, 0, 512, 100, true, 0.65), 450);
    assert.equal(movement.state.hyper, null);
});

test("worker applies the same configured speed to keyboard movement", () => {
    const sim = new Simulation({
        notes: [],
        preemptMs: 1500,
        mania: false,
        tails: false,
        auto: false,
        width: 1280,
        fieldLeft: 160,
        fieldWidth: 960,
        playerWidth: 100,
        scale: 1,
        catchKeyboard: true,
        catchSpeed: 0.65,
    });
    sim.reset(0, 0, 590);
    sim.input(
        { kind: "catch", left: false, right: true, dash: false, stamp: 0 },
        0,
    );
    sim.step(100);
    assert.equal(sim.playerX, 650.9375);
});
