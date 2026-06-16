import { music, musicReady } from "./audio.js";
import { circlePool } from "./circlePool.js";
import { updateComboPosition, animateComboScale } from "./stats.js";
import {
    hideOverlay,
    hideStartText,
    showOverlay,
    showReady,
    updateLoadingText,
} from "./ui.js";

const app = window.app;
const WIDTH = window.gameWidth;
const SCALE = window.gameScale;
const RADIUS = 20 * SCALE;
let bpm = 172;

app.stage.addChild(window._overlay);
app.stage.addChild(window._loadingText);
app.stage.addChild(window._startText);

const GENERATE_INTERVAL_MS = 60 / bpm;

musicReady.then(() => {
    showReady();
});

function pauseGame() {
    window.isPaused = true;
    showOverlay();
    music.pause();
}

function resumeGame() {
    window.isPaused = false;
    hideOverlay();
    music.resume();
}

window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && window.gameState === "playing") {
        if (window.isPaused) {
            resumeGame();
        } else {
            pauseGame();
        }
    }
});

const startGame = () => {
    window.gameState = "playing";
    music.play(() => {
        window.gameState = "ended";
        circlePool.releaseAll();
        alert(
            `游戏结束！\n\nCombo: ${window.combo}\n最大Combo: ${window.maxCombo}\nHit: ${window.hitCount}\nMiss: ${window.missCount}`,
        );
        location.reload();
    });
};

app.canvas.addEventListener("click", () => {
    if (window.gameState === "waiting") {
        if (!music.isLoaded) return;
        hideOverlay();
        hideStartText();
        startGame();
    } else if (window.isPaused) {
        resumeGame();
    }
});

app.ticker.add((ticker) => {
    updateComboPosition();
    animateComboScale();
    updateLoadingText();

    if (window.gameState !== "playing" || window.isPaused) return;

    const now = Date.now();
    if (!window._lastGen) window._lastGen = now;
    if (now - window._lastGen >= GENERATE_INTERVAL_MS * 1000) {
        window._lastGen = now;
        const playfieldWidth = 512 * SCALE;
        const centerX = WIDTH / 2;
        const leftBound = centerX - playfieldWidth / 2;
        const rightBound = centerX + playfieldWidth / 2;

        const randX = Math.random() * (rightBound - leftBound) + leftBound;
        circlePool.get(randX, -RADIUS - 2 * SCALE);
    }

    circlePool.update(ticker.deltaTime);
});
