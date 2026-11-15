import assert from "node:assert/strict";
import { test } from "node:test";
import { createRenderWorkerAdapter } from "../vendor/pixi-worker-adapter.js";

test("worker adapter implements Pixi's environment hooks without DOM globals", async () => {
    class Canvas {
        constructor(width, height) {
            this.width = width;
            this.height = height;
        }
    }
    class Context2D {}
    class GLContext {}
    const navigator = { userAgent: "test worker" },
        fonts = new Set(),
        response = {};
    const requests = [];
    const adapter = createRenderWorkerAdapter({
        OffscreenCanvas: Canvas,
        OffscreenCanvasRenderingContext2D: Context2D,
        WebGLRenderingContext: GLContext,
        navigator,
        fonts,
        location: { href: "blob:render-worker" },
        fetch: async (...args) => {
            requests.push(args);
            return response;
        },
    });
    const canvas = adapter.createCanvas(640, 480);
    assert.equal(canvas.width, 640);
    assert.equal(canvas.height, 480);
    assert.equal(adapter.createCanvas().width, 0);
    assert.equal(adapter.getCanvasRenderingContext2D(), Context2D);
    assert.equal(adapter.getWebGLRenderingContext(), GLContext);
    assert.equal(adapter.getNavigator(), navigator);
    assert.equal(adapter.getFontFaceSet(), fonts);
    assert.equal(adapter.getBaseUrl(), "blob:render-worker");
    const options = { method: "GET" };
    assert.equal(
        await adapter.fetch("blob:prepared-resource", options),
        response,
    );
    assert.deepEqual(requests, [["blob:prepared-resource", options]]);
    assert.throws(
        () => adapter.createImage(),
        /Decode images on the main thread/,
    );
    assert.throws(
        () => adapter.parseXML("<svg/>"),
        /Parse XML\/SVG on the main thread/,
    );
});
test("optional native image/XML hooks are used only when provided by the host", () => {
    const document = {};
    class Image {}
    class Parser {
        parseFromString(xml, mime) {
            assert.equal(xml, "<svg/>");
            assert.equal(mime, "text/xml");
            return document;
        }
    }
    const adapter = createRenderWorkerAdapter({ Image, DOMParser: Parser });
    assert.ok(adapter.createImage() instanceof Image);
    assert.equal(adapter.parseXML("<svg/>"), document);
    assert.equal(adapter.getFontFaceSet(), null);
});
