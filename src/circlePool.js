import * as PIXI from "pixi.js";
import { BlurFilter } from "pixi.js";
import { sound } from "@pixi/sound";
import { updateStatsDisplay, showMiss } from "./stats.js";

const app = window.app;
const HEIGHT = window.gameHeight;
const SCALE = window.gameScale;
const RADIUS = 20 * SCALE;

export const JUDGE_TOLERANCE = 3 * SCALE;

class CirclePool {
    constructor(poolSize = 30) {
        this.pool = [];
        this.activeCircles = [];
        this.initPool(poolSize);
    }

    initPool(size) {
        for (let i = 0; i < size; i++) {
            const circle = new PIXI.Graphics();
            circle.beginFill(0xffffff);
            circle.drawCircle(0, 0, RADIUS);
            circle.endFill();
            circle.visible = false;
            circle.active = false;
            circle.speedY = 5 * SCALE;
            circle.hasJudged = false;
            app.stage.addChild(circle);
            this.pool.push(circle);
        }
    }

    get(x, y) {
        for (let i = 0; i < this.pool.length; i++) {
            const c = this.pool[i];
            if (!c.active) {
                c.active = true;
                c.visible = true;
                c.hasJudged = false;
                c.x = x;
                c.y = y;

                const initialBlur = 2 * SCALE;
                const clearY = 50 * SCALE;
                c.filters = [new BlurFilter(initialBlur)];
                c.blurStrength = initialBlur;
                c.blurStartY = y;
                c.blurClearY = clearY;

                this.activeCircles.push(c);
                return c;
            }
        }
        return null;
    }

    release(circle) {
        const index = this.activeCircles.indexOf(circle);
        if (index !== -1) this.activeCircles.splice(index, 1);
        circle.active = false;
        circle.visible = false;
        circle.hasJudged = false;
        circle.y = -100 * SCALE;
    }

    releaseAll() {
        while (this.activeCircles.length > 0) {
            this.release(this.activeCircles[0]);
        }
    }

    update(deltaTime) {
        if (window.gameState !== "playing" || window.isPaused) return;

        const player = window.player;
        if (!player) return;

        const judgeLineY = player.y;

        for (let i = 0; i < this.activeCircles.length; i++) {
            const c = this.activeCircles[i];
            c.y += c.speedY * deltaTime;

            if (c.filters && c.filters.length > 0) {
                const startY = c.blurStartY;
                const endY = c.blurClearY;
                const currentY = c.y;

                // don't delete the following comment!
                // 不要删除下面这条注释！
                // eslint-disable-next-line no-useless-assignment
                let progress = 0;
                if (currentY <= startY) {
                    progress = 0;
                } else if (currentY >= endY) {
                    progress = 1;
                } else {
                    progress = (currentY - startY) / (endY - startY);
                }

                let newBlur = c.blurStrength * (1 - progress);
                newBlur = Math.max(0, newBlur);

                if (newBlur <= 0.1) {
                    c.filters = null;
                } else {
                    c.filters[0].blur = newBlur;
                }
            }

            if (c.hasJudged) continue;

            const dy = Math.abs(c.y - judgeLineY);
            if (dy <= JUDGE_TOLERANCE) {
                const playerX = player.x;
                const playerW = 130 * SCALE;
                if (c.x >= playerX - 15 * SCALE && c.x <= playerX + playerW) {
                    this.performHit(c);
                    continue;
                }
            }

            if (c.y > judgeLineY + JUDGE_TOLERANCE + RADIUS) {
                this.release(c);
                sound.play("miss");
                window.missCount++;
                window.combo = 0;
                showMiss();
                updateStatsDisplay();
            }

            if (c.y + RADIUS > HEIGHT) {
                this.release(c);
                sound.play("miss");
                window.missCount++;
                window.combo = 0;
                showMiss();
                updateStatsDisplay();
            }
        }
    }

    manualHit() {
        if (window.gameState !== "playing" || window.isPaused) return;

        const player = window.player;
        if (!player) return;

        const judgeLineY = player.y;

        for (let i = this.activeCircles.length - 1; i >= 0; i--) {
            const c = this.activeCircles[i];
            if (c.hasJudged) continue;

            const dy = Math.abs(c.y - judgeLineY);
            const playerX = player.x;
            const playerW = 130 * SCALE;

            if (
                dy <= JUDGE_TOLERANCE * 2 &&
                c.x >= playerX - 15 * SCALE &&
                c.x <= playerX + playerW
            ) {
                this.performHit(c);
                break;
            }
        }
    }

    performHit(circle) {
        sound.play("catch");
        window.hitCount++;
        window.combo++;
        if (window.combo > window.maxCombo) {
            window.maxCombo = window.combo;
        }
        updateStatsDisplay();
        circle.hasJudged = true;
        this.release(circle);
    }
}

export const circlePool = new CirclePool(30);
window.circlePool = circlePool;
