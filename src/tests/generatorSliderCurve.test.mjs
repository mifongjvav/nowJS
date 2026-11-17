import assert from "node:assert/strict";
import { test } from "node:test";
import { createGeneratorSliderCurve } from "../generatorSliderCurve.ts";
import { parseOsu, compileChart } from "../osuParser.ts";
import {
    bezierSegments,
    sampleBezierSlider,
} from "./generatorCurveHelpers.mjs";

function map(x, endX, length) {
    return parseOsu(`osu file format v14
[General]
Mode:2
[Difficulty]
CircleSize:4
SliderMultiplier:1
SliderTickRate:1
[TimingPoints]
0,500,4,1,0,100,1,0
[HitObjects]
${x},192,1000,6,0,${createGeneratorSliderCurve(x, endX, length)},1,${length}
`);
}
test("rounded slider arcs keep length, intended tail x and monotone horizontal flow after real import", () => {
    for (const [x, endX, length] of [
        [100, 200, 100],
        [100, 200, 300],
        [400, 100, 600],
        [256, 256, 500],
        [100, 101, 800],
        [300, 160, 150],
        [32, 480, 900],
    ]) {
        const parsed = map(x, endX, length),
            object = parsed.hitObjects[0];
        assert.equal(object.curveType, "B");
        const points = sampleBezierSlider(object);
        const actual = points
            .slice(1)
            .reduce(
                (sum, p, i) =>
                    sum + Math.hypot(p.x - points[i].x, p.y - points[i].y),
                0,
            );
        assert.ok(
            Math.abs(actual - length) < 0.01,
            `${x}->${endX} ${actual} != ${length}`,
        );
        assert.ok(points.every((p) => p.y >= 32 && p.y <= 352));
        assert.ok(
            points.every(
                (p) =>
                    p.x >= Math.min(x, endX) - 0.001 &&
                    p.x <= Math.max(x, endX) + 0.001,
            ),
        );
        const notes = compileChart(parsed, "catch").notes;
        assert.ok(Math.abs(notes.at(-1).x - endX) < 0.02);
        assert.ok(
            Math.abs(notes.at(-1).time - (1000 + (length / 100) * 500)) < 0.01,
        );
        const fruits = notes.filter((n) => n.type === "fruit");
        assert.ok(
            fruits
                .slice(1)
                .every(
                    (p, i) =>
                        (p.x - fruits[i].x) * Math.sign(endX - x) >= -0.001,
                ),
        );
    }
});

test("multi-arc Bezier joins have continuous tangent direction instead of sharp line corners", () => {
    const object = map(100, 400, 900).hitObjects[0];
    const segments = bezierSegments(object);
    assert.ok(segments.length > 1);
    for (let i = 1; i < segments.length; i++) {
        const previous = segments[i - 1],
            next = segments[i],
            join = previous.at(-1);
        const a = {
            x: join.x - previous.at(-2).x,
            y: join.y - previous.at(-2).y,
        };
        const b = { x: next[1].x - next[0].x, y: next[1].y - next[0].y };
        assert.ok(Math.abs(a.x * b.y - a.y * b.x) < 0.001);
        assert.ok(a.x * b.x + a.y * b.y > 0);
    }
});

test("circle-length sliders approximate an actual semicircle, not a thin S wave", () => {
    const object = map(100, 200, Math.PI * 50).hitObjects[0];
    const points = sampleBezierSlider(object);
    assert.ok(points.some((p) => p.y > 241.9));
    for (const point of points) {
        const radius = Math.hypot(point.x - 150, point.y - 192);
        assert.ok(
            Math.abs(radius - 50) < 0.05,
            `non-circular radius ${radius}`,
        );
    }
});

test("symmetric arc-length fitting stays accurate for varied spans, translations and multi-arch lengths", () => {
    for (let i = 0; i < 60; i++) {
        const x = 32 + ((i * 37) % 448),
            endX = i % 7 === 0 ? x : 32 + ((i * 83) % 448);
        const length = Math.abs(endX - x) + 5 + (i % 9) * 114;
        const object = map(x, endX, length).hitObjects[0];
        const points = sampleBezierSlider(object);
        const actual = points
            .slice(1)
            .reduce(
                (sum, p, j) =>
                    sum + Math.hypot(p.x - points[j].x, p.y - points[j].y),
                0,
            );
        assert.ok(
            Math.abs(actual - length) < 0.01,
            `${x}->${endX} ${actual} != ${length}`,
        );
        assert.ok(
            points.every(
                (p) =>
                    p.x >= Math.min(x, endX) - 0.001 &&
                    p.x <= Math.max(x, endX) + 0.001 &&
                    p.y >= 32 &&
                    p.y <= 352,
            ),
        );
    }
});
