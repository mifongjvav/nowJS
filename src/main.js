import * as PIXI from "pixi.js";

const WIDTH = 1280;
const HEIGHT = 720;

window.app = new PIXI.Application();

await window.app.init({
    width: WIDTH,
    height: HEIGHT,
    resolution: window.devicePixelRatio || 2,
    autoDensity: true,
    antialias: true,
    preference: "webgpu",
    background: 0x333333,
});

// 设置 body 样式，防止溢出
document.body.style.margin = "0";
document.body.style.padding = "0";
document.body.style.overflow = "hidden";
document.body.style.position = "relative";

document.body.appendChild(window.app.view);

// 设置 canvas 样式
window.app.view.style.position = "absolute";
window.app.view.style.display = "block";

function resize() {
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const scale = Math.min(winW / WIDTH, winH / HEIGHT);

    const scaledWidth = WIDTH * scale;
    const scaledHeight = HEIGHT * scale;

    window.app.view.style.width = `${scaledWidth}px`;
    window.app.view.style.height = `${scaledHeight}px`;
    window.app.view.style.left = `${(winW - scaledWidth) / 2}px`;
    window.app.view.style.top = `${(winH - scaledHeight) / 2}px`;
}

window.addEventListener("resize", resize);
resize();

import("./player.js");
import("./line.js")
import("./circle.js")