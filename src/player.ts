import * as PIXI from "./vendor/pixi.js";
import { BlurFilter } from "./vendor/pixi.js";
import { MD3_COLORS, THEME_CHANGE_EVENT } from "./theme.ts";
import { getSettings, onSettingsChange } from "./settings.ts";
import { routeInput } from "./threads/inputClient.ts";
import { sendLogicInput } from "./threads/logicClient.ts";
import { getCatchPlayerRange } from "./layout.ts";

const app = window.app;
const WIDTH = window.gameWidth;
const HEIGHT = window.gameHeight;
const SCALE = window.gameScale;

const playerW = 100 * SCALE;
const playerH = 20 * SCALE;

const player = new PIXI.Container();

const glow = new PIXI.Graphics();
const glowFilters = [
    new BlurFilter({
        strength: 8 * SCALE,
        quality: 5,
        kernelSize: 9,
    }),
];
glow.filters = getSettings().blur ? glowFilters : null;
onSettingsChange((settings) => {
    glow.filters = settings.blur ? glowFilters : null;
});

const body = new PIXI.Graphics();
const accent = new PIXI.Graphics();
const centerMark = new PIXI.Graphics();

let catcherColor: number | null = null;

function drawPlayer(): void {
    const accentColor = catcherColor ?? MD3_COLORS.primary;

    glow.clear();
    glow.roundRect(
        -8 * SCALE,
        -8 * SCALE,
        playerW + 16 * SCALE,
        playerH + 16 * SCALE,
        12 * SCALE,
    ).fill({ color: MD3_COLORS.primary, alpha: 0.16 });

    body.clear();
    body.roundRect(0, 0, playerW, playerH, 5 * SCALE).fill(
        MD3_COLORS.onSurface,
    );

    accent.clear();
    accent
        .roundRect(0, playerH * 0.52, playerW, playerH * 0.48, 5 * SCALE)
        .fill({
            color: accentColor,
            alpha: 0.88,
        });

    centerMark.clear();
    centerMark
        .roundRect(
            playerW / 2 - 1.5 * SCALE,
            -4 * SCALE,
            3 * SCALE,
            playerH + 8 * SCALE,
            1.5 * SCALE,
        )
        .fill({ color: MD3_COLORS.primary, alpha: 0.9 });
}

export function setCatcherColor(color: number | null): void {
    const next = typeof color === "number" ? color : null;
    if (next === catcherColor) return;
    catcherColor = next;
    drawPlayer();
}

export function resetCatcherColor(): void {
    setCatcherColor(null);
}

drawPlayer();
window.addEventListener(THEME_CHANGE_EVENT, drawPlayer);

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
    const range = getCatchPlayerRange(playerW);
    routeInput(
        {
            kind: "pointer",
            clientX,
            left: rect.left,
            cssWidth: rect.width,
            width: WIDTH,
            playerWidth: playerW,
            minX: range.minX,
            maxX: range.maxX,
            stamp: performance.timeOrigin + performance.now(),
        },
        (input) => {
            if (
                input.kind !== "pointer" ||
                window.gameState !== "playing" ||
                window.isPaused ||
                window.autoPlay
            )
                return;
            if (!sendLogicInput(input)) player.x = input.x;
        },
    );
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
