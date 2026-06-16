import * as PIXI from "pixi.js";
import { showResolutionSelector } from "./resolution.js";

const resolution = await showResolutionSelector();
const WIDTH = resolution.width;
const HEIGHT = resolution.height;

window.gameWidth = WIDTH;
window.gameHeight = HEIGHT;
window.gameScale = HEIGHT / 720;

window.app = new PIXI.Application();

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
    background: 0x333333,
});

document.body.style.margin = "0";
document.body.style.padding = "0";
document.body.style.overflow = "hidden";
document.body.style.position = "relative";

document.body.appendChild(window.app.canvas);

window.app.canvas.style.position = "absolute";
window.app.canvas.style.display = "block";

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

import("./player.js");
import("./line.js");
import("./audio.js");
import("./circlePool.js");
import("./stats.js");
import("./ui.js");
import("./gameLoop.js");

window.gameState = "waiting";
window.isPaused = false;

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js");
}
