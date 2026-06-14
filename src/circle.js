import * as PIXI from "pixi.js";
import { BlurFilter } from "pixi.js";
import { sound } from "@pixi/sound";
sound.add("catch", "normal-hitnormal.wav");
sound.add("miss", "combobreak.wav");
sound.add("music", "はやくにげなきゃ.mp3")
sound.play("music");

const app = window.app;
const WIDTH = 1280;
const HEIGHT = 720;
const RADIUS = 20;
let bpm = 172;

// 判定线就是 player.y（平台顶部）
// 允许的误差范围（像素），因为帧率可能导致略微越过
const JUDGE_TOLERANCE = 3;
let GENERATE_INTERVAL_MS = 60 / bpm;

// ---------- 对象池 ----------
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
            circle.speedY = 5; // 下落速度（像素/帧）
            circle.hasJudged = false; // 是否已经判定过（防止重复得分）
            app.stage.addChild(circle);
            this.pool.push(circle);
        }
    }

    // 从池中取出一个圆形，重置位置并激活
    get(x, y) {
        for (let i = 0; i < this.pool.length; i++) {
            const c = this.pool[i];
            if (!c.active) {
                c.active = true;
                c.visible = true;
                c.hasJudged = false;
                c.x = x;
                c.y = y;

                // ===== 添加模糊效果 =====
                const initialBlur = 2; // 起始模糊强度（y=0 时）
                const clearY = 50; // 完全清晰时的 Y 坐标
                c.filters = [new BlurFilter(initialBlur)];
                c.blurStrength = initialBlur;
                c.blurStartY = y; // 记录起始 Y（0）
                c.blurClearY = clearY; // 记录清晰位置
                // =======================

                this.activeCircles.push(c);
                return c;
            }
        }
        return null;
    }

    // 归还圆形到池中
    release(circle) {
        const index = this.activeCircles.indexOf(circle);
        if (index !== -1) this.activeCircles.splice(index, 1);
        circle.active = false;
        circle.visible = false;
        circle.hasJudged = false;
        circle.y = -100;
    }

    // 每帧更新所有活跃圆形的位置，并检测精准判定
    update(deltaTime) {
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

                // 计算模糊进度（0 = 最模糊，1 = 完全清晰）
                // eslint-disable-next-line no-useless-assignment
                let progress = 0;
                if (currentY <= startY) {
                    progress = 0;
                } else if (currentY >= endY) {
                    progress = 1;
                } else {
                    progress = (currentY - startY) / (endY - startY);
                }

                // 使用 progress 计算当前模糊值
                let newBlur = c.blurStrength * (1 - progress);
                newBlur = Math.max(0, newBlur);

                if (newBlur <= 0.1) {
                    c.filters = null;
                } else {
                    c.filters[0].blur = newBlur;
                }
            }

            // 已经判定过的不再处理（避免重复）
            if (c.hasJudged) continue;

            // 检查是否到达判定线附近
            const dy = Math.abs(c.y - judgeLineY);
            if (dy <= JUDGE_TOLERANCE) {
                // 进一步检查 X 轴碰撞（音符圆心是否在玩家矩形宽度范围内）
                const playerX = player.x;
                const playerW = 100; // 玩家宽度
                if (c.x >= playerX && c.x <= playerX + playerW) {
                    // 精准命中
                    sound.play("catch");
                    if (window.addScore) window.addScore(1);
                    c.hasJudged = true;
                    this.release(c);
                    continue;
                }
            }

            // 如果音符已经远远超过判定线（未命中），则自动消失
            if (c.y > judgeLineY + JUDGE_TOLERANCE + RADIUS) {
                this.release(c);
                sound.play("miss");
            }

            // 超出底部边界也自动归还（安全措施）
            if (c.y + RADIUS > HEIGHT) {
                this.release(c);
                sound.play("miss");
            }
        }
    }
}

// ---------- 游戏初始化 ----------
window.circlePool = new CirclePool(30); // 对象池30个

// 得分文本
const scoreText = new PIXI.Text({
    text: "Score: 0",
    style: { fontSize: 36, fill: 0xffcc00 },
});
scoreText.x = 20;
scoreText.y = 20;
app.stage.addChild(scoreText);

let currentScore = 0;
window.addScore = (points) => {
    currentScore += points;
    scoreText.text = `Score: ${currentScore}`;
};

app.ticker.add((ticker) => {
    const now = Date.now();
    if (!window._lastGen) window._lastGen = now;
    if (now - window._lastGen >= GENERATE_INTERVAL_MS * 1000) {
        window._lastGen = now;
        const playfieldWidth = 512; // 活动区域宽度
        const centerX = WIDTH / 2; // 屏幕中心 = 640
        const leftBound = centerX - playfieldWidth / 2; // 640 - 256 = 384
        const rightBound = centerX + playfieldWidth / 2; // 640 + 256 = 896

        // 在 leftBound 到 rightBound 之间随机生成 X 坐标
        const randX = Math.random() * (rightBound - leftBound) + leftBound;
        window.circlePool.get(randX, -RADIUS - 2);
    }

    window.circlePool.update(ticker.deltaTime);
});
