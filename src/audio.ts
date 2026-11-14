import { sound } from "./vendor/pixi-sound.js";

// Pause behaviour is controlled by the game itself. @pixi/sound's automatic
// blur handling would otherwise pause only WebAudio sounds while storyboard
// samples and video keep playing (and resume them unexpectedly on focus).
if (sound.supported) {
    sound.disableAutoPause = true;
}

const SAMPLE_ROOT = `${import.meta.env.BASE_URL}osu-resources/Samples`;

const HIT_SAMPLE_SETS = ["normal", "soft", "drum"];
const HIT_SOUND_LAYERS = [
    { bit: 0, suffix: "hitnormal", volume: 1 },
    { bit: 8, suffix: "hitclap", volume: 0.8 },
    { bit: 2, suffix: "hitwhistle", volume: 0.8 },
    { bit: 4, suffix: "hitfinish", volume: 0.9 },
];
const CATCH_SOUND_LOOKAHEAD_SECONDS = 0.004;
const activeCatchSources = new Set();

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function addSound(alias, path, preload = false) {
    if (sound.exists(alias)) return;

    sound.add(alias, {
        url: `${SAMPLE_ROOT}/${path}`,
        preload,
    });
}

function ensureAudioContextRunning() {
    try {
        const context = sound.context?.audioContext;
        if (context && context.state === "suspended") {
            context.resume().catch(() => {
                // The browser may still require another user gesture.
            });
        }
    } catch {
        // Ignore contexts that are unavailable or already closed.
    }
}

function playSound(alias, options) {
    ensureAudioContextRunning();
    if (!sound.exists(alias)) return null;

    const asset = sound.find(alias);
    if (!asset.isPlayable) {
        // Start a lazy load once. Calling Sound#load() again while the first
        // decode is still pending causes @pixi/sound to decode twice.
        if (!asset.preload) {
            asset.preload = true;
            asset.media.load();
        }
        return null;
    }

    return sound.play(alias, options);
}

function playCatchLayer(alias, options) {
    if (!sound.supported || sound.useLegacy || !sound.exists(alias)) {
        return playSound(alias, options);
    }

    const audioContext = sound.context?.audioContext;
    const context = sound.context;
    const asset = sound.find(alias);
    const buffer = asset.media?.buffer;

    if (
        !audioContext ||
        audioContext.state !== "running" ||
        !buffer ||
        context.muted
    ) {
        return playSound(alias, options);
    }

    const source = audioContext.createBufferSource();
    const gain = audioContext.createGain();
    const panner = audioContext.createStereoPanner
        ? audioContext.createStereoPanner()
        : null;
    const instanceVolume = clamp(
        (options.volume ?? 1) * (asset.volume ?? 1) * context.volume,
        0,
        1,
    );

    source.buffer = buffer;
    gain.gain.value = instanceVolume;
    source.connect(gain);

    if (panner) {
        panner.pan.value = clamp(options.pan ?? 0, -1, 1);
        gain.connect(panner);
        panner.connect(context.destination);
    } else {
        gain.connect(context.destination);
    }

    const cleanup = () => {
        activeCatchSources.delete(source);
        source.disconnect();
        gain.disconnect();
        panner?.disconnect();
    };

    source.addEventListener("ended", cleanup, { once: true });
    activeCatchSources.add(source);

    try {
        source.start(audioContext.currentTime + CATCH_SOUND_LOOKAHEAD_SECONDS);
    } catch {
        cleanup();
        return playSound(alias, options);
    }

    return source;
}

for (const sampleSet of HIT_SAMPLE_SETS) {
    for (const layer of HIT_SOUND_LAYERS) {
        addSound(
            `${sampleSet}-${layer.suffix}`,
            `Gameplay/${sampleSet}-${layer.suffix}.wav`,
            true,
        );
    }
}

addSound("catch-banana", "Gameplay/catch-banana.wav", true);
addSound("combobreak", "Gameplay/combobreak.mp3", true);
addSound("pause-loop", "Gameplay/pause-loop.mp3", true);
addSound("restart", "Gameplay/restart.wav", true);
addSound("resume-countdown", "Gameplay/resume-countdown.wav", true);
addSound("spinnerspin", "Gameplay/spinnerspin.wav", true);
addSound("spinnerbonus", "Gameplay/spinnerbonus.wav", true);

