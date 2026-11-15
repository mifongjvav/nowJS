import * as PIXI from "./vendor/pixi.js";
import { BlurFilter } from "./vendor/pixi.js";
import { MD3_COLORS, THEME_CHANGE_EVENT } from "./theme.ts";

const app = window.app;
const WIDTH = window.gameWidth;
const HEIGHT = window.gameHeight;
const SCALE = window.gameScale;

const line = new PIXI.Graphics();
line.x = 0;
line.y = HEIGHT - 160 * SCALE;

const glow = new PIXI.Graphics();
glow.filters = [
    new BlurFilter({
        strength: 10 * SCALE,
        quality: 5,
        kernelSize: 9,
    }),
];
glow.x = 0;
glow.y = line.y;

function drawJudgeLine(): void {
    line.clear();
    line.roundRect(0, -SCALE, WIDTH, 2 * SCALE, 5 * SCALE).fill({
        color: MD3_COLORS.onSurface,
        alpha: 0.82,
    });

    glow.clear();
    glow.roundRect(0, -4 * SCALE, WIDTH, 8 * SCALE, 5 * SCALE).fill({
        color: MD3_COLORS.primary,
        alpha: 0.28,
    });
}

drawJudgeLine();
window.addEventListener(THEME_CHANGE_EVENT, drawJudgeLine);

const layer = window.gameplayLayer || app.stage;
layer.addChildAt(glow, 0);
layer.addChildAt(line, 1);

window.judgeLine = line;
