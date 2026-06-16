import * as PIXI from "pixi.js";

const app = window.app;
const WIDTH = window.gameWidth;
const HEIGHT = window.gameHeight;
const SCALE = window.gameScale;

const playerW = 100 * SCALE;
const playerH = 20 * SCALE;

const player = new PIXI.Graphics();
player.beginFill(0xffffff);
player.roundRect(0, 0, playerW, playerH, 5 * SCALE);
player.endFill();
player.x = (WIDTH - playerW) / 2;
player.y = HEIGHT - 170 * SCALE;
app.stage.addChild(player);

window.player = player;

window.addEventListener("mousemove", (e) => {
    if (window.gameState !== "playing" || window.isPaused) return;

    const rect = app.canvas.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    let mouseXInGame = (e.clientX - rect.left) * scaleX;
    player.x = Math.min(
        WIDTH - playerW,
        Math.max(0, mouseXInGame - playerW / 2),
    );
});
