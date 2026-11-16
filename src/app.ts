import {
    CanvasRenderer,
    Container,
    Ticker,
    UPDATE_PRIORITY,
    WebGLRenderer,
    WebGPURenderer,
} from "./vendor/pixi.js";
import { getSettings } from "./settings.ts";
import {
    getActiveRendererLabel,
    getRendererAttempts,
} from "./rendererSelection.ts";
import { initRenderThread, renderInWorker } from "./threads/renderClient.js";

// Minimal replacement for Pixi's Application. Application.init() picks a
// renderer with dynamic import(), which makes Vite emit a preload helper built
// on computed new URL()/import.meta.resolve. MOSS rejects that helper, so this
// app imports every renderer statically and selects one without code splitting.
export class NowApplication {
    stage = new Container();
    ticker = new Ticker();
    renderer = null;

    async init(options) {
        const requested = getSettings().renderer;
        const attempts = getRendererAttempts(requested);
        let lastError = null;

        for (let index = 0; index < attempts.length; index++) {
            const attempt = attempts[index];
            let candidate = null;
            try {
                if (attempt.kind === "webgpu") {
                    if (!navigator.gpu) {
                        throw new Error(
                            "WebGPU is not available in this browser",
                        );
                    }
                    candidate = new WebGPURenderer();
                } else if (attempt.kind === "canvas") {
                    candidate = new CanvasRenderer();
                } else {
                    candidate = new WebGLRenderer();
                }

                const initOptions = {
                    ...options,
                    skipExtensionImports: true,
                };
                if (attempt.kind === "webgl") {
                    initOptions.preferWebGLVersion = attempt.preferWebGLVersion;
                }
                await candidate.init(initOptions);

                if (
                    attempt.requireWebGLVersion &&
                    candidate.context?.webGLVersion !==
                        attempt.requireWebGLVersion
                ) {
                    throw new Error(
                        `WebGL ${attempt.requireWebGLVersion} context unavailable`,
                    );
                }

                this.renderer = candidate;
                if (index > 0) {
                    console.warn(
                        `Renderer "${requested}" unavailable; using ${getActiveRendererLabel(candidate)}.`,
                    );
                }
                break;
            } catch (error) {
                lastError = error;
                try {
                    candidate?.destroy();
                } catch {
                    // A failed renderer may not have completed initialization.
                }
                console.warn(
                    "Renderer attempt failed",
                    attempt.kind,
                    attempt.preferWebGLVersion || "",
                    error,
                );
            }
        }

        if (!this.renderer) {
            throw lastError || new Error("No renderer is available");
        }

        this.ticker.autoStart = true;
        this.ticker.add(this.render, this, UPDATE_PRIORITY.LOW);
        this.ticker.start();
    }

    render() {
        if (!this.renderer) return;
        if (renderInWorker(this)) return;
        this.renderer.render({ container: this.stage });
    }

    get canvas() {
        return this.renderer?.canvas;
    }
}

export { initRenderThread };
