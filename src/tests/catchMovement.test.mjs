import assert from "node:assert/strict";
import { test } from "node:test";
import { CatchMovement, assignHyperDashTargets } from "../catchMovement.ts";
import { Simulation } from "../threads/simulation.ts";
import { parseOsu, compileChart } from "../osuParser.ts";

const note = (x, time, type = "fruit") => ({ x, time, type });
const move = (movement, x, duration, time = 0) =>
    movement.move(x, duration, time, 0, 512, 100);

test("keyboard walk is immediate and dash is exactly twice as fast", () => {
    const movement = new CatchMovement();
    movement.state.right = true;
    assert.equal(move(movement, 100, 100), 150);
    movement.state.dash = true;
    assert.equal(move(movement, 100, 100), 200);
    movement.clearKeys();
    assert.equal(move(movement, 100, 100), 100);
    movement.state.left = true;
    assert.equal(move(movement, 100, 100), 50);
});

test("opposing direction keys cancel and catcher centers reach both field edges", () => {
    const movement = new CatchMovement();
    movement.state.left = movement.state.right = true;
    assert.equal(move(movement, 100, 100), 100);
    movement.state.left = false;
    assert.equal(move(movement, 100, 10000), 462);
    movement.state.left = true;
    movement.state.right = false;
    assert.equal(move(movement, 100, 10000), -50);
});

test("movement scales by the osu playfield rather than the canvas aspect ratio", () => {
    const movement = new CatchMovement();
    movement.state.right = true;
    assert.equal(movement.move(590, 100, 0, 160, 960, 100), 683.75);
    assert.equal(movement.move(885, 100, 0, 240, 1440, 150), 1025.625);
});

test("hyperfruit generation uses time, distance and direction and skips bananas", () => {
    const notes = [
        note(100, 1000),
        note(150, 1100),
        note(250, 1150, "banana"),
        note(450, 1200, "droplet"),
        note(450, 1600),
    ];
    assignHyperDashTargets(notes);
    assert.equal(notes[0].hyperDashTarget, undefined);
    assert.deepEqual(notes[1].hyperDashTarget, { x: 450, time: 1200 });
    assert.equal(notes[2].hyperDashTarget, undefined);
    assert.equal(notes[3].hyperDashTarget, undefined);
});

test("compiling Catch charts adds hyperdash metadata but Mania remains unchanged", () => {
    const beatmap = parseOsu(`osu file format v14
[General]
Mode:2
[Difficulty]
CircleSize:4
[HitObjects]
64,192,1000,1,0
448,192,1100,1,0
`);
    const catchChart = compileChart(beatmap, "catch");
    assert.deepEqual(catchChart.notes[0].hyperDashTarget, {
        x: 448,
        time: 1100,
    });
    assert.ok(
        compileChart(beatmap, "mania").notes.every((n) => !n.hyperDashTarget),
    );
});

test("catching a red fruit grants a timed multiplier; missing it grants nothing", () => {
    const movement = new CatchMovement();
    const red = { ...note(100, 1000), hyperDashTarget: { x: 500, time: 1100 } };
    movement.judge(red, false, 100);
    assert.equal(movement.state.hyper, null);
    movement.judge(red, true, 100);
    assert.ok(Math.abs(movement.state.hyper.multiplier - 4.8) < 0.000001);
    movement.state.right = movement.state.dash = true;
    assert.equal(move(movement, 50, 100, 1100), 450);
    assert.equal(
        movement.state.hyper,
        null,
        "crossing the target clamps and ends hyperdash",
    );
});

test("hyperdash does not auto-move, ignores bananas, and ends on next judgement", () => {
    const movement = new CatchMovement();
    const red = { ...note(100, 1000), hyperDashTarget: { x: 500, time: 1100 } };
    movement.judge(red, true, 100);
    assert.equal(move(movement, 50, 50, 1050), 50);
    movement.judge(note(200, 1050, "banana"), true, 100);
    assert.ok(movement.state.hyper);
    movement.judge(note(80, 990), false, 100);
    assert.ok(
        movement.state.hyper,
        "an earlier late miss does not cancel the target's boost",
    );
    movement.judge(note(500, 1100), false, 500);
    assert.equal(movement.state.hyper, null);
    movement.judge(red, true, 100);
    move(movement, 50, 1, 1200);
    assert.equal(
        movement.state.hyper,
        null,
        "overdue targets cannot leave a permanent boost",
    );
});

test("hyperdash can chain, and snapshots preserve boost without sharing mutable state", () => {
    const movement = new CatchMovement();
    movement.judge(
        { ...note(100, 1000), hyperDashTarget: { x: 500, time: 1100 } },
        true,
        100,
    );
    movement.judge(
        { ...note(500, 1100), hyperDashTarget: { x: 0, time: 1200 } },
        true,
        500,
    );
    const saved = movement.snapshot();
    const restored = new CatchMovement();
    restored.restore(saved);
    assert.deepEqual(restored.snapshot(), saved);
    movement.state.hyper.x = 200;
    assert.equal(restored.state.hyper.x, 0);
    restored.reset();
    assert.deepEqual(restored.snapshot(), {
        left: false,
        right: false,
        dash: false,
        hyper: null,
    });
});

test("worker uses held keyboard states, ignores pointer drift and releases instantly", () => {
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
    });
    sim.reset(0, 0, 590);
    sim.input(
        { kind: "catch", left: false, right: true, dash: false, stamp: 0 },
        0,
    );
    sim.step(100);
    assert.equal(sim.playerX, 683.75);
    sim.input({ kind: "pointer", x: 110, stamp: 0 }, 100);
    assert.equal(sim.playerX, 683.75);
    sim.input(
        { kind: "catch", left: false, right: true, dash: true, stamp: 0 },
        100,
    );
    sim.step(100);
    assert.equal(sim.playerX, 871.25);
    sim.input(
        { kind: "catch", left: false, right: false, dash: false, stamp: 0 },
        200,
    );
    sim.step(100);
    assert.equal(sim.playerX, 871.25);
});

test("worker hyperdash catches the following fruit using the same movement model", () => {
    const notes = [note(100, 1000), note(500, 1100)];
    assignHyperDashTargets(notes);
    const sim = new Simulation({
        notes,
        preemptMs: 1500,
        mania: false,
        tails: false,
        auto: false,
        width: 512,
        fieldLeft: 0,
        fieldWidth: 512,
        playerWidth: 100,
        scale: 1,
        catchKeyboard: true,
    });
    sim.reset(999, 0, 50);
    sim.step(1);
    assert.ok(sim.catchMovement.state.hyper);
    sim.input(
        { kind: "catch", left: false, right: true, dash: true, stamp: 0 },
        1000,
    );
    for (let i = 0; i < 30; i++) sim.step(1000 / 240);
    assert.equal(sim.events.filter((e) => e.kind === "hit").length, 2);
    assert.equal(sim.events.filter((e) => e.kind === "miss").length, 0);
    assert.equal(sim.catchMovement.state.hyper, null);
});

test("manual Catch does not collect red fruit before its actual catch time", () => {
    const sim = new Simulation({
        notes: [note(256, 1000)],
        preemptMs: 1500,
        mania: false,
        tails: false,
        auto: false,
        width: 512,
        fieldLeft: 0,
        fieldWidth: 512,
        playerWidth: 100,
        scale: 1,
        catchKeyboard: true,
    });
    sim.reset(904, 0, 206);
    sim.step(1);
    assert.equal(sim.events.filter((e) => e.kind === "hit").length, 0);
    sim.step(95);
    assert.equal(sim.events.filter((e) => e.kind === "hit").length, 1);
});
