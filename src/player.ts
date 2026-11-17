import * as PIXI from "./vendor/pixi.js";
import { BlurFilter } from "./vendor/pixi.js";
import { MD3_COLORS, THEME_CHANGE_EVENT } from "./theme.ts";
import { getSettings, onSettingsChange } from "./settings.ts";
import { routeInput } from "./threads/inputClient.ts";
import { logicThread, sendLogicInput } from "./threads/logicClient.ts";
import { getCatchPlayerRange, getCatchPlayfield } from "./layout.ts";
import {
    CatchMovement,
    CATCH_HYPER_COLOR,
    assignHyperDashTargets,
    CATCH_WALK_SPEED,
    CATCH_DASH_SPEED,
} from "./catchMovement.ts";
import {
    getCatchSizeScale,
    getCatchPlayerWidthOsu,
} from "./catchDifficulty.ts";
import type { GameChart } from "./domain.ts";
import type {
    CatchAction,
    CatchMovementNote,
    CatchMovementState,
} from "./catchMovement.ts";
import { getCatchControls, onCatchControlsChange } from "./catchControls.ts";
import { CatchPresentation } from "./catchPresentation.ts";
import type {
    HorizontalMotion,
    HorizontalMotionBounds,
} from "./catchPresentation.ts";

const app = window.app;
const WIDTH = window.gameWidth;
const HEIGHT = window.gameHeight;
const SCALE = window.gameScale;

let playerW = 100 * SCALE;
const playerH = 20 * SCALE;
const catchMovement = new CatchMovement();
const catchPresentation = new CatchPresentation();
const heldActions = new Set<CatchAction>();
let lastEffect = "";

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
    const accentColor = catchMovement.state.hyper
        ? CATCH_HYPER_COLOR
        : (catcherColor ?? MD3_COLORS.primary);

    glow.clear();
    glow.roundRect(
        -8 * SCALE,
        -8 * SCALE,
        playerW + 16 * SCALE,
        playerH + 16 * SCALE,
        12 * SCALE,
    ).fill({
        color: accentColor,
        alpha:
            catchMovement.state.dash || catchMovement.state.hyper ? 0.35 : 0.16,
    });

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
        .fill({ color: accentColor, alpha: 0.9 });
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

const visual = new PIXI.Container() as PIXI.Container & {
    catchMotion?: HorizontalMotion;
};
visual.pivot.set(playerW / 2, playerH / 2);
visual.position.set(playerW / 2, playerH / 2);
visual.addChild(glow, body, accent, centerMark);

player.addChild(visual);
player.x = (WIDTH - playerW) / 2;
player.y = HEIGHT - 170 * SCALE;

const layer = window.gameplayLayer || app.stage;
const trailLayer = new PIXI.Container();
trailLayer.label = "catch-dash-trail";
const dashGhosts = Array.from({ length: 12 }, () => {
    const graphic = new PIXI.Graphics()
        .roundRect(0, 0, playerW, playerH, 5 * SCALE)
        .fill(0xffffff);
    graphic.visible = false;
    trailLayer.addChild(graphic);
    return { graphic, age: 200 };
});
layer.addChild(trailLayer);
layer.addChild(player);

window.player = player;
window.playerVisual = visual;
window.playerWidth = playerW;
catchPresentation.reset(player.x, performance.timeOrigin + performance.now());

export function configureCatchChart(chart: GameChart) {
    const factor = chart.mania
        ? 1
        : getCatchSizeScale(chart.difficulty?.circleSize);
    const center = player.x + playerW / 2;
    playerW = 100 * SCALE * factor;
    window.playerWidth = playerW;
    visual.pivot.set(playerW / 2, playerH / 2);
    visual.position.set(playerW / 2, playerH / 2);
    delete visual.catchMotion;
    const range = getCatchPlayerRange(playerW);
    player.x = Math.max(range.minX, Math.min(range.maxX, center - playerW / 2));
    catchPresentation.reset(
        player.x,
        performance.timeOrigin + performance.now(),
    );
    for (const ghost of dashGhosts) {
        ghost.graphic
            .clear()
            .roundRect(0, 0, playerW, playerH, 5 * SCALE)
            .fill(0xffffff);
        ghost.graphic.visible = false;
        ghost.age = 200;
    }
    drawPlayer();
    if (!chart.mania) {
        assignHyperDashTargets(
            chart.notes,
            getCatchPlayerWidthOsu(chart.difficulty?.circleSize),
            getCatchControls().speed,
        );
    }
}

