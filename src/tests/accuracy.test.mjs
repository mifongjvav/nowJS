import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateAccuracy } from "../accuracy.ts";

test("collected bananas improve accuracy after a miss", () => {
    assert.equal(calculateAccuracy(1, 1), 0.5);
    assert.equal(calculateAccuracy(1, 1, 2), 0.75);
    assert.equal(calculateAccuracy(0, 1, 1), 0.5);
});

test("uncollected bonus bananas do not count as misses", () => {
    assert.equal(calculateAccuracy(0, 0, 0), 1);
    assert.equal(calculateAccuracy(0, 0, 20), 1);
    assert.equal(calculateAccuracy(10, 0, 2), 1);
});

test("charts without bananas keep their original accuracy", () => {
    assert.equal(calculateAccuracy(3, 1), 0.75);
    assert.equal(calculateAccuracy(0, 4), 0);
    assert.equal(calculateAccuracy(0, 0), 1);
});
