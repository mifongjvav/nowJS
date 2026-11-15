import * as PIXI from "./vendor/pixi.js";
import { showMiss, updateStatsDisplay } from "./stats.ts";
import { playCatchSound, playComboBreak } from "./audio.ts";
import { triggerStoryboardHit } from "./background.ts";
import { getPlayfield } from "./layout.ts";
import { MD3_COLORS } from "./theme.ts";
import { isHoldTailJudgementEnabled } from "./maniaSettings.ts";

const SCALE = window.gameScale;
const RADIUS = 20 * SCALE;
const CATCHER_WIDTH = 130 * SCALE;
const CATCH_WINDOW_MS = 95;
// Use most of the plate as the catch area while keeping a small edge margin.
const CATCH_CENTER_RATIO = 0.9;

function drawNoteGraphics(circle, holdHeight, color) {
    circle.clear();

    if (holdHeight > 0.5) {
        // Holds use the same width as the note head and are drawn as a
        // rounded progress bar with an outer glow and a white outline.
        const holdWidth = RADIUS * 2;
        const barHeight = Math.max(holdHeight, holdWidth);
        const radius = holdWidth / 2;
        const glow = 4 * SCALE;
        const border = Math.max(2 * SCALE, RADIUS * 0.16);
        const innerWidth = Math.max(2 * SCALE, holdWidth - border * 2);
        const innerHeight = Math.max(2 * SCALE, barHeight - border * 2);

        circle
            .roundRect(
                -radius - glow,
                -barHeight - glow,
                holdWidth + glow * 2,
                barHeight + glow * 2,
                radius + glow,
            )
            .fill({ color, alpha: 0.16 });
        circle
            .roundRect(-radius, -barHeight, holdWidth, barHeight, radius)
            .fill({ color: 0xffffff, alpha: 0.92 });
        circle
            .roundRect(
                -innerWidth / 2,
                -barHeight + border,
                innerWidth,
                innerHeight,
                innerWidth / 2,
            )
            .fill({ color });

        const coreWidth = Math.max(2 * SCALE, innerWidth * 0.34);
        circle
            .roundRect(
                -coreWidth / 2,
                -barHeight + border * 2,
                coreWidth,
                Math.max(0, barHeight - border * 4),
                coreWidth / 2,
            )
            .fill({ color: 0xffffff, alpha: 0.14 });
        return;
    }

    circle.circle(0, 0, RADIUS * 1.28).fill({ color, alpha: 0.15 });
    circle.circle(0, 0, RADIUS).fill({ color: 0xffffff, alpha: 0.92 });
    circle.circle(0, 0, RADIUS * 0.8).fill({ color });
    circle.circle(0, 0, RADIUS * 0.34).fill({ color: 0xffffff, alpha: 0.18 });
    circle
        .circle(-RADIUS * 0.3, -RADIUS * 0.32, RADIUS * 0.16)
        .fill({ color: 0xffffff, alpha: 0.78 });
}

function getNoteColor(note) {
    if (note.type === "banana") return MD3_COLORS.banana;
    if (typeof note.color === "number") return note.color;
    if (note.holdEndTime) return MD3_COLORS.primary;
    if (note.type === "droplet") return MD3_COLORS.primary;
    return MD3_COLORS.onSurface;
}

class CirclePool {
    constructor(poolSize = 90) {
        this.pool = [];
        this.activeCircles = [];
        this.layer = window.gameplayLayer || window.app.stage;
        this.lastMissSound = 0;
        this.lastCatchSound = 0;

        for (let i = 0; i < poolSize; i++) {
            this.createCircle();
        }
    }

    createCircle() {
        const circle = new PIXI.Graphics();
        circle.circle(0, 0, RADIUS).fill(0xffffff);
        circle.visible = false;
        circle.active = false;
        circle.hasJudged = false;
        circle.displayRadius = RADIUS;
        this.layer.addChild(circle);
        this.pool.push(circle);
        return circle;
    }

