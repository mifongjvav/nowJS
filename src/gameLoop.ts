import { CATCH_WINDOW_MS, circlePool } from "./circlePool.ts";
import { animateComboScale, resetStats, updateComboPosition } from "./stats.ts";
import * as ui from "./ui.ts";
import { getCurrentChart, initSongSelect } from "./songSelect.ts";
import { i18n } from "./i18n/index.ts";
import {
    pauseMusic,
    playMenuBack,
    playMusic,
    playRestart,
    playResultsSound,
    playResumeCountdown,
    playSpinnerBonus,
    seekMusic,
    resumeMusic,
    startPauseLoop,
    startSpinnerLoop,
    stopGameplaySounds,
    stopMusic,
    stopPauseLoop,
    stopSpinnerLoop,
} from "./audio.ts";
import {
    resetAutoPlayMotion,
    toggleAutoPlay,
    updateAutoPlay,
} from "./autoplay.ts";
import {
    pauseMedia,
    resumeMedia,
    seekMedia,
    setStoryboardPassing,
    startMedia,
    stopMedia,
    updateMedia,
} from "./background.ts";
import { resetManiaInput, setManiaMode, updateMania } from "./mania.ts";

const app = window.app;

let chartTime = 0;
let nextNoteIndex = 0;
let endHandled = false;
let musicStarted = false;
let bananasActiveLastFrame = false;
let lastFrameTime = 0;
let isSeeking = false;
let seekHasAudio = false;
let nextBreakIndex = 0;
let sectionStartHits = 0;
let sectionStartMisses = 0;
let breakResults = [];
let finalBreakStateApplied = false;

initSongSelect();

ui.setUICallbacks({
    start: startGame,
    resume: resumeGame,
    restart: restartGame,
    exit: exitToMenu,
    seekStart: beginGameSeek,
    seekEnd: finishGameSeek,
});

function startGame() {
    const chart = getCurrentChart();
    if (!chart) {
        ui.showToast(i18n.toast.noChart);
        return;
    }

    ui.hideMenu();
    ui.hidePause();
    ui.hideResults();
    ui.hideLoading();
    ui.showHud(chart);

    resetStats();
    circlePool.releaseAll();
    stopMusic();
    stopPauseLoop();
    stopSpinnerLoop();
    bananasActiveLastFrame = false;

    if (window.player) {
        window.player.x = (window.gameWidth - window.playerWidth) / 2;
    }
    resetAutoPlayMotion();
    setManiaMode(chart.mania || null);

    const noteLeadIn = Math.max(0, chart.preemptMs - chart.firstNoteTime);
    const storyboardLeadIn = Math.max(0, -(chart.storyboardStartTime || 0));
    const leadIn = Math.max(noteLeadIn, storyboardLeadIn);
    chartTime = -leadIn;
    lastFrameTime = performance.now();
    window.chartTime = chartTime;
    nextNoteIndex = 0;
    endHandled = false;
    musicStarted = leadIn <= 0;
    resetStoryboardSections(chartTime);

    window.gameState = "playing";
    window.isPaused = false;
    window.gameplayLayer.visible = true;
    window.statsLayer.visible = true;

    startMedia(chartTime);

    if (musicStarted) playMusic();
}

function resetStoryboardSections(time) {
    const breaks = window.currentChart?.breaks || [];
    nextBreakIndex = breaks.findIndex((item) => item.start > time);
    if (nextBreakIndex === -1) nextBreakIndex = breaks.length;
    sectionStartHits = window.hitCount;
    sectionStartMisses = window.missCount;
    breakResults = [];
    finalBreakStateApplied = false;
    setStoryboardPassing(true);
}

