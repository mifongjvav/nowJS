import * as PIXI from "pixi.js";

const app = window.app;
const SCALE = window.gameScale;

window.combo = 0;
window.maxCombo = 0;
window.hitCount = 0;
window.missCount = 0;

const scoreText = new PIXI.Text({
    text: "Score: 0",
    style: { fontSize: 36 * SCALE, fill: 0xffcc00 },
});
scoreText.x = 20 * SCALE;
scoreText.y = 20 * SCALE;
app.stage.addChild(scoreText);

let currentScore = 0;
window.addScore = (points) => {
    currentScore += points;
    scoreText.text = `Score: ${currentScore}`;
};

const comboText = new PIXI.Text({
    text: "0x",
    style: { fontSize: 48 * SCALE, fill: 0xffffff, fontWeight: "bold" },
});
comboText.anchor.set(0.5);
comboText.visible = false;
app.stage.addChild(comboText);

const missText = new PIXI.Text({
    text: "miss!",
    style: { fontSize: 64 * SCALE, fill: 0xff3333, fontWeight: "bold" },
});
missText.anchor.set(0.5);
missText.visible = false;
app.stage.addChild(missText);

let comboCurrentScale = 1;
let missCurrentScale = 1;

export function updateStatsDisplay() {
    comboText.text = `${window.combo}x`;
    if (window.combo > 0) {
        comboCurrentScale = 1.5;
        comboText.visible = true;
        missText.visible = false;
    } else {
        comboText.visible = false;
    }
}

export function showMiss() {
    comboText.visible = false;
    missText.visible = true;
    missCurrentScale = 1.5;
}

export function updateComboPosition() {
    const player = window.player;
    if (player) {
        comboText.x = player.x + 50 * SCALE;
        comboText.y = player.y - 150 * SCALE;
        missText.x = player.x + 50 * SCALE;
        missText.y = player.y - 150 * SCALE;
    }
}

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
        missText.scale.set(missCurrentScale);
    } else {
        missCurrentScale = 1;
        missText.scale.set(1);
    }
}
