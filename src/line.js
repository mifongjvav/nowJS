import * as PIXI from "./vendor/pixi.js";
import { BlurFilter } from "./vendor/pixi.js";
import { MD3_COLORS } from "./theme.js";

const app = window.app;
const WIDTH = window.gameWidth;
const HEIGHT = window.gameHeight;
const SCALE = window.gameScale;

const line = new PIXI.Graphics();
line.roundRect(0, -SCALE, WIDTH, 2 * SCALE, 5 * SCALE).fill({
    color: MD3_COLORS.onSurface,
    alpha: 0.82,
});
line.x = 0;
line.y = HEIGHT - 160 * SCALE;

const glow = new PIXI.Graphics();
glow.roundRect(0, -4 * SCALE, WIDTH, 8 * SCALE, 5 * SCALE).fill({
    color: MD3_COLORS.primary,
    alpha: 0.28,
});
glow.filters = [
    new BlurFilter({
        strength: 10 * SCALE,
        quality: 5,
        kernelSize: 9,
    }),
];
glow.x = 0;
glow.y = line.y;

const layer = window.gameplayLayer || app.stage;
layer.addChildAt(glow, 0);
layer.addChildAt(line, 1);

window.judgeLine = line;
