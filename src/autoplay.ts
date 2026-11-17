// AutoPlay moves the catcher with a critically damped spring instead of
// teleporting it under each fruit. Speed also drives a small tilt/stretch and
// an afterimage trail so the motion stays readable during fast patterns.
import * as PIXI from "./vendor/pixi.js";
import { CATCH_WINDOW_MS, circlePool } from "./circlePool.ts";
import { MD3_COLORS } from "./theme.ts";
import { readStorage, writeStorage } from "./storage.ts";
import { getCatchPlayfield } from "./layout.ts";
import {
    AUTOPLAY_BANANA_MAX_SPEED,
    AUTOPLAY_BANANA_OMEGA,
    AUTOPLAY_BANANA_ZETA,
    AUTOPLAY_FRUIT_MAX_SPEED,
    AUTOPLAY_FRUIT_OMEGA,
    AUTOPLAY_FRUIT_ZETA,
    AUTOPLAY_BASE_FRAME_MS,
    AUTOPLAY_MAX_STEP_MS,
    AUTOPLAY_MAX_SUBSTEP_SECONDS,
    AUTOPLAY_TELEPORT_DISTANCE_RATIO,
    AUTOPLAY_TELEPORT_URGENT_MS,
} from "./autoplayTuning.ts";

const STORAGE_KEY = "nowjs-autoplay";
const TRAIL_COUNT = 7;
const TRAIL_AGE_MS = 150;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function readStoredAutoPlay() {
    return readStorage(STORAGE_KEY) === "1";
}

let enabled = readStoredAutoPlay();
let velocity = 0;
let trail = null;
const trailGhosts = [];
let trailHistory = [];
let trailWidth = 0;
let trailHeight = 0;
let trailRadius = 0;

window.autoPlay = enabled;

function resetVisual() {
    const visual = window.playerVisual;
    if (!visual) return;
    visual.rotation = 0;
    visual.scale.set(1);
}

function resetMotion() {
    velocity = 0;
    trailHistory = [];
    resetVisual();

    if (trail) {
        trail.visible = false;
        for (const ghost of trailGhosts) {
            ghost.visible = false;
        }
    }
}

function ensureTrail() {
    if (trail) {
        if (trailWidth !== window.playerWidth) {
            trailWidth = window.playerWidth;
            for (const ghost of trailGhosts) {
                ghost
                    .clear()
                    .roundRect(0, 0, trailWidth, trailHeight, trailRadius)
                    .fill({ color: MD3_COLORS.primary, alpha: 0.55 });
                ghost.pivot.set(trailWidth / 2, trailHeight / 2);
            }
        }
        return;
    }
    if (!window.gameplayLayer) return;

    const playerWidth = window.playerWidth;
    const scale = window.gameScale || 1;
    if (!playerWidth) return;

    trailWidth = playerWidth;
    trailHeight = 20 * scale;
    trailRadius = 5 * scale;
    trail = new PIXI.Container();

    for (let index = 0; index < TRAIL_COUNT; index += 1) {
        const ghost = new PIXI.Graphics();
        ghost
            .roundRect(0, 0, trailWidth, trailHeight, trailRadius)
            .fill({ color: MD3_COLORS.primary, alpha: 0.55 });
        ghost.pivot.set(trailWidth / 2, trailHeight / 2);
        ghost.visible = false;
        trail.addChild(ghost);
        trailGhosts.push(ghost);
    }

    const layer = window.gameplayLayer;
    const player = window.player;
    if (player && player.parent === layer) {
        layer.addChildAt(trail, Math.max(0, layer.getChildIndex(player)));
    } else {
        layer.addChild(trail);
    }
    trail.visible = false;
}

