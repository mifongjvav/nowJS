import assert from "node:assert/strict";
import { test } from "node:test";
import {
    drawManiaRectangle,
    getManiaRectangleGeometry,
} from "../maniaNoteGraphics.ts";

class Recorder {
    shapes = [];
    roundRect(...args) {
        this.shapes.push({ args });
        return this;
    }
    fill(color) {
        this.shapes.at(-1).fill = color;
        return this;
    }
    stroke(style) {
        this.shapes.at(-1).stroke = style;
        return this;
    }
}
const draw = (height) => {
    const recorder = new Recorder();
    drawManiaRectangle(recorder, height, 0xff3366, 0xffffff, 512, 4, 1);
    return recorder.shapes;
};

test("rectangular taps fill most of a lane without touching adjacent lanes", () => {
    const g = getManiaRectangleGeometry(512, 4, 1);
    assert.equal(g.width, 118);
    assert.equal(g.height, 20);
    assert.equal(g.radius, 5);
    assert.ok(g.width < 512 / 4);
    const shapes = draw(0);
    assert.equal(shapes.length, 2);
    assert.deepEqual(shapes[0].args, [-59, -20, 118, 20, 5]);
    assert.equal(shapes[0].fill, 0xff3366);
    assert.equal(shapes[1].fill.color, 0xffffff);
    assert.equal(shapes[1].args[1] + shapes[1].args[3], 0);
});

test("rectangle dimensions scale consistently with the logical rendering resolution", () => {
    const a = getManiaRectangleGeometry(512, 4, 1);
    const b = getManiaRectangleGeometry(768, 4, 1.5);
    for (const key of Object.keys(a))
        assert.ok(Math.abs(b[key] - a[key] * 1.5) < 1e-8);
});

test("long rectangles have a translucent body and distinct head and tail stripes", () => {
    const shapes = draw(400);
    assert.equal(shapes.length, 5);
    assert.equal(shapes[0].args[1], -400);
    assert.equal(shapes[0].args[3], 400);
    assert.equal(shapes[0].fill.alpha, 0.32);
    assert.equal(shapes[1].args[1] + shapes[1].args[3], -400);
    assert.equal(shapes[2].args[1] + shapes[2].args[3], -400);
    assert.equal(shapes.filter((s) => s.fill?.color === 0xffffff).length, 2);
    assert.deepEqual(shapes[3].args, draw(0)[0].args);
});

test("shortening a hold never creates negative sizes or inflated capsule ends", () => {
    for (const height of [100, 21, 20, 10, 1, 0]) {
        for (const shape of draw(height)) {
            assert.ok(shape.args.every(Number.isFinite));
            assert.ok(shape.args[2] > 0 && shape.args[3] > 0);
            assert.ok(
                shape.args[4] <= Math.min(shape.args[2], shape.args[3]) / 2,
            );
        }
    }
});
