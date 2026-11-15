import * as PIXI from "./vendor/pixi.js";
import { circlePool } from "./circlePool.ts";
import { getPlayfield } from "./layout.ts";
import { MD3_COLORS, THEME_CHANGE_EVENT } from "./theme.ts";
import type { ManiaChartInfo } from "./domain.ts";

const SCALE = window.gameScale;
const LANE_COUNT = 4;
const KEY_BINDINGS: Record<string, number> = {
    KeyD: 0,
    KeyF: 1,
    KeyJ: 2,
    KeyK: 3,
};
const KEY_LABELS = ["D", "F", "J", "K"];
const PLATE_HEIGHT = 20 * SCALE;
const AUTO_HOLD_WINDOW_MS = 45;

const field = getPlayfield();
const laneWidth = field.width / LANE_COUNT;
const plateWidth = Math.max(24 * SCALE, laneWidth - 8 * SCALE);
const plateY = window.player
    ? window.player.y
    : window.gameHeight - 170 * SCALE;
const judgeY = window.judgeLine
    ? window.judgeLine.y
    : window.gameHeight - 160 * SCALE;

const layer = new PIXI.Container();
layer.visible = false;

const guides = new PIXI.Graphics();
function drawGuides(): void {
    guides.clear();
    for (let lane = 1; lane < LANE_COUNT; lane++) {
        const x = field.left + laneWidth * lane;
        guides
            .rect(x - 0.5 * SCALE, 0, SCALE, judgeY)
            .fill({ color: MD3_COLORS.onSurface, alpha: 0.08 });
    }
}
drawGuides();
layer.addChild(guides);

interface LanePlate {
    lane: number;
    visual: PIXI.Container;
    glow: PIXI.Graphics;
    body: PIXI.Graphics;
    accent: PIXI.Graphics;
    label: PIXI.Text;
    pressed: boolean;
    pulse: number;
    press: number;
}

const plates: LanePlate[] = [];
const laneColors: Array<number | null> = Array.from(
    { length: LANE_COUNT },
    () => null,
);

for (let lane = 0; lane < LANE_COUNT; lane++) {
    const container = new PIXI.Container();
    container.x = field.left + laneWidth * lane + (laneWidth - plateWidth) / 2;
    container.y = plateY;

    const visual = new PIXI.Container();
    const glow = new PIXI.Graphics();
    glow.roundRect(
        -8 * SCALE,
        -8 * SCALE,
        plateWidth + 16 * SCALE,
        PLATE_HEIGHT + 16 * SCALE,
        12 * SCALE,
    ).fill({ color: MD3_COLORS.primary, alpha: 1 });

    const body = new PIXI.Graphics();
    body.roundRect(0, 0, plateWidth, PLATE_HEIGHT, 5 * SCALE).fill(
        MD3_COLORS.onSurface,
    );

    const accent = new PIXI.Graphics();
    accent
        .roundRect(
            0,
            PLATE_HEIGHT * 0.52,
            plateWidth,
            PLATE_HEIGHT * 0.48,
            5 * SCALE,
        )
        .fill({ color: MD3_COLORS.primary, alpha: 1 });

    visual.addChild(glow, body, accent);
    visual.pivot.set(plateWidth / 2, PLATE_HEIGHT / 2);
    visual.position.set(plateWidth / 2, PLATE_HEIGHT / 2);

    const label = new PIXI.Text({
        text: KEY_LABELS[lane],
        style: {
            fontSize: 20 * SCALE,
            fill: MD3_COLORS.onSurface,
            fontWeight: "700",
            letterSpacing: 1 * SCALE,
        },
    });
    label.anchor.set(0.5);
    label.x = plateWidth / 2;
    label.y = -24 * SCALE;

    container.addChild(visual, label);
    layer.addChild(container);
    plates.push({
        lane,
        visual,
        glow,
        body,
        accent,
        label,
        pressed: false,
        pulse: 0,
        press: 0,
    });
}

const gameplayLayer = window.gameplayLayer || window.app.stage;
const playerIndex = window.player
    ? gameplayLayer.getChildIndex(window.player)
    : -1;
gameplayLayer.addChildAt(
    layer,
    playerIndex >= 0
        ? playerIndex + 1
        : Math.min(2, gameplayLayer.children.length),
);

let maniaActive = false;

function drawPlateAccent(plate: LanePlate): void {
    const color = laneColors[plate.lane] ?? MD3_COLORS.primary;
    plate.accent.clear();
    plate.accent
        .roundRect(
            0,
            PLATE_HEIGHT * 0.52,
            plateWidth,
            PLATE_HEIGHT * 0.48,
            5 * SCALE,
        )
        .fill({ color, alpha: 1 });
}

