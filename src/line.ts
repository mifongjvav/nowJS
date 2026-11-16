import * as PIXI from "./vendor/pixi.js";
import { BlurFilter } from "./vendor/pixi.js";
import { MD3_COLORS, THEME_CHANGE_EVENT } from "./theme.ts";
import { getSettings, onSettingsChange } from "./settings.ts";
import { getCatchPlayfield, getPlayfield } from "./layout.ts";

const app = window.app;
const HEIGHT = window.gameHeight;
const SCALE = window.gameScale;

const line = new PIXI.Graphics();
line.x = 0;
line.y = HEIGHT - 160 * SCALE;

const glow = new PIXI.Graphics();
const glowFilters = [
    new BlurFilter({
        strength: 10 * SCALE,
        quality: 5,
        kernelSize: 9,
    }),
];
glow.filters = getSettings().blur ? glowFilters : null;
onSettingsChange((settings) => {
    glow.filters = settings.blur ? glowFilters : null;
});
glow.x = 0;
glow.y = line.y;

export function refreshJudgeLine(): void {
    const field = window.currentChart?.mania
        ? getPlayfield()
        : getCatchPlayfield();
    line.clear();
    line.roundRect(field.left, -SCALE, field.width, 2 * SCALE, 5 * SCALE).fill({
        color: MD3_COLORS.onSurface,
        alpha: 0.82,
    });

    glow.clear();
    glow.roundRect(
        field.left,
        -4 * SCALE,
        field.width,
        8 * SCALE,
        5 * SCALE,
    ).fill({
        color: MD3_COLORS.primary,
        alpha: 0.28,
    });
}

refreshJudgeLine();
window.addEventListener(THEME_CHANGE_EVENT, refreshJudgeLine);

const layer = window.gameplayLayer || app.stage;
layer.addChildAt(glow, 0);
layer.addChildAt(line, 1);

window.judgeLine = line;
