import {
    CanvasRenderer,
    Container,
    Ticker,
    UPDATE_PRIORITY,
    WebGLRenderer,
    isWebGLSupported,
} from "./vendor/pixi.js";

// Minimal replacement for Pixi's Application. Application.init() picks a
// renderer with dynamic import(), which makes Vite emit a preload helper built
// on computed new URL()/import.meta.resolve. MOSS rejects that helper, so this
// app imports both renderers statically and chooses one without code splitting.
export class NowApplication {
    stage = new Container();
    ticker = new Ticker();
    renderer;

    constructor() {
        this.renderer = isWebGLSupported()
            ? new WebGLRenderer()
            : new CanvasRenderer();
    }

    async init(options) {
        await this.renderer.init({
            ...options,
            // All required environment extensions are imported by vendor/pixi.js.
            skipExtensionImports: true,
        });
        this.ticker.autoStart = true;
        this.ticker.add(this.render, this, UPDATE_PRIORITY.LOW);
        this.ticker.start();
    }

    render() {
        this.renderer.render({ container: this.stage });
    }

    get canvas() {
        return this.renderer.canvas;
    }
}