function movePlayer(clientX) {
    if (window.gameState !== "playing" || window.isPaused) return;
    if (window.autoPlay) return;
    if (window.currentChart && window.currentChart.mania) return;
    if (getCatchControls().mode !== "pointer") return;

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
                window.autoPlay ||
                window.currentChart?.mania ||
                getCatchControls().mode !== "pointer"
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

function applyHeldKeys() {
    catchPresentation.input(
        getCatchMotion(),
        performance.timeOrigin + performance.now(),
    );
    for (const action of ["left", "right", "dash"] as const) {
        catchMovement.state[action] = heldActions.has(action);
    }
    sendLogicInput({
        kind: "catch",
        left: catchMovement.state.left,
        right: catchMovement.state.right,
        dash: catchMovement.state.dash,
        stamp: performance.timeOrigin + performance.now(),
    });
}

export function releaseCatchKeys() {
    heldActions.clear();
    applyHeldKeys();
}

export function resetCatchMovement() {
    releaseCatchKeys();
    catchMovement.reset();
    catchPresentation.reset(
        player.x,
        performance.timeOrigin + performance.now(),
    );
    visual.x = playerW / 2;
    delete visual.catchMotion;
    for (const ghost of dashGhosts) {
        ghost.age = 200;
        ghost.graphic.visible = false;
    }
    lastTrailX = player.x;
    drawPlayer();
}

export function getCatchMovementState() {
    return catchMovement.snapshot();
}
export function syncCatchMovementState(state: CatchMovementState) {
    // Worker snapshots may predate a key press. Only accept its authoritative
    // hyperdash state; the main thread still owns the physically held keys.
    catchMovement.state.hyper = state.hyper ? { ...state.hyper } : null;
}

export function recordCatchPosition(wall: number) {
    catchPresentation.sample(player.x, wall);
}

function getCatchMotion(): HorizontalMotionBounds {
    const field = getCatchPlayfield();
    const state = catchMovement.state;
    const direction = Number(state.right) - Number(state.left);
    const velocity =
        (direction *
            (state.dash ? CATCH_DASH_SPEED : CATCH_WALK_SPEED) *
            getCatchControls().speed *
            (state.hyper?.multiplier ?? 1) *
            field.width) /
        512;
    const range = getCatchPlayerRange(playerW);
    return {
        velocity,
        minX: range.minX,
        maxX: range.maxX,
        ...(state.hyper
            ? {
                  stopX:
                      field.left +
                      (state.hyper.x / 512) * field.width -
                      playerW / 2,
              }
            : {}),
    };
}

export function renderCatchPlayer(playing: boolean) {
    const wall = performance.timeOrigin + performance.now();
    if (
        !playing ||
        window.autoPlay ||
        window.currentChart?.mania ||
        getCatchControls().mode !== "keyboard"
    ) {
        visual.x = playerW / 2;
        delete visual.catchMotion;
        catchPresentation.reset(player.x, wall);
        return;
    }
    const motion = getCatchMotion();
    const frame = catchPresentation.frame(motion, wall);
    const offset = playerW / 2 - player.x;
    visual.x = frame.x + offset;
    // Animate the visual child only: the parent remains the authoritative
    // position used for collisions, even when the worker renders extra frames.
    visual.catchMotion = {
        ...motion,
        wall,
        maxMs: frame.remainingMs,
        minX: motion.minX + offset,
        maxX: motion.maxX + offset,
        ...(motion.stopX !== undefined ? { stopX: motion.stopX + offset } : {}),
    };
}

export function judgeCatchNote(note: CatchMovementNote, hit: boolean) {
    if (logicThread.running || window.currentChart?.mania || window.autoPlay)
        return;
    const field = getCatchPlayfield();
    const center = ((player.x + playerW / 2 - field.left) / field.width) * 512;
    catchMovement.judge(note, hit, center, getCatchControls().speed);
}

export function updateCatchMovement(deltaMs: number, time: number) {
    const field = getCatchPlayfield();
    player.x = catchMovement.move(
        player.x,
        deltaMs,
        time,
        field.left,
        field.width,
        playerW,
        getCatchControls().mode === "keyboard",
        getCatchControls().speed,
    );
}

let lastTrailX = player.x;
let trailElapsed = 0;
let nextGhost = 0;
export function updateCatchEffects(deltaMs: number) {
    const displayX = player.x + visual.x - playerW / 2;
    const active =
        window.gameState === "playing" &&
        !window.autoPlay &&
        !window.currentChart?.mania;
    trailLayer.visible = active;
    const delta = window.isPaused ? 0 : Math.max(0, Math.min(100, deltaMs));
    const hyper = active && Boolean(catchMovement.state.hyper);
    const dash = active && catchMovement.state.dash;
    const effect = `${hyper}:${dash}`;
    if (effect !== lastEffect) {
        lastEffect = effect;
        drawPlayer();
    }
    for (const ghost of dashGhosts) {
        ghost.age += delta;
        ghost.graphic.visible = ghost.age < 180;
        ghost.graphic.alpha = Math.max(0, 1 - ghost.age / 180) * 0.4;
    }
    trailElapsed += delta;
    if (
        active &&
        !window.isPaused &&
        (dash || hyper) &&
        Math.abs(displayX - lastTrailX) > SCALE &&
        trailElapsed >= 16
    ) {
        const ghost = dashGhosts[nextGhost++ % dashGhosts.length];
        ghost.age = 0;
        ghost.graphic.position.set(lastTrailX, player.y);
        ghost.graphic.tint = hyper
            ? CATCH_HYPER_COLOR
            : (catcherColor ?? MD3_COLORS.primary);
        ghost.graphic.alpha = 0.4;
        ghost.graphic.visible = true;
        trailElapsed = 0;
    }
    lastTrailX = displayX;
}

window.addEventListener("keydown", (event) => {
    if (
        window.gameState !== "playing" ||
        window.isPaused ||
        window.autoPlay ||
        window.currentChart?.mania ||
        getCatchControls().mode !== "keyboard" ||
        document.querySelector("mdui-dialog[open]") ||
        event
            .composedPath()
            .some(
                (target) =>
                    target instanceof HTMLElement &&
                    (target.isContentEditable ||
                        ["INPUT", "TEXTAREA", "SELECT"].includes(
                            target.tagName,
                        )),
            )
    )
        return;
    const controls = getCatchControls();
    const action = (["left", "right", "dash"] as const).find(
        (key) => controls[key] === event.code,
    );
    if (!action) return;
    event.preventDefault();
    if (heldActions.has(action)) return;
    heldActions.add(action);
    applyHeldKeys();
});
window.addEventListener("keyup", (event) => {
    const controls = getCatchControls();
    const action = (["left", "right", "dash"] as const).find(
        (key) => controls[key] === event.code,
    );
    if (!action || !heldActions.has(action)) return;
    heldActions.delete(action);
    applyHeldKeys();
});
window.addEventListener("blur", releaseCatchKeys);
window.addEventListener("visibilitychange", () => {
    if (document.hidden) releaseCatchKeys();
});
window.addEventListener("nowjs-autoplay-change", resetCatchMovement);
onCatchControlsChange(() => {
    resetCatchMovement();
    const chart = window.currentChart;
    if (chart) configureCatchChart(chart);
    logicThread.configure({
        catchKeyboard: getCatchControls().mode === "keyboard",
        catchState: getCatchMovementState(),
        catchSpeed: getCatchControls().speed,
        playerWidth: playerW,
        ...(chart
            ? {
                  notes: chart.notes.map(
                      ({
                          time,
                          x,
                          type,
                          lane,
                          holdEndTime,
                          hyperDashTarget,
                      }) => ({
                          time,
                          x,
                          type,
                          lane,
                          holdEndTime,
                          hyperDashTarget,
                      }),
                  ),
              }
            : {}),
    });
    window.dispatchEvent(new Event("nowjs-catch-difficulty-change"));
});