addSound("rank-impact-pass", "Results/rank-impact-pass.wav", true);
addSound("rank-impact-pass-ss", "Results/rank-impact-pass-ss.wav", true);
addSound("rank-impact-fail", "Results/rank-impact-fail.wav", true);
addSound("applause-a", "Results/applause-a.wav", true);

addSound("ui-hover", "UI/button-hover.wav", true);
addSound("ui-select", "UI/button-select.wav", true);
addSound("ui-dialog-open", "UI/dialog-pop-in.wav", true);
addSound("ui-dialog-close", "UI/dialog-pop-out.wav", true);
addSound("ui-notification", "UI/notification-default.wav", true);
addSound("ui-notification-error", "UI/notification-error.wav", true);
addSound("ui-notification-done", "UI/notification-done.wav", true);
addSound("song-select-confirm", "SongSelect/confirm-selection.wav", true);
addSound("song-select-difficulty", "SongSelect/select-difficulty.wav", true);
addSound("menu-back", "Menu/back-to-top.wav", true);
addSound("menu-play-select", "Menu/button-play-select.wav", true);

let audioUnlocked = false;

function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;

    try {
        const context = sound.context?.audioContext;
        if (context && context.state === "suspended") {
            context.resume().catch((error) => {
                console.warn("恢复音频上下文失败", error);
            });
        }
    } catch (error) {
        console.warn("解锁音频失败", error);
    }
}

window.addEventListener("pointerdown", unlockAudio, {
    once: true,
    capture: true,
});
window.addEventListener("keydown", unlockAudio, {
    once: true,
    capture: true,
});

export function playCatchSound(
    note,
    playerX,
    playerW,
    leftBound,
    playfieldWidth,
) {
    const playerCenter = playerX + playerW / 2;
    const t = clamp((playerCenter - leftBound) / playfieldWidth, 0, 1);
    const pan = (t - 0.5) * 2;

    if (note?.type === "banana") {
        playCatchLayer("catch-banana", {
            volume: 0.8,
            pan,
        });
        return;
    }

    const sampleSet = HIT_SAMPLE_SETS.includes(note?.sampleSet)
        ? note.sampleSet
        : "normal";
    const hitSound = note?.hitSound || 0;
    const baseVolume = clamp((note?.volume ?? 100) / 100, 0, 1) * 0.9;

    for (const layer of HIT_SOUND_LAYERS) {
        if (layer.bit !== 0 && !(hitSound & layer.bit)) continue;
        playCatchLayer(`${sampleSet}-${layer.suffix}`, {
            volume: baseVolume * layer.volume,
            pan,
        });
    }
}

const GAMEPLAY_SOUND_ALIASES = [
    "catch-banana",
    "combobreak",
    "spinnerbonus",
    "restart",
    "resume-countdown",
    "spinnerspin",
    ...HIT_SAMPLE_SETS.flatMap((sampleSet) =>
        HIT_SOUND_LAYERS.map((layer) => `${sampleSet}-${layer.suffix}`),
    ),
];

export function stopGameplaySounds() {
    for (const source of activeCatchSources) {
        try {
            source.stop();
        } catch {
            // The source may have ended between iteration and stop.
        }
    }
    activeCatchSources.clear();

    for (const alias of GAMEPLAY_SOUND_ALIASES) {
        if (sound.exists(alias)) {
            sound.stop(alias);
        }
    }
}

export function playComboBreak() {
    playSound("combobreak", { volume: 0.7 });
}

export function playRestart() {
    playSound("restart", { volume: 0.65 });
}

export function playResumeCountdown() {
    playSound("resume-countdown", { volume: 0.65 });
}

let pauseLoopPlaying = false;

export function startPauseLoop() {
    if (pauseLoopPlaying) return;
    if (sound.exists("pause-loop") && sound.find("pause-loop").isPlaying) {
        pauseLoopPlaying = true;
        return;
    }

    const instance = playSound("pause-loop", {
        loop: true,
        volume: 0.45,
    });
    if (instance) {
        pauseLoopPlaying = true;
    }
}

export function stopPauseLoop() {
    pauseLoopPlaying = false;
    if (sound.exists("pause-loop")) {
        sound.stop("pause-loop");
    }
}

let spinnerLoopPlaying = false;

export function startSpinnerLoop() {
    if (spinnerLoopPlaying) return;
    if (sound.exists("spinnerspin") && sound.find("spinnerspin").isPlaying) {
        spinnerLoopPlaying = true;
        return;
    }

    const instance = playSound("spinnerspin", {
        loop: true,
        volume: 0.35,
    });
    if (instance) {
        spinnerLoopPlaying = true;
    }
}

