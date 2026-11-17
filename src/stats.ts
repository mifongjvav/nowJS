import * as PIXI from "./vendor/pixi.js";
import { MD3_COLORS, THEME_CHANGE_EVENT } from "./theme.ts";
import { i18n, onLanguageChange } from "./i18n/index.ts";
import { ComboReaction } from "./comboReaction.ts";

const layer = window.statsLayer || window.gameplayLayer || window.app.stage;
const SCALE = window.gameScale;
const comboReaction = new ComboReaction();

window.combo = 0;
window.maxCombo = 0;
window.hitCount = 0;
window.missCount = 0;
window.bananaCount = 0;

const statsAccent = new PIXI.Graphics();
layer.addChild(statsAccent);

function drawStatsAccent(): void {
    statsAccent.clear();
    statsAccent
        .roundRect(14 * SCALE, 22 * SCALE, 3 * SCALE, 52 * SCALE, 2 * SCALE)
        .fill({
            color: MD3_COLORS.primary,
            alpha: 0.8,
        });
}

drawStatsAccent();

const hitText = new PIXI.Text({
    text: `${i18n.stats.hit}: 0`,
    style: {
        fontSize: 23 * SCALE,
        fill: MD3_COLORS.onSurface,
        fontWeight: "700",
        letterSpacing: 1 * SCALE,
    },
});
hitText.alpha = 0.88;
hitText.x = 26 * SCALE;
hitText.y = 20 * SCALE;
layer.addChild(hitText);

const missCountText = new PIXI.Text({
    text: `${i18n.stats.miss}: 0`,
    style: {
        fontSize: 23 * SCALE,
        fill: MD3_COLORS.error,
        fontWeight: "700",
        letterSpacing: 1 * SCALE,
    },
});
missCountText.alpha = 0.92;
missCountText.x = 26 * SCALE;
missCountText.y = 20 * SCALE + 30 * SCALE;
layer.addChild(missCountText);

const comboText = new PIXI.Text({
    text: "0x",
    style: { fontSize: 48 * SCALE, fill: 0xffffff, fontWeight: "bold" },
});
comboText.anchor.set(0.5);
comboText.label = "combo-indicator";
comboText.visible = false;
layer.addChild(comboText);

const missPopup = new PIXI.Text({
    text: i18n.stats.missPopup,
    style: { fontSize: 64 * SCALE, fill: 0xff3333, fontWeight: "bold" },
});
missPopup.anchor.set(0.5);
missPopup.visible = false;
layer.addChild(missPopup);

function applyThemeColors(): void {
    drawStatsAccent();
    hitText.style.fill = MD3_COLORS.onSurface;
    missCountText.style.fill = MD3_COLORS.error;
    comboText.style.fill = MD3_COLORS.onSurface;
    missPopup.style.fill = MD3_COLORS.error;
}

applyThemeColors();
window.addEventListener(THEME_CHANGE_EVENT, applyThemeColors);

let comboCurrentScale = 1;
let missCurrentScale = 1;

export function updateStatsDisplay() {
    hitText.text = `${i18n.stats.hit}: ${window.hitCount}`;
    missCountText.text = `${i18n.stats.miss}: ${window.missCount}`;
    missPopup.text = i18n.stats.missPopup;
    if (window.combo <= 0) comboReaction.reset();
    comboText.text = comboReaction.shocked ? "🤯" : `${window.combo}x`;
    if (window.combo > 0) {
        comboCurrentScale = 1.5;
        comboText.visible = true;
        missPopup.visible = false;
    } else {
        comboText.visible = false;
    }
}

export function showMiss() {
    comboReaction.reset();
    comboText.rotation = 0;
    comboText.visible = false;
    missPopup.visible = true;
    missCurrentScale = 1.5;
}

export function updateComboPosition() {
    const player = window.player;
    if (player) {
        const mania =
            window.gameState === "playing" &&
            Boolean(window.currentChart && window.currentChart.mania);
        const centerX = mania ? window.gameWidth / 2 : player.x + 50 * SCALE;
        const topY = mania
            ? (window.judgeLine ? window.judgeLine.y : player.y) - 150 * SCALE
            : player.y - 150 * SCALE;

        if (mania || window.gameState !== "playing" || window.combo <= 0) {
            comboReaction.reset();
        }
        const position = window.isPaused
            ? comboReaction.pause(centerX, topY, performance.now())
            : comboReaction.update(centerX, topY, performance.now(), SCALE);
        comboText.position.set(position.x, position.y);
        comboText.text = position.shocked ? "🤯" : `${window.combo}x`;
        comboText.rotation = position.shocked
            ? Math.max(
                  -0.28,
                  Math.min(0.28, (centerX - position.x) / (200 * SCALE)),
              )
            : 0;
        missPopup.x = centerX;
        missPopup.y = topY;
    }
}

export function resetStats() {
    comboReaction.reset();
    comboText.rotation = 0;
    window.combo = 0;
    window.maxCombo = 0;
    window.hitCount = 0;
    window.missCount = 0;
    window.bananaCount = 0;
    comboCurrentScale = 1;
    missCurrentScale = 1;
    comboText.scale.set(1);
    missPopup.scale.set(1);
    missPopup.visible = false;
    comboText.visible = false;
    updateStatsDisplay();
}

onLanguageChange(() => updateStatsDisplay());

export function animateComboScale() {
    if (comboCurrentScale > 1.01) {
        comboCurrentScale += (1 - comboCurrentScale) * 0.12;
        comboText.scale.set(comboCurrentScale);
    } else {
        comboCurrentScale = 1;
        comboText.scale.set(1);
    }
    if (missCurrentScale > 1.01) {
        missCurrentScale += (1 - missCurrentScale) * 0.12;
        missPopup.scale.set(missCurrentScale);
    } else {
        missCurrentScale = 1;
        missPopup.scale.set(1);
    }
}
