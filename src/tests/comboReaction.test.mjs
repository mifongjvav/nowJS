import assert from "node:assert/strict";
import { test } from "node:test";
import { ComboReaction } from "../comboReaction.ts";

function trigger(reaction) {
    reaction.update(100, 400, 0);
    for (let time = 100; time <= 400; time += 100) {
        reaction.update(time % 200 ? 900 : 100, 400, time);
    }
}

test("one fast teleport does not trigger the reaction", () => {
    const reaction = new ComboReaction(640, 360);
    reaction.update(100, 400, 0);
    assert.deepEqual(reaction.update(1100, 400, 1), {
        x: 1100,
        y: 400,
        frozen: false,
        shocked: false,
    });
});

test("normal movement does not accumulate travel beyond the one-second window", () => {
    const reaction = new ComboReaction(640, 360);
    for (let time = 0; time <= 10000; time += 100) {
        assert.equal(
            reaction.update(time % 200 ? 160 : 100, 400, time).frozen,
            false,
        );
    }
});

test("rapid backtracking adds up and freezes the indicator at canvas center", () => {
    const reaction = new ComboReaction(640, 360);
    trigger(reaction);
    assert.deepEqual(reaction.pause(100, 400, 400), {
        x: 640,
        y: 360,
        frozen: true,
        shocked: true,
    });
});

test("old travel expires smoothly rather than contributing to a later burst", () => {
    const reaction = new ComboReaction(640, 360);
    reaction.update(100, 400, 0);
    reaction.update(1000, 400, 100);
    assert.equal(reaction.update(100, 400, 1200).shocked, false);
    assert.equal(reaction.update(1000, 400, 1300).shocked, false);
});

test("emoji jumps once, lands, and becomes a stationary normal combo", () => {
    const reaction = new ComboReaction(640, 360);
    trigger(reaction);
    const peak = reaction.update(100, 400, 580);
    assert.equal(peak.x, 640);
    assert.equal(peak.y, 328);
    assert.equal(peak.shocked, true);
    const landed = reaction.update(100, 400, 760);
    assert.equal(landed.y, 360);
    assert.equal(landed.shocked, true);
    assert.deepEqual(reaction.update(100, 400, 1100), {
        x: 640,
        y: 360,
        frozen: true,
        shocked: false,
    });
});

test("normal combo remains centered until recent travel stays low long enough", () => {
    const reaction = new ComboReaction(640, 360);
    trigger(reaction);
    for (let time = 500; time <= 1700; time += 100) {
        assert.equal(reaction.update(100, 400, time).frozen, true);
    }
    assert.deepEqual(reaction.update(105, 400, 1800), {
        x: 105,
        y: 400,
        frozen: false,
        shocked: false,
    });
});

test("sustained fast movement keeps the normal combo at center", () => {
    const reaction = new ComboReaction(640, 360);
    trigger(reaction);
    for (let time = 500; time <= 2000; time += 100) {
        const state = reaction.update(time % 200 ? 900 : 100, 400, time);
        assert.equal(state.frozen, true);
        assert.equal(state.x, 640);
        if (time >= 1100) assert.equal(state.shocked, false);
    }
});

test("rolling travel thresholds are consistent across resolutions and frame rates", () => {
    for (const scale of [1, 1.5, 2]) {
        for (const elapsed of [1000 / 60, 1000 / 144, 100]) {
            const reaction = new ComboReaction(640 * scale, 360 * scale);
            for (let step = 0; step * elapsed <= 600; step++) {
                reaction.update(
                    (100 + ((step % 2) * 6000 * elapsed) / 1000) * scale,
                    400 * scale,
                    step * elapsed,
                    scale,
                );
            }
            assert.equal(reaction.shocked, true);
        }
    }
});

test("pause freezes the jump, and reset discards old travel and reactions", () => {
    const reaction = new ComboReaction(640, 360);
    trigger(reaction);
    const jumping = reaction.update(100, 400, 500);
    assert.deepEqual(reaction.pause(100, 400, 10000), jumping);
    assert.equal(reaction.update(100, 400, 10016).shocked, true);
    reaction.reset();
    assert.deepEqual(reaction.update(100, 400, 10032), {
        x: 100,
        y: 400,
        frozen: false,
        shocked: false,
    });
    assert.equal(reaction.update(900, 400, 10048).shocked, false);
});
