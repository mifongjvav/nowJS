import {
    Application,
    Container,
    Graphics,
    Sprite,
    Text,
    Texture,
} from "./vendor/pixi.js";
import { setTheme } from "./vendor/mdui.js";
import { showResolutionSelector } from "./resolution.ts";
import { MD3_COLORS } from "./theme.ts";
import { initI18n } from "./i18n/index.ts";

setTheme("dark");
await initI18n();

const resolution = await showResolutionSelector();
const WIDTH = resolution.width;
const HEIGHT = resolution.height;

window.gameWidth = WIDTH;
window.gameHeight = HEIGHT;
window.gameScale = HEIGHT / 720;

window.app = new Application();

// Pixi registers render pipes when their scene modules are first imported.
// The gameplay modules are loaded after the renderer initializes, so make sure
// the graphics/text/sprite pipes exist before creating the renderer.
const pipeWarmup = new Container();
pipeWarmup.visible = false;
pipeWarmup.addChild(new Sprite(Texture.EMPTY));
pipeWarmup.addChild(new Graphics().circle(0, 0, 1).fill(0xffffff));
pipeWarmup.addChild(new Text({ text: "", style: { fontSize: 8 } }));
window.app.stage.addChild(pipeWarmup);

let resolutionSetting = window.devicePixelRatio || 1;
if (WIDTH >= 2560) {
    resolutionSetting = 0.75;
} else if (WIDTH >= 1920) {
    resolutionSetting = 1;
} else {
    resolutionSetting = Math.min(resolutionSetting, 1.5);
}

await window.app.init({
    width: WIDTH,
    height: HEIGHT,
    resolution: resolutionSetting,
    autoDensity: false,
    antialias: WIDTH < 1920,
    preference: "webgpu",
    background: MD3_COLORS.surface,
});

// Preserve the browser's native context menu on the canvas (including image
// save/copy actions); game controls are driven by window-level listeners.
window.app.renderer.events.autoPreventDefault = false;

document.body.style.margin = "0";
document.body.style.padding = "0";
document.body.style.overflow = "hidden";
document.body.style.position = "relative";
document.body.style.background = "#0b1416";

document.body.appendChild(window.app.canvas);

window.app.canvas.style.position = "absolute";
window.app.canvas.style.display = "block";
window.app.canvas.style.zIndex = "1";

window.bgLayer = new Container();
window.gameplayLayer = new Container();
window.storyboardLayer = new Container();
window.statsLayer = new Container();
window.app.stage.addChild(window.bgLayer);
window.app.stage.addChild(window.gameplayLayer);
window.app.stage.addChild(window.storyboardLayer);
window.app.stage.addChild(window.statsLayer);

function resize() {
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const scale = Math.min(winW / WIDTH, winH / HEIGHT);

    const scaledWidth = WIDTH * scale;
    const scaledHeight = HEIGHT * scale;

    window.app.canvas.style.width = `${scaledWidth}px`;
    window.app.canvas.style.height = `${scaledHeight}px`;
    window.app.canvas.style.left = `${(winW - scaledWidth) / 2}px`;
    window.app.canvas.style.top = `${(winH - scaledHeight) / 2}px`;
}

window.addEventListener("resize", resize);
resize();

window.gameState = "menu";
window.isPaused = false;
window.gameplayLayer.visible = false;
window.statsLayer.visible = false;
window.currentChart = null;

await import("./player.ts");
await import("./line.ts");
await import("./circlePool.ts");
await import("./stats.ts");
await import("./ui.ts");
const songSelect = await import("./songSelect.ts");
await import("./gameLoop.ts");

const boot = document.getElementById("boot-splash");
if (boot) boot.remove();

if ("serviceWorker" in navigator) {
    navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}sw.js`)
        .catch(() => {
            // 离线缓存不可用时不影响正常游玩
        });
}

songSelect.showPresetMenu();