function findTarget(chartTime, playerCenter, backWindowMs = CATCH_WINDOW_MS) {
    const fruits = [];
    const bananas = [];
    let earliestFruit = Infinity;
    let earliestBanana = Infinity;

    for (const circle of circlePool.activeCircles) {
        if (!circle.visible || circle.hasJudged || !circle.note) continue;

        const timeUntilCatch = circle.note.time - chartTime;
        if (timeUntilCatch < -backWindowMs) continue;

        if (circle.note.type === "banana") {
            bananas.push(circle);
            if (circle.note.time < earliestBanana) {
                earliestBanana = circle.note.time;
            }
        } else {
            fruits.push(circle);
            if (circle.note.time < earliestFruit) {
                earliestFruit = circle.note.time;
            }
        }
    }

    // Bananas are bonus objects. Chase them while the next fruit is still far
    // away, but switch back to the fruit in time to catch it.
    const fruitIsUrgent = fruits.length && earliestFruit - chartTime <= 450;
    let candidates;
    let earliest;
    let bananaTarget;

    if (bananas.length && !fruitIsUrgent) {
        candidates = bananas;
        earliest = earliestBanana;
        bananaTarget = true;
    } else if (fruits.length) {
        candidates = fruits;
        earliest = earliestFruit;
        bananaTarget = false;
    } else {
        candidates = bananas;
        earliest = earliestBanana;
        bananaTarget = true;
    }

    if (!candidates.length) return null;

    // Notes that share a timestamp can often be caught together.
    const cluster = candidates.filter(
        (circle) => circle.note.time - earliest <= 30,
    );
    let minX = Infinity;
    let maxX = -Infinity;

    for (const circle of cluster) {
        minX = Math.min(minX, circle.x);
        maxX = Math.max(maxX, circle.x);
    }

    const playerWidth = window.playerWidth || 100;
    if (maxX - minX <= playerWidth * 0.8) {
        return {
            x: (minX + maxX) / 2,
            banana: bananaTarget,
            time: earliest,
        };
    }

    let best = cluster[0];
    let bestDistance = Infinity;
    for (const circle of cluster) {
        const distance = Math.abs(circle.x - playerCenter);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = circle;
        }
    }

    return { x: best.x, banana: bananaTarget, time: best.note.time };
}

function updateTrail(now) {
    if (!trail || !window.player || !trailWidth) return;

    const player = window.player;
    const visual = window.playerVisual;
    trail.visible = true;

    trailHistory.push({
        x: player.x + trailWidth / 2,
        y: player.y + trailHeight / 2,
        rotation: visual ? visual.rotation : 0,
        scaleX: visual ? visual.scale.x : 1,
        scaleY: visual ? visual.scale.y : 1,
        time: now,
    });

    while (trailHistory.length > 64) {
        trailHistory.shift();
    }
    while (trailHistory.length && now - trailHistory[0].time > TRAIL_AGE_MS) {
        trailHistory.shift();
    }

    const count = trailGhosts.length;
    const step = TRAIL_AGE_MS / count;
    let anyVisible = false;

    for (let index = 0; index < count; index += 1) {
        const ghost = trailGhosts[index];
        const targetTime = now - step * (index + 1) * 0.82;
        let best = null;
        let bestDelta = Infinity;

        for (const entry of trailHistory) {
            const delta = Math.abs(entry.time - targetTime);
            if (delta < bestDelta) {
                bestDelta = delta;
                best = entry;
            }
        }

        if (!best || now - best.time > TRAIL_AGE_MS) {
            ghost.visible = false;
            continue;
        }

        ghost.visible = true;
        ghost.x = best.x;
        ghost.y = best.y;
        ghost.rotation = best.rotation;
        ghost.scale.set(best.scaleX, best.scaleY);
        ghost.alpha = (1 - (index + 1) / (count + 1)) * 0.3;
        anyVisible = true;
    }

    trail.visible = anyVisible;
}

export function isAutoPlayEnabled() {
    return enabled;
}

export function setAutoPlay(value, options = {}) {
    const next = Boolean(value);
    if (next === enabled) return enabled;

    enabled = next;
    window.autoPlay = enabled;

    if (options.persist !== false) {
        writeStorage(STORAGE_KEY, enabled ? "1" : "0");
    }

    resetMotion();
    window.dispatchEvent(
        new CustomEvent("nowjs-autoplay-change", {
            detail: { enabled },
        }),
    );

    return enabled;
}

export function toggleAutoPlay() {
    return setAutoPlay(!enabled);
}

export function resetAutoPlayMotion() {
    resetMotion();
}

