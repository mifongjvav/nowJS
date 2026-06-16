import * as PIXI from "pixi.js";

const app = window.app;
const SCALE = window.gameScale;

window.combo = 0;
window.maxCombo = 0;
window.hitCount = 0;
window.missCount = 0;

const hitText = new PIXI.Text({
    text: "Hit: 0",
    style: { fontSize: 36 * SCALE, fill: 0xffcc00, fontWeight: "bold" },
});
hitText.x = 20 * SCALE;
hitText.y = 20 * SCALE;
app.stage.addChild(hitText);

const missCountText = new PIXI.Text({
    text: "Miss: 0",
    style: { fontSize: 36 * SCALE, fill: 0xff3333, fontWeight: "bold" },
});
missCountText.x = 20 * SCALE;
missCountText.y = 20 * SCALE + 42 * SCALE;
app.stage.addChild(missCountText);

const comboText = new PIXI.Text({
    text: "0x",
    style: { fontSize: 48 * SCALE, fill: 0xffffff, fontWeight: "bold" },
});
comboText.anchor.set(0.5);
comboText.visible = false;
app.stage.addChild(comboText);

const missPopup = new PIXI.Text({
    text: "miss!",
    style: { fontSize: 64 * SCALE, fill: 0xff3333, fontWeight: "bold" },
});
missPopup.anchor.set(0.5);
missPopup.visible = false;
app.stage.addChild(missPopup);

let comboCurrentScale = 1;
let missCurrentScale = 1;

export function updateStatsDisplay() {
    hitText.text = `Hit: ${window.hitCount}`;
    missCountText.text = `Miss: ${window.missCount}`;
    comboText.text = `${window.combo}x`;
    if (window.combo > 0) {
        comboCurrentScale = 1.5;
        comboText.visible = true;
        missPopup.visible = false;
    } else {
        comboText.visible = false;
    }
}

export function showMiss() {
    comboText.visible = false;
    missPopup.visible = true;
    missCurrentScale = 1.5;
}

export function updateComboPosition() {
    const player = window.player;
    if (player) {
        comboText.x = player.x + 50 * SCALE;
        comboText.y = player.y - 150 * SCALE;
        missPopup.x = player.x + 50 * SCALE;
        missPopup.y = player.y - 150 * SCALE;
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
        missPopup.scale.set(missCurrentScale);
    } else {
        missCurrentScale = 1;
        missPopup.scale.set(1);
    }
}
