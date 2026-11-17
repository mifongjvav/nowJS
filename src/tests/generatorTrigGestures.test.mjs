import assert from "node:assert/strict";
import { test } from "node:test";
import {
    createGeneratorTrigGesture,
    sampleGeneratorTrigGesture,
} from "../generatorTrigGestures.ts";

test("trigonometric gestures have smooth entrances, exits and rounded turns rather than triangular corners", () => {
    const epsilon = 1e-5;
    for (const variant of [0, 1, 2]) {
        const sample = (u) => sampleGeneratorTrigGesture(u, variant);
        assert.ok(Math.abs(sample(0)) < 1e-10);
        assert.ok(Math.abs((sample(epsilon) - sample(0)) / epsilon) < 0.001);
        assert.ok(
            Math.abs((sample(1) - sample(1 - epsilon)) / epsilon) < 0.001,
        );
        for (let i = 0; i <= 1000; i++)
            assert.ok(Math.abs(sample(i / 1000)) <= 1);
    }
    const arch = (u) => sampleGeneratorTrigGesture(u, 0);
    assert.ok(arch(0.5) > arch(0.4) && arch(0.5) > arch(0.6));
    assert.ok(
        Math.abs((arch(0.5 + epsilon) - arch(0.5 - epsilon)) / (2 * epsilon)) <
            1e-6,
    );
});

test("phrase signatures select reproducible, varied shapes without depending on absolute song position", () => {
    const a = createGeneratorTrigGesture(
        100,
        2100,
        60,
        0.48,
        "circle:0,circle:2",
        7,
    );
    const b = createGeneratorTrigGesture(
        1237,
        3237,
        60,
        0.48,
        "circle:0,circle:2",
        7,
    );
    for (let i = 0; i <= 2000; i += 25)
        assert.ok(Math.abs(a.sample(100 + i) - b.sample(1237 + i)) < 1e-9);
    const variants = new Set();
    for (let seed = 0; seed < 12; seed++) {
        const gesture = createGeneratorTrigGesture(
            100,
            2100,
            60,
            0.48,
            "circle:0,circle:2",
            seed,
        );
        variants.add(
            [
                gesture.direction,
                gesture.sample(600).toFixed(5),
                gesture.sample(1600).toFixed(5),
            ].join(","),
        );
    }
    assert.ok(variants.size >= 3);
    assert.equal(a.sample(-100), 0);
    assert.equal(a.sample(5000), a.sample(2100));
});

test("short and degenerate phrases shrink their arcs instead of breaking the requested movement speed", () => {
    for (const duration of [0, 10, 100, 500, 2000]) {
        for (const seed of [1, 2, 3]) {
            const gesture = createGeneratorTrigGesture(
                100,
                100 + duration,
                60,
                0.12,
                "test",
                seed,
            );
            let previous = gesture.sample(100);
            for (let i = 1; i <= duration; i++) {
                const value = gesture.sample(100 + i);
                assert.ok(Number.isFinite(value) && Math.abs(value) <= 54);
                assert.ok(Math.abs(value - previous) <= 0.120001);
                previous = value;
            }
            if (!duration) assert.equal(gesture.sample(500), 0);
        }
    }
});