    spawnNote(note, chartTime) {
        let circle = this.pool.find((item) => !item.active);
        if (!circle) circle = this.createCircle();

        const field = getPlayfield();
        const x = Math.max(0, Math.min(512, note.x));
        const scale = note.scale || 1;

        circle.active = true;
        circle.visible = true;
        circle.hasJudged = false;
        circle.holdActive = false;
        circle.note = note;
        circle.noteTime = note.time;
        circle.fallSpeed =
            (window.currentChart && window.currentChart.fallSpeed) || 330;
        circle.x = field.left + (x / 512) * field.width;
        circle.displayRadius = RADIUS * scale;
        circle.scale.set(scale);

        const holdHeight =
            note.holdEndTime && note.holdEndTime > note.time
                ? ((note.holdEndTime - note.time) / 1000) * circle.fallSpeed
                : 0;
        drawNoteGraphics(circle, holdHeight, getNoteColor(note));

        circle.tint = 0xffffff;

        circle.y = this.yFor(circle, chartTime);

        this.activeCircles.push(circle);
        return circle;
    }

    yFor(circle, chartTime) {
        const judgeY = window.judgeLine ? window.judgeLine.y : window.player.y;
        return (
            judgeY - ((circle.noteTime - chartTime) / 1000) * circle.fallSpeed
        );
    }

    release(circle) {
        const index = this.activeCircles.indexOf(circle);
        if (index !== -1) this.activeCircles.splice(index, 1);
        circle.active = false;
        circle.visible = false;
        circle.hasJudged = false;
        circle.holdActive = false;
        circle.filters = null;
        circle.tint = MD3_COLORS.onSurface;
        circle.scale.set(1);
        circle.y = -100 * SCALE;
    }

    releaseAll() {
        while (this.activeCircles.length > 0) {
            this.release(this.activeCircles[0]);
        }
    }

    overlaps(circle, player) {
        const playerWidth = window.playerWidth || 100 * SCALE;
        const playerCenter = player.x + playerWidth / 2;
        const catchHalfWidth = (playerWidth * CATCH_CENTER_RATIO) / 2;
        return Math.abs(circle.x - playerCenter) <= catchHalfWidth;
    }

    pressLane(lane, chartTime) {
        const chart = window.currentChart;
        if (!chart || !chart.mania) return false;

        let target = null;
        let bestDelta = Infinity;

        for (const circle of this.activeCircles) {
            if (circle.hasJudged || !circle.note) continue;
            if (circle.note.lane !== lane) continue;

            const delta = chartTime - circle.noteTime;
            if (delta < -CATCH_WINDOW_MS || delta > CATCH_WINDOW_MS) continue;

            const distance = Math.abs(delta);
            if (distance < bestDelta) {
                bestDelta = distance;
                target = circle;
            }
        }

        if (!target) return false;

        this.performHit(target);
        return true;
    }

    releaseLane(lane, chartTime) {
        const chart = window.currentChart;
        if (!chart || !chart.mania) return;

        for (const circle of this.activeCircles.slice()) {
            if (!circle.holdActive || !circle.note) continue;
            if (circle.note.lane !== lane) continue;

            const endTime = circle.note.holdEndTime;
            if (!Number.isFinite(endTime)) continue;

            if (chartTime >= endTime - CATCH_WINDOW_MS) {
                this.performHoldTailHit(circle);
            } else {
                this.failHoldTail(circle);
            }
        }
    }

    update(chartTime) {
        if (window.gameState !== "playing" || window.isPaused) return;

        const player = window.player;
        if (!player) return;
        const mania = Boolean(window.currentChart && window.currentChart.mania);

        for (let i = this.activeCircles.length - 1; i >= 0; i--) {
            const circle = this.activeCircles[i];
            const delta = chartTime - circle.noteTime;

            if (mania) {
                // Mania notes are only collected when their lane key is
                // pressed (or by auto play). The plates stay still, so the
                // catch overlap test must not judge them automatically.
                if (circle.holdActive) {
                    this.updateHold(circle, chartTime);
                    continue;
                }

                circle.y = this.yFor(circle, chartTime);

                if (window.autoPlay && !circle.hasJudged && delta >= 0) {
                    // Auto play should not lose notes when a slow frame
                    // skips over the hit window; it presses as soon as the
                    // note becomes due (or as late as the next frame).
                    this.performHit(circle);
                    continue;
                }

                if (!circle.hasJudged && delta > CATCH_WINDOW_MS) {
                    if (circle.note.type === "banana") {
                        this.release(circle);
                    } else {
                        this.registerMiss(circle);
                    }
                }
                continue;
            }

            circle.y = this.yFor(circle, chartTime);

            if (
                !circle.hasJudged &&
                delta >= -CATCH_WINDOW_MS &&
                delta <= CATCH_WINDOW_MS
            ) {
                if (this.overlaps(circle, player)) {
                    this.performHit(circle);
                    continue;
                }
            }

            if (delta > CATCH_WINDOW_MS) {
                if (circle.note.type === "banana") {
                    this.release(circle);
                } else {
                    this.registerMiss(circle);
                }
            }
        }
    }