function updateStoryboardSections(time) {
    const chart = window.currentChart;
    const breaks = chart?.breaks || [];

    while (
        nextBreakIndex < breaks.length &&
        time >= breaks[nextBreakIndex].start
    ) {
        const hits = window.hitCount - sectionStartHits;
        const misses = window.missCount - sectionStartMisses;
        const total = hits + misses;
        // osu! checks the health bar when a break begins. nowJS has no health
        // bar, so section accuracy above 50% is used as the pass condition.
        const passing = total === 0 || hits / total > 0.5;
        breakResults.push(passing);
        setStoryboardPassing(passing);
        sectionStartHits = window.hitCount;
        sectionStartMisses = window.missCount;
        nextBreakIndex += 1;
    }

    if (
        !finalBreakStateApplied &&
        breaks.length > 0 &&
        chart &&
        time > chart.lastNoteTime
    ) {
        const passedBreaks = breakResults.filter(Boolean).length;
        setStoryboardPassing(passedBreaks >= breakResults.length / 2);
        finalBreakStateApplied = true;
    }
}

function pauseGame(silent = false) {
    if (window.gameState !== "playing") return;

    if (window.isPaused) {
        // Auto-pausing after an explicit pause should silence the pause loop
        // while the window is unfocused.
        if (silent) stopPauseLoop();
        return;
    }

    window.isPaused = true;
    pauseMusic();
    pauseMedia();
    stopSpinnerLoop();
    stopGameplaySounds();
    resetManiaInput();
    bananasActiveLastFrame = false;

    if (silent) {
        stopPauseLoop();
    } else {
        startPauseLoop();
    }

    ui.showPause();
}

function resumeGame() {
    if (window.gameState !== "playing" || !window.isPaused) return;
    window.isPaused = false;
    stopPauseLoop();
    playResumeCountdown();
    resumeMusic();
    resumeMedia();
    lastFrameTime = performance.now();
    ui.hidePause();
}

function beginGameSeek() {
    if (
        window.gameState !== "playing" ||
        window.isPaused ||
        !window.autoPlay ||
        isSeeking
    ) {
        return false;
    }

    isSeeking = true;
    seekHasAudio = Boolean(window.currentChart?.audioUrl);
    pauseMusic();
    pauseMedia();
    stopSpinnerLoop();
    resetManiaInput();
    bananasActiveLastFrame = false;
    circlePool.releaseAll();
    resetAutoPlayMotion();
    return true;
}

function lowerBoundNote(time) {
    const notes = window.currentChart?.notes || [];
    let low = 0;
    let high = notes.length;

    while (low < high) {
        const middle = (low + high) >> 1;
        if (notes[middle].time < time) low = middle + 1;
        else high = middle;
    }

    return low;
}

function finishGameSeek(progress) {
    if (!isSeeking || window.gameState !== "playing") return;

    const chart = window.currentChart;
    if (!chart) {
        isSeeking = false;
        return;
    }

    chartTime = Math.max(0, Math.min(1, progress)) * chart.endTime;
    window.chartTime = chartTime;
    lastFrameTime = performance.now();
    endHandled = false;
    nextNoteIndex = lowerBoundNote(chartTime + CATCH_WINDOW_MS);
    musicStarted = chartTime >= 0;

    // A seek starts a fresh autoplay segment. This avoids counting notes
    // already passed before the seek or double-counting notes after rewinding.
    resetStats();
    resetAutoPlayMotion();
    circlePool.releaseAll();
    resetManiaInput();
    resetStoryboardSections(chartTime);
    stopSpinnerLoop();
    bananasActiveLastFrame = false;

    seekMedia(chartTime);
    isSeeking = false;

    const hasTrack =
        seekHasAudio &&
        chart.audioUrl &&
        (!chart.audioDurationMs || chartTime < chart.audioDurationMs);
    if (hasTrack) seekMusic(chartTime, true);
    else seekMusic(chartTime, false);

    resumeMedia();
    ui.updateHudProgress(chartTime / Math.max(1, chart.endTime));
}

function restartGame() {
    ui.hidePause();
    ui.hideResults();
    stopPauseLoop();
    stopSpinnerLoop();
    playRestart();
    startGame();
}

