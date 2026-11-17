import {
    DOMAdapter,
    WebWorkerAdapter,
    Container,
    Graphics,
    Sprite,
    Text,
    Texture,
    Matrix,
    BlurFilter,
    WebGLRenderer,
} from "../vendor/pixi-worker.js";
import { createWorkerFrameScheduler } from "./workerRuntime.js";
import { projectHorizontalMotion } from "../catchPresentation.ts";
export function installRenderWorker(reportFailure) {
    DOMAdapter.set(WebWorkerAdapter);
    const scheduleFrame = createWorkerFrameScheduler(self);
    let renderer,
        stage = new Container(),
        framePending = false,
        frameWall = 0,
        playing = false;
    const nodes = new Map(),
        textures = new Map();
    function reset() {
        stage.removeChildren();
        for (const { node } of nodes.values()) {
            node.removeChildren?.();
            for (const filter of node.filters || []) filter.destroy();
            node.destroy({ children: false });
        }
        nodes.clear();
        for (const texture of textures.values()) {
            const bitmap = texture.source.resource;
            texture.destroy(true);
            bitmap?.close?.();
        }
        textures.clear();
    }
    function update(data) {
        let record = nodes.get(data.id);
        if (!record) {
            const node =
                data.kind === "graphics"
                    ? new Graphics()
                    : data.kind === "text"
                      ? new Text({ text: "" })
                      : data.kind === "sprite"
                        ? new Sprite(Texture.EMPTY)
                        : new Container();
            record = { node, signature: "", filters: "" };
            nodes.set(data.id, record);
        }
        const node = record.node,
            t = data.transform;
        node.position.set(t[0], t[1]);
        node.scale.set(t[2], t[3]);
        node.rotation = t[4];
        node.pivot.set(t[5], t[6]);
        node.skew.set(t[7], t[8]);
        record.y = t[1];
        record.x = t[0];
        record.motionY = data.motionY;
        record.motionMaxY = data.motionMaxY;
        record.motionX = data.motionX;
        node.visible = true;
        node.alpha = data.alpha;
        node.tint = data.tint;
        node.blendMode = data.blendMode;
        if (data.anchor) node.anchor.set(...data.anchor);
        if (data.kind === "graphics" && record.signature !== data.graphics) {
            record.signature = data.graphics;
            node.clear();
            for (const instruction of JSON.parse(data.graphics)) {
                node.beginPath();
                for (const command of instruction.path) {
                    if (typeof node.context[command.action] !== "function")
                        throw new Error(
                            `Unsupported graphics command: ${command.action}`,
                        );
                    const args = command.data.map((arg) =>
                        arg && typeof arg === "object" && "a" in arg
                            ? new Matrix(
                                  arg.a,
                                  arg.b,
                                  arg.c,
                                  arg.d,
                                  arg.tx,
                                  arg.ty,
                              )
                            : arg,
                    );
                    node.context[command.action](...args);
                }
                node.context[instruction.action](instruction.style);
            }
        }
        if (data.kind === "sprite") {
            record.textureId = data.texture;
            node.texture = textures.get(data.texture) || Texture.EMPTY;
        }
        if (data.kind === "text") {
            node.text = data.text;
            const styleSignature = JSON.stringify(data.style);
            if (record.styleSignature !== styleSignature) {
                record.styleSignature = styleSignature;
                node.style = data.style;
            }
        }
        const filters = JSON.stringify(data.blur);
        if (record.filters !== filters) {
            record.filters = filters;
            for (const filter of node.filters || []) filter.destroy();
            node.filters = data.blur.length
                ? data.blur.map(
                      (strength) => new BlurFilter({ strength, quality: 5 }),
                  )
                : null;
        }
        const children = data.children.map(update);
        // Retain nodes/geometry while changing their authored display order.
        if (
            children.length !== node.children.length ||
            children.some((child, index) => child !== node.children[index])
        ) {
            node.removeChildren();
            if (children.length) node.addChild(...children);
        }
        return node;
    }
    function render() {
        if (!renderer) return;
        try {
            const wall = performance.timeOrigin + performance.now();
            const elapsed = playing
                ? Math.max(0, Math.min(100, wall - frameWall)) / 1000
                : 0;
            for (const record of nodes.values()) {
                if (record.motionY) {
                    record.node.y = record.y + record.motionY * elapsed;
                    record.node.visible =
                        record.motionMaxY === undefined ||
                        record.node.y <= record.motionMaxY;
                }
                if (record.motionX)
                    record.node.x = playing
                        ? projectHorizontalMotion(
                              record.x,
                              record.motionX,
                              wall,
                          )
                        : record.x;
            }
            renderer.render({ container: stage });
            if (framePending) {
                framePending = false;
                postMessage({ type: "frame" });
            }
            scheduleFrame(render);
        } catch (error) {
            reportFailure(error, "draw");
        }
    }
    return async ({ data }) => {
        if (data.type === "init") {
            // Warm scene pipes before initializing the explicit renderer.
            const warm = [
                new Graphics(),
                new Sprite(Texture.EMPTY),
                new Text({ text: "" }),
            ];
            renderer = new WebGLRenderer();
            await renderer.init({
                canvas: data.canvas,
                width: data.width,
                height: data.height,
                resolution: data.resolution,
                background: data.background,
                antialias: false,
                skipExtensionImports: true,
            });
            for (const node of warm) node.destroy();
            postMessage({ type: "ready" });
            scheduleFrame(render);
        } else if (data.type === "reset") reset();
        else if (data.type === "texture") {
            const previous = textures.get(data.id);
            const texture = Texture.from(data.bitmap);
            textures.set(data.id, texture);
            for (const record of nodes.values()) {
                if (record.textureId === data.id) record.node.texture = texture;
            }
            if (previous) {
                const bitmap = previous.source.resource;
                previous.destroy(true);
                bitmap?.close?.();
            }
        } else if (data.type === "scene") {
            const children = data.nodes.map(update);
            if (
                children.length !== stage.children.length ||
                children.some((child, index) => child !== stage.children[index])
            ) {
                stage.removeChildren();
                if (children.length) stage.addChild(...children);
            }
            frameWall = data.wall;
            playing = data.playing;
            framePending = true;
        }
    };
}