    registerMiss(circle) {
        this.release(circle);
        const now = performance.now();
        const brokeCombo = window.combo > 0;

        if (brokeCombo && now - this.lastMissSound > 45) {
            this.lastMissSound = now;
            playComboBreak();
        }

        window.missCount++;
        window.combo = 0;
        showMiss();
        updateStatsDisplay();
    }

    playHitEffects(circle) {
        const player = window.player;
        const playfieldWidth = 512 * window.gameScale;
        const leftBound = (window.gameWidth - playfieldWidth) / 2;
        const chart = window.currentChart;
        const lane = circle.note.lane;
        let catcherX = player.x;
        let catcherWidth = window.playerWidth || CATCHER_WIDTH;

        if (chart && chart.mania && typeof lane === "number" && lane >= 0) {
            const field = getPlayfield();
            const laneWidth = field.width / chart.mania.laneCount;
            catcherX = field.left + laneWidth * lane;
            catcherWidth = laneWidth;
        }

        const now = performance.now();
        if (now - this.lastCatchSound > 18) {
            this.lastCatchSound = now;
            playCatchSound(
                circle.note,
                catcherX,
                catcherWidth,
                leftBound,
                playfieldWidth,
            );
        }

        triggerStoryboardHit(
            Number.isFinite(window.chartTime)
                ? window.chartTime
                : circle.noteTime,
        );
    }

    shouldHoldCircle(circle) {
        return Boolean(
            window.currentChart &&
            window.currentChart.mania &&
            circle.note.holdEndTime &&
            circle.note.holdEndTime > circle.note.time &&
            isHoldTailJudgementEnabled(),
        );
    }

    refreshHoldVisual(circle, chartTime) {
        const note = circle.note;
        const endTime = note.holdEndTime;
        if (!Number.isFinite(endTime)) return;

        const startTime = Math.max(chartTime, note.time);
        const remaining = Math.max(0, endTime - startTime);
        const holdHeight = (remaining / 1000) * circle.fallSpeed;
        const judgeY = window.judgeLine ? window.judgeLine.y : circle.y;

        circle.y = judgeY;
        drawNoteGraphics(circle, holdHeight, getNoteColor(note));
        circle.tint = 0xffffff;
    }

    updateHold(circle, chartTime) {
        this.refreshHoldVisual(circle, chartTime);
        if (chartTime >= circle.note.holdEndTime) {
            this.performHoldTailHit(circle);
        }
    }

    performHoldTailHit(circle) {
        if (!circle.holdActive) return;

        circle.holdActive = false;
        this.playHitEffects(circle);
        window.hitCount++;
        window.combo++;
        if (window.combo > window.maxCombo) {
            window.maxCombo = window.combo;
        }
        updateStatsDisplay();
        this.release(circle);
    }

    failHoldTail(circle) {
        if (!circle.holdActive) return;
        circle.holdActive = false;
        this.registerMiss(circle);
    }

    performHit(circle) {
        this.playHitEffects(circle);

        if (circle.note.type === "banana") {
            window.bananaCount = (window.bananaCount || 0) + 1;
            circle.hasJudged = true;
            this.release(circle);
            return;
        }

        window.hitCount++;
        window.combo++;
        if (window.combo > window.maxCombo) {
            window.maxCombo = window.combo;
        }
        updateStatsDisplay();

        circle.hasJudged = true;

        if (this.shouldHoldCircle(circle)) {
            circle.holdActive = true;
            this.refreshHoldVisual(circle, window.chartTime);
            return;
        }

        this.release(circle);
    }
}

export const circlePool = new CirclePool(90);
export { CATCH_WINDOW_MS };
window.circlePool = circlePool;