function drawPlateBase(plate: LanePlate): void {
    plate.glow.clear();
    plate.glow
        .roundRect(
            -8 * SCALE,
            -8 * SCALE,
            plateWidth + 16 * SCALE,
            PLATE_HEIGHT + 16 * SCALE,
            12 * SCALE,
        )
        .fill({ color: MD3_COLORS.primary, alpha: 1 });

    plate.body.clear();
    plate.body
        .roundRect(0, 0, plateWidth, PLATE_HEIGHT, 5 * SCALE)
        .fill(MD3_COLORS.onSurface);

    plate.label.style.fill = MD3_COLORS.onSurface;
    drawPlateAccent(plate);
}

function drawAllPlates(): void {
    drawGuides();
    for (const plate of plates) {
        drawPlateBase(plate);
    }
}

function refreshLaneColors(): void {
    for (let lane = 0; lane < LANE_COUNT; lane++) {
        laneColors[lane] = null;
    }

    for (const note of window.currentChart?.notes || []) {
        if (
            typeof note.lane === "number" &&
            note.lane >= 0 &&
            note.lane < LANE_COUNT &&
            typeof note.color === "number" &&
            laneColors[note.lane] === null
        ) {
            laneColors[note.lane] = note.color;
        }
    }
}

drawAllPlates();
window.addEventListener(THEME_CHANGE_EVENT, drawAllPlates);

function applyPlateVisual(plate: LanePlate): void {
    const press = plate.press;
    plate.visual.position.y = PLATE_HEIGHT / 2 + press * 3 * SCALE;
    plate.visual.scale.set(1 + press * 0.035, 1 - press * 0.08);
    plate.glow.alpha = 0.14 + press * 0.6;
    plate.accent.alpha = 0.55 + press * 0.4;
    plate.label.alpha = 0.72 + press * 0.28;
}

function resetInput(): void {
    for (const plate of plates) {
        plate.pressed = false;
        plate.pulse = 0;
        plate.press = 0;
        applyPlateVisual(plate);
    }
}

export function setManiaMode(info: ManiaChartInfo | null): void {
    maniaActive = Boolean(info);
    layer.visible = maniaActive;
    if (window.player) {
        window.player.visible = !maniaActive;
    }

    if (maniaActive) {
        refreshLaneColors();
    } else {
        for (let lane = 0; lane < LANE_COUNT; lane++) {
            laneColors[lane] = null;
        }
    }

    drawAllPlates();
    resetInput();
}

export function resetManiaInput(): void {
    resetInput();
}

function getKeyboardLane(event: KeyboardEvent): number | null {
    const lane = KEY_BINDINGS[event.code];
    return lane === undefined ? null : lane;
}

window.addEventListener("keydown", (event) => {
    if (!maniaActive || event.repeat || event.isComposing) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const lane = getKeyboardLane(event);
    if (lane === null) return;
    if (window.gameState !== "playing" || window.isPaused) return;

    const tagName = document.activeElement
        ? document.activeElement.tagName
        : "";
    if (["INPUT", "TEXTAREA", "SELECT"].includes(tagName)) return;
    if (document.querySelector("mdui-dialog[open]")) return;

    plates[lane].pressed = true;

    // Auto play judges mania notes itself; keyboard input only drives the
    // plate feedback in that mode so it cannot steal or mistime notes.
    if (!window.autoPlay) {
        circlePool.pressLane(lane, window.chartTime);
    }
});

window.addEventListener("keyup", (event) => {
    const lane = getKeyboardLane(event);
    if (lane === null) return;

    if (plates[lane]) {
        plates[lane].pressed = false;
    }

    if (
        maniaActive &&
        !window.autoPlay &&
        window.gameState === "playing" &&
        !window.isPaused
    ) {
        circlePool.releaseLane(lane, window.chartTime);
    }
});

window.addEventListener("blur", () => {
    resetInput();
});

export function updateManiaLogic(chartTime: number): void {
    if (!maniaActive) return;

    const playing = window.gameState === "playing" && !window.isPaused;
    const autoPlay = playing && window.autoPlay;

    if (playing) {
        for (const circle of circlePool.activeCircles) {
            const lane = circle.note ? circle.note.lane : undefined;
            if (typeof lane !== "number" || lane < 0 || lane >= LANE_COUNT) {
                continue;
            }
            if (circle.holdActive) {
                plates[lane].pulse = 1;
                continue;
            }
            if (!autoPlay) continue;

            const delta = chartTime - circle.noteTime;
            if (Math.abs(delta) <= AUTO_HOLD_WINDOW_MS) {
                plates[lane].pulse = 1;
            }
        }
    }
}

export function updateMania(deltaMS: number): void {
    if (!maniaActive) return;
    const playing = window.gameState === "playing" && !window.isPaused;
    const deltaSeconds = Math.min(Math.max(deltaMS, 0), 100) / 1000;

    for (const plate of plates) {
        plate.pulse = Math.max(0, plate.pulse - deltaSeconds * 5);

        const target = playing
            ? Math.max(plate.pressed ? 1 : 0, plate.pulse)
            : 0;
        const blend = Math.min(1, deltaSeconds * 24);
        plate.press += (target - plate.press) * blend;
        applyPlateVisual(plate);
    }
}
