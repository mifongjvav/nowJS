import * as PIXI from "./vendor/pixi.js";
import { BlurFilter } from "./vendor/pixi.js";
import { MD3_COLORS } from "./theme.ts";

const app = window.app;
const WIDTH = window.gameWidth;
const HEIGHT = window.gameHeight;
const SCALE = window.gameScale;

const playerW = 100 * SCALE;
const playerH = 20 * SCALE;

const player = new PIXI.Container();

const glow = new PIXI.Graphics();
glow.roundRect(
    -8 * SCALE,
    -8 * SCALE,
    playerW + 16 * SCALE,
    playerH + 16 * SCALE,
    12 * SCALE,
).fill({ color: MD3_COLORS.primary, alpha: 0.16 });
glow.filters = [
    new BlurFilter({
        strength: 8 * SCALE,
        quality: 5,
        kernelSize: 9,
    }),
];

const body = new PIXI.Graphics();
body.roundRect(0, 0, playerW, playerH, 5 * SCALE).fill(MD3_COLORS.onSurface);

const accent = new PIXI.Graphics();
accent.roundRect(0, playerH * 0.52, playerW, playerH * 0.48, 5 * SCALE).fill({
    color: MD3_COLORS.primary,
    alpha: 0.55,
});

const centerMark = new PIXI.Graphics();
centerMark
    .roundRect(
        playerW / 2 - 1.5 * SCALE,
        -4 * SCALE,
        3 * SCALE,
        playerH + 8 * SCALE,
        1.5 * SCALE,
    )
    .fill({ color: MD3_COLORS.primary, alpha: 0.9 });

const visual = new PIXI.Container();
visual.pivot.set(playerW / 2, playerH / 2);
visual.position.set(playerW / 2, playerH / 2);
visual.addChild(glow, body, accent, centerMark);

player.addChild(visual);
player.x = (WIDTH - playerW) / 2;
player.y = HEIGHT - 170 * SCALE;

const layer = window.gameplayLayer || app.stage;
layer.addChild(player);

window.player = player;
window.playerVisual = visual;
window.playerWidth = playerW;

function movePlayer(clientX) {
    if (window.gameState !== "playing" || window.isPaused) return;
    if (window.autoPlay) return;
    if (window.currentChart && window.currentChart.mania) return;

    const rect = app.canvas.getBoundingClientRect();
    if (!rect.width) return;
    const scaleX = WIDTH / rect.width;
    const xInGame = (clientX - rect.left) * scaleX;
    player.x = Math.min(WIDTH - playerW, Math.max(0, xInGame - playerW / 2));
}

window.addEventListener("pointermove", (event) => {
    movePlayer(event.clientX);
});

window.addEventListener(
    "touchmove",
    (event) => {
        if (event.touches.length > 0) {
            movePlayer(event.touches[0].clientX);
        }
    },
    { passive: true },
);