function endGame() {
    if (endHandled) return;
    endHandled = true;

    window.gameState = "ended";
    window.isPaused = false;
    stopMusic();
    stopPauseLoop();
    stopSpinnerLoop();
    bananasActiveLastFrame = false;
    pauseMedia();
    circlePool.releaseAll();
    resetAutoPlayMotion();
    resetManiaInput();
    ui.hideHud();

    const total = window.hitCount + window.missCount;
    const accuracy = total > 0 ? window.hitCount / total : 1;

    playResultsSound(accuracy);
    ui.showResults(window.currentChart, {
        accuracy,
        total,
        maxCombo: window.maxCombo,
        hitCount: window.hitCount,
        missCount: window.missCount,
    });
}

function exitToMenu() {
    stopMusic();
    stopPauseLoop();
    stopSpinnerLoop();
    stopMedia();
    bananasActiveLastFrame = false;
    playMenuBack();
    circlePool.releaseAll();
    resetStats();
    resetAutoPlayMotion();
    resetManiaInput();
    setManiaMode(null);

    window.gameState = "menu";
    window.isPaused = false;
    window.chartTime = 0;
    window.gameplayLayer.visible = false;
    window.statsLayer.visible = false;

    ui.hideHud();
    ui.hidePause();
    ui.hideResults();
    ui.hideLoading();
    ui.showMenu();
}

window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (window.gameState !== "playing") return;

    if (window.isPaused) {
        resumeGame();
    } else {
        pauseGame();
    }
});

window.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() !== "a" || event.repeat) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const tagName = document.activeElement
        ? document.activeElement.tagName
        : "";
    if (["INPUT", "TEXTAREA", "SELECT"].includes(tagName)) return;
    if (document.querySelector("mdui-dialog[open]")) return;
    if (window.gameState !== "playing" && window.gameState !== "menu") return;

    toggleAutoPlay();
});

document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseGame(true);
});

window.addEventListener("blur", () => {
    pauseGame(true);
});

app.ticker.add((ticker) => {
    updateComboPosition();
    animateComboScale();

    if (window.gameState !== "playing" || window.isPaused || isSeeking) return;

    const chart = window.currentChart;
    if (!chart) return;

    // Pixi's deltaMS is capped (and speed-scaled). Using it as the song clock
    // makes music/video run ahead on slow frames, causing repeated video seeks.
    const now = performance.now();
    chartTime += now - lastFrameTime;
    lastFrameTime = now;
    const delta = Math.min(ticker.deltaMS, 250);

    if (!musicStarted && chartTime >= 0) {
        musicStarted = true;
        // Audio starts here, not at the previous frame's lead-in boundary.
        chartTime = 0;
        playMusic();
    }
    window.chartTime = chartTime;

    updateStoryboardSections(chartTime);
    updateMedia(chartTime);

    while (
        nextNoteIndex < chart.notes.length &&
        chart.notes[nextNoteIndex].time - chartTime <= chart.preemptMs
    ) {
        circlePool.spawnNote(chart.notes[nextNoteIndex], chartTime);
        nextNoteIndex += 1;
    }

    if (!chart.mania) {
        updateAutoPlay(chartTime, delta);
    }
    updateMania(chartTime, delta);
    circlePool.update(chartTime);

    const bananasActive = circlePool.activeCircles.some(
        (circle) => circle.note?.type === "banana",
    );
    if (bananasActive) {
        if (!bananasActiveLastFrame) {
            startSpinnerLoop();
        }
    } else if (bananasActiveLastFrame) {
        stopSpinnerLoop();
        playSpinnerBonus();
    }
    bananasActiveLastFrame = bananasActive;

    ui.updateHudProgress(chartTime / Math.max(1, chart.endTime));

    if (chartTime >= chart.endTime) {
        endGame();
    }
});