export function stopSpinnerLoop() {
    spinnerLoopPlaying = false;
    if (sound.exists("spinnerspin")) {
        sound.stop("spinnerspin");
    }
}

export function playResultsSound(accuracy) {
    const passed = accuracy >= 0.8;
    const alias =
        accuracy >= 0.98
            ? "rank-impact-pass-ss"
            : passed
              ? "rank-impact-pass"
              : "rank-impact-fail";

    playSound(alias, { volume: 0.55 });
    if (passed) {
        playSound("applause-a", { volume: 0.35 });
    }
}

export function playSpinnerBonus() {
    playSound("spinnerbonus", { volume: 0.55 });
}

export function playUiHover() {
    playSound("ui-hover", { volume: 0.3 });
}

export function playUiSelect() {
    playSound("ui-select", { volume: 0.45 });
}

export function playUiDialogOpen() {
    playSound("ui-dialog-open", { volume: 0.45 });
}

export function playUiDialogClose() {
    playSound("ui-dialog-close", { volume: 0.4 });
}

export function playNotification(type = "info") {
    const alias =
        type === "error"
            ? "ui-notification-error"
            : type === "success"
              ? "ui-notification-done"
              : "ui-notification";
    playSound(alias, { volume: 0.45 });
}

export function playSongSelectConfirm() {
    playSound("song-select-confirm", { volume: 0.5 });
}

export function playSongSelectDifficulty() {
    playSound("song-select-difficulty", { volume: 0.45 });
}

export function playMenuBack() {
    playSound("menu-back", { volume: 0.4 });
}

export function playMenuPlaySelect() {
    playSound("menu-play-select", { volume: 0.45 });
}

let currentMusic = null;
let currentAlias = null;
let musicCounter = 0;
let musicLoadToken = 0;

export function loadMusic(url) {
    if (!url) {
        unloadMusic();
        return Promise.resolve(null);
    }

    musicCounter += 1;
    const alias = `music-${musicCounter}`;
    const token = ++musicLoadToken;

    return new Promise((resolve, reject) => {
        sound.add(alias, {
            url,
            preload: true,
            volume: 0.85,
            loaded: (error) => {
                if (error) {
                    sound.remove(alias);
                    if (token === musicLoadToken) reject(error);
                    else resolve(null);
                    return;
                }

                if (token !== musicLoadToken) {
                    sound.remove(alias);
                    resolve(null);
                    return;
                }

                const previousMusic = currentMusic;
                const previousAlias = currentAlias;

                if (previousMusic) {
                    try {
                        previousMusic.stop();
                    } catch (stopError) {
                        console.warn("停止旧音乐失败", stopError);
                    }
                }
                if (previousAlias) {
                    sound.remove(previousAlias);
                }

                currentMusic = sound.find(alias);
                currentAlias = alias;
                resolve(currentMusic);
            },
        });
    });
}

export function getMusicDurationMs() {
    if (!currentMusic || !Number.isFinite(currentMusic.duration)) return 0;
    return currentMusic.duration * 1000;
}

export function playMusic(onComplete, startMs = 0) {
    if (!currentMusic) return null;
    ensureAudioContextRunning();
    currentMusic.paused = false;
    return currentMusic.play({
        start: Math.max(0, startMs) / 1000,
        loop: false,
        complete: () => {
            if (onComplete) onComplete();
        },
    });
}

export function seekMusic(positionMs, shouldPlay = true) {
    if (!currentMusic) return false;

    ensureAudioContextRunning();
    currentMusic.stop();
    if (!shouldPlay) return false;

    currentMusic.paused = false;
    currentMusic.play({
        start: Math.max(0, positionMs) / 1000,
        loop: false,
    });
    return true;
}

export function pauseMusic() {
    if (currentMusic) currentMusic.pause();
}

export function resumeMusic() {
    ensureAudioContextRunning();
    if (currentMusic) currentMusic.resume();
}

export function stopMusic() {
    if (!currentMusic) return;
    try {
        currentMusic.stop();
    } catch (error) {
        console.warn("停止音乐失败", error);
    }
}

export function unloadMusic() {
    musicLoadToken += 1;
    if (currentMusic) {
        try {
            currentMusic.stop();
        } catch (error) {
            console.warn("停止音乐失败", error);
        }
    }
    if (currentAlias) {
        sound.remove(currentAlias);
    }
    currentMusic = null;
    currentAlias = null;
}
