import assert from "node:assert/strict";
import { test } from "node:test";
import { ComboReaction } from "../comboReaction.ts";

test("normal movement follows the plate; fast movement freezes at the old position", () => {
    const reaction = new ComboReaction();
    reaction.update(200, 400, 0);
    assert.deepEqual(reaction.update(210, 400, 16), {
        x: 210,
        y: 400,
        frozen: false,
        shocked: false,
    });
    assert.deepEqual(reaction.update(800, 400, 32), {
        x: 210,
        y: 400,
        frozen: true,
        shocked: true,
    });
});

test("emoji becomes a stationary normal combo while the plate remains fast", () => {
    const reaction = new ComboReaction();
    reaction.update(100, 400, 0);
    reaction.update(900, 400, 16);
    for (let time = 32; time <= 800; time += 16) {
        const state = reaction.update(time % 32 ? 900 : 100, 400, time);
        assert.equal(state.frozen, true);
        assert.equal(state.x, 100);
    }
    assert.equal(reaction.shocked, false);
});

test("brief slowdowns do not recover; sustained slow movement resumes following", () => {
    const reaction = new ComboReaction();
    reaction.update(100, 400, 0);
    reaction.update(900, 400, 16);
    assert.equal(reaction.update(900, 400, 316).frozen, true);
    reaction.update(100, 400, 332);
    assert.equal(reaction.update(100, 400, 732).frozen, true);
    assert.deepEqual(reaction.update(105, 400, 832), {
        x: 105,
        y: 400,
        frozen: false,
        shocked: false,
    });
});

test("shock remains visible after a single teleport and can trigger again later", () => {
    const reaction = new ComboReaction();
    reaction.update(100, 400, 0);
    reaction.update(900, 400, 16);
    assert.equal(reaction.update(900, 400, 516).shocked, true);
    assert.equal(reaction.update(900, 400, 716).frozen, false);
    assert.equal(reaction.update(100, 400, 732).shocked, true);
});

test("speed thresholds scale with resolution and elapsed time", () => {
    for (const scale of [1, 1.5, 2]) {
        for (const elapsed of [1000 / 60, 1000 / 144, 100]) {
            const reaction = new ComboReaction();
            reaction.update(100 * scale, 400 * scale, 0);
            assert.equal(
                reaction.update(
                    (100 + (3000 * elapsed) / 1000) * scale,
                    400 * scale,
                    elapsed,
                    scale,
                ).shocked,
                true,
            );
        }
    }
});

test("pause does not advance the reaction and reset clears stale motion", () => {
    const reaction = new ComboReaction();
    reaction.update(100, 400, 0);
    reaction.update(900, 400, 16);
    assert.equal(reaction.pause(900, 400, 10000).shocked, true);
    assert.equal(reaction.update(900, 400, 10016).shocked, true);
    reaction.reset();
    assert.deepEqual(reaction.update(100, 400, 10032), {
        x: 100,
        y: 400,
        frozen: false,
        shocked: false,
    });
});
