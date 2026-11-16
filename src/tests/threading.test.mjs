import assert from "node:assert/strict";
import { test } from "node:test";
import { Simulation } from "../threads/simulation.ts";
import { normalizeInput } from "../threads/normalizeInput.ts";
import { Mixer } from "../threads/mixer.js";

function config(notes, extra = {}) {
    return {
        notes,
        mania: true,
        tails: true,
        auto: true,
        preemptMs: 1500,
        width: 1280,
        playerWidth: 100,
        fieldLeft: 384,
        fieldWidth: 512,
        scale: 1,
        ...extra,
    };
}
test("worker model judges dense autoplay independently of presentation", () => {
    const notes = Array.from({ length: 500 }, (_, id) => ({
        time: 1000 + id * 8,
        x: 64 + (id % 4) * 128,
        lane: id % 4,
        type: "fruit",
    }));
    const sim = new Simulation(config(notes));
    for (let step = 0; step < 1500; step++) sim.step(1000 / 240);
    assert.equal(sim.events.filter((e) => e.kind === "hit").length, 500);
    assert.equal(sim.events.filter((e) => e.kind === "miss").length, 0);
    assert.equal(sim.active.size, 0);
});
test("worker autoplay sweeps every banana in a long shower", () => {
    let seed = 1337;
    const random = () =>
        (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const notes = [];
    for (let time = 1000; time <= 11000; time += 78.125) {
        notes.push({ time, x: random() * 512, type: "banana" });
    }
    const sim = new Simulation(
        config(notes, {
            mania: false,
            auto: true,
            preemptMs: 2000,
            fieldLeft: (1280 - 960) / 2,
            fieldWidth: 960,
        }),
    );
    sim.reset(-1000);
    for (let step = 0; step < 3000; step++) sim.step(1000 / 240);
    assert.equal(
        sim.events.filter((event) => event.kind === "hit").length,
        notes.length,
    );
    assert.equal(sim.events.filter((event) => event.kind === "miss").length, 0);
});

test("manual head/tail judgements and early releases have one authoritative result", () => {
    const note = {
        time: 1000,
        x: 64,
        lane: 0,
        type: "fruit",
        holdEndTime: 2000,
    };
    const sim = new Simulation(config([note], { auto: false }));
    sim.step(1000);
    sim.input({ kind: "lane", lane: 0, down: true, stamp: 0 }, 1005);
    sim.input({ kind: "lane", lane: 0, down: true, stamp: 0 }, 1010);
    assert.equal(sim.active.get(0), true);
    sim.input({ kind: "lane", lane: 0, down: false, stamp: 0 }, 1995);
    sim.step(1200);
    assert.deepEqual(
        sim.events.map((e) => e.kind),
        ["spawn", "hit", "tail"],
    );
    sim.reset(0);
    sim.step(1000);
    sim.input({ kind: "lane", lane: 0, down: true, stamp: 0 }, 1000);
    sim.input({ kind: "lane", lane: 0, down: false, stamp: 0 }, 1200);
    sim.step(1200);
    assert.deepEqual(
        sim.events.map((e) => e.kind),
        ["spawn", "hit", "miss"],
    );
});
test("disabled tail judgement releases at the head; uncollected bananas are not misses", () => {
    const sim = new Simulation(
        config(
            [
                {
                    time: 1000,
                    x: 64,
                    lane: 0,
                    type: "fruit",
                    holdEndTime: 2000,
                },
                { time: 1000, x: 0, type: "banana" },
            ],
            { tails: false },
        ),
    );
    sim.step(1000);
    assert.equal(sim.active.size, 0);
    assert.equal(sim.events.filter((e) => e.kind === "hit").length, 2);
    const manual = new Simulation(
        config([{ time: 0, x: 0, type: "banana" }], { auto: false }),
    );
    manual.step(200);
    assert.deepEqual(
        manual.events.map((e) => e.kind),
        ["spawn", "release"],
    );
});
test("catch overlap and pointer processing use the same pixel coordinates", () => {
    const sim = new Simulation(
        config([{ time: 1000, x: 256, type: "fruit" }], {
            mania: false,
            auto: false,
        }),
    );
    const input = normalizeInput({
        kind: "pointer",
        clientX: 320,
        left: 0,
        cssWidth: 640,
        width: 1280,
        playerWidth: 100,
        stamp: 123,
    });
    assert.equal(input.x, 590);
    assert.equal(input.stamp, 123);
    sim.input(input, 0);
    const boundedLeft = normalizeInput({
        kind: "pointer",
        clientX: 0,
        left: 0,
        cssWidth: 1280,
        width: 1280,
        playerWidth: 100,
        fieldLeft: 160,
        fieldWidth: 960,
        stamp: 1,
    });
    const boundedRight = normalizeInput({
        kind: "pointer",
        clientX: 1280,
        left: 0,
        cssWidth: 1280,
        width: 1280,
        playerWidth: 100,
        fieldLeft: 160,
        fieldWidth: 960,
        stamp: 2,
    });
    assert.equal(boundedLeft.x, 160);
    assert.equal(boundedRight.x, 1020);
    sim.input(boundedLeft, 0);
    assert.equal(sim.playerX, 384);
    sim.input(boundedRight, 0);
    assert.equal(sim.playerX, 512 - 100 + 384);
    sim.input(input, 0);
    sim.step(1000);
    assert.equal(sim.events.at(-1).kind, "hit");
    assert.equal(
        normalizeInput({ kind: "key", code: "KeyJ", down: false, stamp: 99 })
            .lane,
        2,
    );
    assert.equal(
        normalizeInput({ kind: "key", code: "Escape", down: true, stamp: 0 }),
        null,
    );
    assert.equal(
        normalizeInput({
            kind: "pointer",
            clientX: 0,
            left: 0,
            cssWidth: 0,
            width: 1280,
            playerWidth: 100,
            stamp: 0,
        }),
        null,
    );
});
test("mixer resamples stereo music, freezes on pause, resumes and ends once", () => {
    const ended = [];
    const mixer = new Mixer(4, (id) => ended.push(id));
    mixer.command({
        type: "buffer",
        id: 1,
        rate: 2,
        channels: [Float32Array.of(1, 0), Float32Array.of(0, 1)],
    });
    mixer.command({ type: "play", id: 1, music: true, gain: 1 });
    let out = [new Float32Array(2), new Float32Array(2)];
    mixer.process(out);
    assert.deepEqual([...out[0]], [1, 0.5]);
    assert.deepEqual([...out[1]], [0, 0.5]);
    mixer.command({ type: "pauseMusic" });
    mixer.process(out);
    assert.deepEqual([...out[0]], [0, 0]);
    mixer.command({ type: "resumeMusic" });
    mixer.process(out);
    assert.deepEqual([...out[1]], [1, 1]);
    assert.deepEqual(ended, [1]);
    mixer.process(out);
    assert.deepEqual(ended, [1]);
});
test("mixer bounds polyphony, stops FX without stopping music, and clears buffers", () => {
    const mixer = new Mixer(4);
    mixer.command({
        type: "buffer",
        id: 1,
        rate: 4,
        channels: [new Float32Array(100)],
    });
    mixer.command({ type: "play", id: 1, music: true });
    for (let i = 0; i < 200; i++)
        mixer.command({ type: "play", id: 1, pan: 0 });
    assert.equal(mixer.voices.length, 128);
    mixer.command({ type: "stopFx" });
    assert.equal(mixer.voices.length, 1);
    mixer.command({ type: "stopMusic" });
    assert.equal(mixer.voices.length, 0);
    mixer.command({ type: "clear" });
    assert.equal(mixer.buffers.size, 0);
});

test("mono music keeps native unity upmix gain", () => {
    const mixer = new Mixer(4);
    mixer.command({
        type: "buffer",
        id: 1,
        rate: 4,
        channels: [Float32Array.of(1, 1)],
    });
    mixer.command({ type: "play", id: 1, music: true, gain: 0.5 });
    const output = [new Float32Array(2), new Float32Array(2)];
    mixer.process(output);
    assert.deepEqual([...output[0]], [0.5, 0.5]);
    assert.deepEqual([...output[1]], [0.5, 0.5]);
});
