// AutoPlay moves the catcher with a critically damped spring instead of
// teleporting it under each fruit. Speed also drives a small tilt/stretch and
// an afterimage trail so the motion stays readable during fast patterns.
import * as PIXI from "./vendor/pixi.js";
import { CATCH_WINDOW_MS, circlePool } from "./circlePool.js";
import { MD3_COLORS } from "./theme.js";

const STORAGE_KEY = "nowjs-autoplay";
const TRAIL_COUNT = 7;
const TRAIL_AGE_MS = 150;
const SPRING_OMEGA = 20;
const SPRING_ZETA = 0.9;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function readStoredAutoPlay() {
    try {
        return localStorage.getItem(STORAGE_KEY) === "1";
    } catch (error) {
        console.warn("Unable to read the autoplay setting", error);
        return false;
    }
}

let enabled = readStoredAutoPlay();
let velocity = 0;
let trail = null;
let trailGhosts = [];
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
    if (trail || !window.gameplayLayer) return;

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

function findTarget(chartTime, playerCenter) {
    const fruits = [];
    const bananas = [];
    let earliestFruit = Infinity;
    let earliestBanana = Infinity;

    for (const circle of circlePool.activeCircles) {
        if (!circle.visible || circle.hasJudged || !circle.note) continue;

        const timeUntilCatch = circle.note.time - chartTime;
        if (timeUntilCatch < -CATCH_WINDOW_MS) continue;

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

    if (bananas.length && !fruitIsUrgent) {
        candidates = bananas;
        earliest = earliestBanana;
    } else if (fruits.length) {
        candidates = fruits;
        earliest = earliestFruit;
    } else {
        candidates = bananas;
        earliest = earliestBanana;
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
        return { x: (minX + maxX) / 2 };
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

    return { x: best.x };
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
        try {
            localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
        } catch (error) {
            console.warn("Unable to save the autoplay setting", error);
        }
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

    const player = window.player;
    const playerWidth = window.playerWidth;
    const gameWidth = window.gameWidth;
    if (!player || !playerWidth || !gameWidth) return;

    ensureTrail();

    const deltaSeconds = clamp(deltaMS, 0, 40) / 1000;
    if (deltaSeconds <= 0) return;

    const playerCenter = player.x + playerWidth / 2;
    const target = findTarget(chartTime, playerCenter);
    const maxX = gameWidth - playerWidth;
    const targetX = target
        ? clamp(target.x - playerWidth / 2, 0, maxX)
        : clamp((gameWidth - playerWidth) / 2, 0, maxX);

    const omega = SPRING_OMEGA;
    const damping = 2 * SPRING_ZETA * omega;
    const acceleration =
        omega * omega * (targetX - player.x) - damping * velocity;

    velocity += acceleration * deltaSeconds;

    const maxSpeed = 7000 * (window.gameScale || 1);
    velocity = clamp(velocity, -maxSpeed, maxSpeed);

    let nextX = player.x + velocity * deltaSeconds;
    if (nextX < 0) {
        nextX = 0;
        velocity = Math.max(0, velocity);
    } else if (nextX > maxX) {
        nextX = maxX;
        velocity = Math.min(0, velocity);
    }
    player.x = nextX;

    const visual = window.playerVisual;
    if (visual) {
        const speedScale = 4500 * (window.gameScale || 1);
        const normalizedVelocity = clamp(velocity / speedScale, -1, 1);
        const stretch = Math.min(Math.abs(normalizedVelocity) * 0.08, 0.1);
        visual.rotation = normalizedVelocity * 0.16;
        visual.scale.set(1 + stretch, 1 - stretch * 0.55);
    }

    updateTrail(performance.now());
}
