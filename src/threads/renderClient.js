import { getSettings, onSettingsChange } from "../settings.ts";
import { openWorker, setThreadStatus } from "./status.ts";
import { describeWorkerError } from "./workerRuntime.js";
let connection = null,
    canvas = null,
    app = null,
    ready = false,
    active = false,
    inFlight = false,
    generation = 0;
let ids = new WeakMap(),
    resources = new WeakMap(),
    nextId = 0,
    lastChart;
let frameTimeout = null;
const graphicsCache = new WeakMap();
function serializeGraphics(context) {
    let cache = graphicsCache.get(context);
    if (!cache) {
        cache = { dirty: true, json: "" };
        graphicsCache.set(context, cache);
        context.on("update", () => {
            cache.dirty = true;
        });
    }
    if (!cache.dirty) return cache.json;
    cache.json = JSON.stringify(
        context.instructions.map((instruction) => {
            if (
                instruction.action !== "fill" &&
                instruction.action !== "stroke"
            )
                throw new Error(
                    `Unsupported graphics instruction ${instruction.action}`,
                );
            const { style, path } = instruction.data;
            return {
                action: instruction.action,
                style: {
                    color: style.color,
                    alpha: style.alpha,
                    width: style.width,
                    alignment: style.alignment,
                    cap: style.cap,
                    join: style.join,
                    miterLimit: style.miterLimit,
                },
                path: path.instructions,
            };
        }),
    );
    cache.dirty = false;
    return cache.json;
}
const idFor = (object) => {
    let id = ids.get(object);
    if (!id) {
        id = ++nextId;
        ids.set(object, id);
    }
    return id;
};
function stop() {
    clearTimeout(frameTimeout);
    ready = false;
    active = false;
    inFlight = false;
    connection?.close();
    connection = null;
    canvas?.remove();
    canvas = null;
    if (app?.canvas) app.canvas.style.opacity = "";
    ids = new WeakMap();
    resources = new WeakMap();
    nextId = 0;
}
async function configure(enabled) {
    const token = ++generation;
    stop();
    if (!enabled || !app) {
        setThreadStatus("render", "off");
        return;
    }
    setThreadStatus("render", "starting");
    try {
        if (
            !HTMLCanvasElement.prototype.transferControlToOffscreen ||
            typeof createImageBitmap !== "function"
        )
            throw new Error("OffscreenCanvas/ImageBitmap unavailable");
        canvas = document.createElement("canvas");
        canvas.id = "now-thread-canvas";
        canvas.setAttribute("aria-hidden", "true");
        canvas.style.cssText = app.canvas.style.cssText;
        canvas.style.opacity = "0";
        canvas.style.pointerEvents = "auto";
        app.canvas.after(canvas);
        const offscreen = canvas.transferControlToOffscreen();
        const next = openWorker(
            () =>
                new Worker(new URL("./render.worker.js", import.meta.url), {
                    type: "module",
                }),
            (data) => {
                if (token !== generation) return;
                if (data.type === "frame") {
                    clearTimeout(frameTimeout);
                    inFlight = false;
                    if (!active) {
                        active = true;
                        canvas.style.opacity = "1";
                        app.canvas.style.opacity = "0";
                        setThreadStatus("render", "active");
                    }
                }
            },
            (reason) => {
                if (token === generation) {
                    stop();
                    setThreadStatus("render", "fallback", reason);
                }
            },
            (worker) => {
                worker.postMessage(
                    {
                        type: "init",
                        canvas: offscreen,
                        width: window.gameWidth,
                        height: window.gameHeight,
                        resolution: app.renderer.resolution,
                        background: 0x0b1416,
                    },
                    [offscreen],
                );
            },
        );
        connection = next;
        await next.ready;
        if (token !== generation) return;
        ready = true;
        lastChart = undefined;
    } catch (error) {
        if (token === generation) {
            stop();
            setThreadStatus("render", "fallback", describeWorkerError(error));
        }
    }
}
async function textureId(texture) {
    const source = texture.source;
    if (!source || texture === app.emptyTexture) return 0;
    const resource = source.resource;
    const video =
        typeof HTMLVideoElement !== "undefined" &&
        resource instanceof HTMLVideoElement;
    let entry = resources.get(source);
    if (entry && !video) return entry.id;
    if (entry && video && entry.frameTime === resource.currentTime)
        return entry.id;
    if (entry?.pending) return entry.id;
    if (!entry) {
        entry = { id: idFor(source), pending: false };
        resources.set(source, entry);
    }
    if (video && resource.readyState < 2) return entry.id;
    entry.pending = true;
    const token = generation;
    try {
        // GPU-generated background blur is a one-time prepared texture; scene
        // drawing, texture uploads, filters and presentation run in the worker.
        const image =
            resource || app.renderer.extract.canvas({ target: texture });
        const bitmap = await createImageBitmap(image);
        if (token !== generation || !connection) {
            bitmap.close();
            return 0;
        }
        connection.worker.postMessage(
            { type: "texture", id: entry.id, bitmap },
            [bitmap],
        );
        if (video) entry.frameTime = resource.currentTime;
    } finally {
        entry.pending = false;
    }
    return entry.id;
}
async function snapshot(node) {
    if (!node.visible || node.alpha <= 0 || node.renderable === false)
        return null;
    const data = {
        id: idFor(node),
        kind: "container",
        transform: [
            node.x,
            node.y,
            node.scale.x,
            node.scale.y,
            node.rotation,
            node.pivot.x,
            node.pivot.y,
            node.skew.x,
            node.skew.y,
        ],
        alpha: node.alpha,
        tint: node.tint ?? 0xffffff,
        blendMode: node.blendMode || "normal",
        blur: (node.filters || [])
            .filter((f) => "strength" in f)
            .map((f) => f.strength),
        children: [],
    };
    if (node.catchMotion) data.motionX = node.catchMotion;
    if (node.context?.instructions) {
        data.kind = "graphics";
        data.motionY =
            node.active && node.note && !node.holdActive ? node.fallSpeed : 0;
        data.graphics = serializeGraphics(node.context);
    } else if (typeof node.text === "string" && node.style) {
        data.kind = "text";
        data.text = node.text;
        const style = node.style;
        data.style = {
            fontFamily: style.fontFamily,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            fontStyle: style.fontStyle,
            fill: style.fill,
            align: style.align,
            letterSpacing: style.letterSpacing,
            lineHeight: style.lineHeight,
        };
        data.anchor = [node.anchor.x, node.anchor.y];
    } else if (node.texture?.source) {
        data.kind = "sprite";
        data.texture = await textureId(node.texture);
        data.anchor = [node.anchor.x, node.anchor.y];
    }
    if (node.sortableChildren) node.sortChildren();
    for (const child of node.children || []) {
        const value = await snapshot(child);
        if (value) data.children.push(value);
    }
    return data;
}
export function renderInWorker(application) {
    if (!ready || !connection || !canvas) return false;
    // Only one scene in flight: never queue an unbounded stream of old frames.
    if (!inFlight) {
        inFlight = true;
        const token = generation,
            target = connection;
        frameTimeout = setTimeout(() => {
            if (token !== generation || !inFlight) return;
            stop();
            setThreadStatus(
                "render",
                "fallback",
                "Render worker frame timed out",
            );
        }, 10000);
        if (lastChart !== window.currentChart) {
            lastChart = window.currentChart;
            resources = new WeakMap();
            target.worker.postMessage({ type: "reset" });
        }
        canvas.style.width = application.canvas.style.width;
        canvas.style.height = application.canvas.style.height;
        canvas.style.left = application.canvas.style.left;
        canvas.style.top = application.canvas.style.top;
        void snapshot(application.stage)
            .then((scene) => {
                if (token !== generation || !connection) return;
                target.worker.postMessage({
                    type: "scene",
                    nodes: scene?.children || [],
                    wall: performance.timeOrigin + performance.now(),
                    playing: window.gameState === "playing" && !window.isPaused,
                });
            })
            .catch((error) => {
                if (token === generation) {
                    stop();
                    setThreadStatus("render", "fallback", String(error));
                }
            });
    }
    return active;
}
export function initRenderThread(application) {
    app = application;
    void configure(getSettings().multithreading);
}
let enabled = getSettings().multithreading;
onSettingsChange((settings) => {
    if (enabled !== settings.multithreading) {
        enabled = settings.multithreading;
        void configure(enabled);
    }
});