export function updateAutoPlay(chartTime, deltaMS) {
    if (!enabled) return;
    if (window.currentChart && window.currentChart.mania) return;

    const player = window.player;
    const playerWidth = window.playerWidth;
    const gameWidth = window.gameWidth;
    if (!player || !playerWidth || !gameWidth) return;

    ensureTrail();

    const elapsedSeconds = clamp(deltaMS, 0, AUTOPLAY_MAX_STEP_MS) / 1000;
    if (elapsedSeconds <= 0) return;

    const field = getCatchPlayfield();
    const minX = field.left - playerWidth / 2;
    const maxX = field.right - playerWidth / 2;
    const centerX = clamp(field.center - playerWidth / 2, minX, maxX);
    const scale = window.gameScale || 1;

    // A slow render frame must not slow the catcher down. Integrate at a
    // fixed high rate, and re-evaluate the target inside each substep so dense
    // patterns are still followed when the render frame is 100 ms+.
    const substeps = Math.max(
        1,
        Math.ceil(elapsedSeconds / AUTOPLAY_MAX_SUBSTEP_SECONDS),
    );
    const deltaSeconds = elapsedSeconds / substeps;
    const elapsedMs = elapsedSeconds * 1000;
    const earlyWindow = CATCH_WINDOW_MS;
    const lateWindow =
        CATCH_WINDOW_MS + Math.max(0, elapsedMs - AUTOPLAY_BASE_FRAME_MS);
    const catchHalfWidth = (playerWidth * 0.9) / 2;
    const catchCircles = circlePool.activeCircles.filter(
        (circle) =>
            circle.active &&
            !circle.hasJudged &&
            circle.note &&
            circle.note.time <= chartTime + earlyWindow + 1 &&
            circle.note.time >= chartTime - lateWindow - elapsedMs - 1,
    );

    for (let step = 0; step < substeps; step += 1) {
        const stepTime =
            chartTime - elapsedMs + (step + 1) * deltaSeconds * 1000;
        const target = findTarget(
            stepTime,
            player.x + playerWidth / 2,
            lateWindow,
        );
        const targetX = target
            ? clamp(target.x - playerWidth / 2, minX, maxX)
            : centerX;
        const distance = Math.abs(targetX - player.x);
        const timeUntilCatch = target ? target.time - stepTime : Infinity;
        const teleport =
            Boolean(target) &&
            (distance > playerWidth * AUTOPLAY_TELEPORT_DISTANCE_RATIO ||
                (timeUntilCatch <= AUTOPLAY_TELEPORT_URGENT_MS &&
                    distance > catchHalfWidth));

        if (teleport) {
            player.x = targetX;
            velocity = 0;
        } else {
            const chasingBanana = Boolean(target?.banana);
            const omega = chasingBanana
                ? AUTOPLAY_BANANA_OMEGA
                : AUTOPLAY_FRUIT_OMEGA;
            const zeta = chasingBanana
                ? AUTOPLAY_BANANA_ZETA
                : AUTOPLAY_FRUIT_ZETA;
            const damping = 2 * zeta * omega;
            const maxSpeed =
                (chasingBanana
                    ? AUTOPLAY_BANANA_MAX_SPEED
                    : AUTOPLAY_FRUIT_MAX_SPEED) * scale;
            const acceleration =
                omega * omega * (targetX - player.x) - damping * velocity;
            velocity = clamp(
                velocity + acceleration * deltaSeconds,
                -maxSpeed,
                maxSpeed,
            );

            const nextX = player.x + velocity * deltaSeconds;
            if (nextX < minX) {
                player.x = minX;
                velocity = Math.max(0, velocity);
            } else if (nextX > maxX) {
                player.x = maxX;
                velocity = Math.min(0, velocity);
            } else {
                player.x = nextX;
            }
        }

        // Substep collision for every catch object keeps slow frames from
        // skipping notes. The normal circlePool pass still handles misses.
        for (const circle of catchCircles) {
            if (!circle.active || circle.hasJudged) continue;
            const delta = stepTime - circle.note.time;
            if (
                delta <= lateWindow &&
                delta >= -earlyWindow &&
                circlePool.overlaps(circle, player)
            ) {
                circlePool.performHit(circle);
            }
        }
    }

    const visual = window.playerVisual;
    if (visual) {
        const speedScale = 4500 * (window.gameScale || 1);
        const normalizedVelocity = clamp(velocity / speedScale, -1, 1);
        const stretch = Math.min(Math.abs(normalizedVelocity) * 0.08, 0.1);
        visual.rotation = normalizedVelocity * 0.16;
        visual.scale.set(1 + stretch, 1 - stretch * 0.55);
    }
}

export function renderAutoPlay(): void {
    if (enabled && !window.currentChart?.mania) {
        ensureTrail();
        updateTrail(performance.now());
    }
}
