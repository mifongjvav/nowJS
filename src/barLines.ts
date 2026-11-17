import * as PIXI from "./vendor/pixi.js";
import { getCatchPlayfield, getPlayfield } from "./layout.ts";
import { MD3_COLORS, THEME_CHANGE_EVENT } from "./theme.ts";
import { ManiaBarLineTimeline } from "./maniaTiming.ts";
import type { GameChart } from "./domain.ts";

const scale = window.gameScale;
const judgeY = window.judgeLine?.y ?? window.gameHeight - 160 * scale;
const layer = new PIXI.Container();
layer.label = "gameplay-bar-lines";
layer.visible = false;
const gameplayLayer = window.gameplayLayer || window.app.stage;
gameplayLayer.addChildAt(layer, 0);

interface BarLineVisual {
    graphic: PIXI.Graphics & { scrollSpeedY?: number; scrollMaxY?: number };
    major: boolean;
}
const pool: BarLineVisual[] = [];
let chart: GameChart | null = null;
let timeline: ManiaBarLineTimeline | null = null;

function draw(line: BarLineVisual): void {
    const field = chart?.mania ? getPlayfield() : getCatchPlayfield();
    const height = (line.major ? 1.7 : 1.2) * scale;
    line.graphic
        .clear()
        .rect(field.left, -height / 2, field.width, height)
        .fill({ color: MD3_COLORS.onSurface, alpha: line.major ? 0.32 : 0.18 });
}

export function setBarLineChart(next: GameChart | null): void {
    chart = next;
    timeline = chart?.notes.length
        ? new ManiaBarLineTimeline(
              chart.timingPoints ?? [],
              chart.firstNoteTime,
              chart.lastNoteTime,
          )
        : null;
    layer.visible = false;
    for (const line of pool) {
        line.graphic.visible = false;
        line.graphic.scrollSpeedY = 0;
        draw(line);
    }
}

export function renderBarLines(time: number, moving = true): void {
    if (
        !chart ||
        !timeline ||
        !Number.isFinite(time) ||
        !(chart.fallSpeed > 0)
    ) {
        layer.visible = false;
        return;
    }
    layer.visible = true;
    const lines = timeline.between(
        time,
        time + (judgeY / chart.fallSpeed) * 1000,
    );
    for (let index = 0; index < lines.length; index++) {
        const data = lines[index];
        let line = pool[index];
        if (!line) {
            line = { graphic: new PIXI.Graphics(), major: data.major };
            line.graphic.label = "gameplay-bar-line";
            pool.push(line);
            layer.addChild(line.graphic);
            draw(line);
        } else if (line.major !== data.major) {
            line.major = data.major;
            draw(line);
        }
        line.graphic.visible = true;
        line.graphic.y = judgeY - ((data.time - time) / 1000) * chart.fallSpeed;
        line.graphic.scrollSpeedY = moving ? chart.fallSpeed : 0;
        line.graphic.scrollMaxY = judgeY;
    }
    for (let index = lines.length; index < pool.length; index++) {
        pool[index].graphic.visible = false;
        pool[index].graphic.scrollSpeedY = 0;
    }
}

window.addEventListener(THEME_CHANGE_EVENT, () => {
    for (const line of pool) draw(line);
});
