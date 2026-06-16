import * as PIXI from "pixi.js";

const app = window.app;
const WIDTH = window.gameWidth;
const HEIGHT = window.gameHeight;
const SCALE = window.gameScale;

const overlay = new PIXI.Graphics();
overlay.beginFill(0x000000, 0.85);
overlay.drawRect(0, 0, WIDTH, HEIGHT);
overlay.endFill();
app.stage.addChild(overlay);
window._overlay = overlay;

const loadingText = new PIXI.Text({
    text: "加载中...",
    style: { fontSize: 48 * SCALE, fill: 0xffffff, fontWeight: "bold" },
});
loadingText.anchor.set(0.5);
loadingText.x = WIDTH / 2;
loadingText.y = HEIGHT / 2;
app.stage.addChild(loadingText);
window._loadingText = loadingText;

const startText = new PIXI.Text({
    text: "点击屏幕开始",
    style: { fontSize: 48 * SCALE, fill: 0xffffff, fontWeight: "bold" },
});
startText.anchor.set(0.5);
startText.x = WIDTH / 2;
startText.y = HEIGHT / 2;
startText.visible = false;
app.stage.addChild(startText);
window._startText = startText;

export function showOverlay() {
    overlay.visible = true;
}

export function hideOverlay() {
    overlay.visible = false;
}

export function hideStartText() {
    startText.visible = false;
}

export function showReady() {
    loadingText.visible = false;
    startText.visible = true;
}

let dotFrame = 0;
export function updateLoadingText() {
    if (startText.visible) return;
    dotFrame++;
    if (dotFrame % 30 !== 0) return;
    const dots = ".".repeat(((dotFrame / 30) % 3) + 1);
    loadingText.text = `加载中${dots}`;
}
