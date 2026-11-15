import { snackbar } from "./vendor/mdui.js";
import { injectBaseStyles } from "./styles.ts";
import { readStorage } from "./storage.ts";
import { RESOLUTIONS, showResolutionSelector } from "./resolution.ts";
import {
    applyI18n,
    format,
    getLanguage,
    i18n,
    onLanguageChange,
    setLanguage,
} from "./i18n/index.ts";
import { isAutoPlayEnabled, setAutoPlay } from "./autoplay.ts";
import {
    playMenuPlaySelect,
    playNotification,
    playSongSelectDifficulty,
    playUiDialogClose,
    playUiDialogOpen,
    playUiHover,
    playUiSelect,
} from "./audio.ts";
import type {
    DifficultySummary,
    GameChart,
    GameResults,
    PresetChart,
} from "./domain.ts";

injectBaseStyles();

interface UICallbacks {
    start: () => void;
    importFiles: (files: File[]) => void;
    preset: (preset: PresetChart) => void;
    seekStart: () => boolean;
    seekEnd: (progress: number) => void;
    resume: () => void;
    restart: () => void;
    exit: () => void;
}

const callbacks: UICallbacks = {
    start: () => {},
    importFiles: () => {},
    preset: () => {},
    seekStart: () => false,
    seekEnd: () => {},
    resume: () => {},
    restart: () => {},
    exit: () => {},
};

export function setUICallbacks(next: Partial<UICallbacks>): void {
    Object.assign(callbacks, next);
}

export function setPresetCharts(presets: readonly PresetChart[]): void {
    presetGrid.replaceChildren();

    for (const preset of presets || []) {
        const card = document.createElement("mdui-card");
        card.className = "now-preset-card";
        card.setAttribute("clickable", "");
        card.setAttribute("role", "listitem");
        card.setAttribute("tabindex", "0");
        card.setAttribute("aria-label", preset.label);
        card.innerHTML = `
            <span class="now-preset-mark" aria-hidden="true">osu!</span>
            <span class="now-preset-label"></span>
        `;
        card.querySelector(".now-preset-label").textContent = preset.label;

        const select = () => callbacks.preset(preset);
        card.addEventListener("click", select);
        card.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                select();
            }
        });
        presetGrid.appendChild(card);
    }
}

function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return "--:--";
    const totalSeconds = Math.round(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatResolutionChip() {
    const key = readStorage("gameResolution") || "1080p";
    return RESOLUTIONS[key] ? key.toUpperCase() : "1080P";
}

const root = document.createElement("div");
root.id = "nowjs-ui";
root.className = "now-ui-layer";
root.innerHTML = `
    <div class="now-screen now-menu-screen now-hidden" id="now-menu">
        <div class="now-ambient" aria-hidden="true">
            <span class="now-ambient-orb now-ambient-orb-a"></span>
            <span class="now-ambient-orb now-ambient-orb-b"></span>
        </div>
        <mdui-top-app-bar class="now-top-app-bar" style="position: relative">
            <div class="now-brand">
                <div class="now-brand-mark" aria-hidden="true">n</div>
                <div class="now-brand-copy">
                    <h1>nowJS</h1>
                    <p data-i18n="app.brandTagline">${i18n.app.brandTagline}</p>
                </div>
            </div>
            <div class="now-top-actions">
                <mdui-dropdown>
                    <mdui-button-icon
                        slot="trigger"
                        id="now-language-btn"
                        aria-label="${i18n.menu.languageAria}"
                        data-i18n-aria-label="menu.languageAria"
                    >
                        <mdui-icon-language aria-hidden="true"></mdui-icon-language>
                    </mdui-button-icon>
                    <mdui-menu
                        id="now-language-menu"
                        selects="single"
                        value="${getLanguage()}"
                    >
                        <mdui-menu-item value="zh-cn" data-i18n="language.zhCN">
                            ${i18n.language.zhCN}
                        </mdui-menu-item>
                        <mdui-menu-item value="en-us" data-i18n="language.enUS">
                            ${i18n.language.enUS}
                        </mdui-menu-item>
                    </mdui-menu>
                </mdui-dropdown>
                <mdui-button-icon
                    id="now-autoplay-btn"
                    variant="tonal"
                    selectable
                    aria-label="${i18n.autoplay.aria}"
                    title="${i18n.autoplay.aria}"
                    data-i18n-aria-label="autoplay.aria"
                    data-i18n-title="autoplay.aria"
                >
                    <mdui-icon-smart-toy aria-hidden="true"></mdui-icon-smart-toy>
                </mdui-button-icon>
                <mdui-chip
                    id="now-resolution-chip"
                    class="now-resolution-chip"
                    aria-label="${i18n.menu.resolutionAria}"
                    data-i18n-aria-label="menu.resolutionAria"
                >
                    <mdui-icon-settings slot="icon" aria-hidden="true"></mdui-icon-settings>
                    <span id="now-resolution-label">${formatResolutionChip()}</span>
                </mdui-chip>
            </div>
        </mdui-top-app-bar>

        <main class="now-menu-main">
            <section class="now-presets" aria-labelledby="now-presets-title">
                <div class="now-presets-heading">
                    <h2 id="now-presets-title" data-i18n="menu.presetsTitle">
                        ${i18n.menu.presetsTitle}
                    </h2>
                    <span data-i18n="menu.presetsHint">${i18n.menu.presetsHint}</span>
                </div>
                <div class="now-preset-grid" id="now-preset-grid" role="list"></div>
            </section>

            <mdui-card class="now-song-card" id="now-song-card" variant="filled">
                <div class="now-song-card-inner">
                    <div class="now-song-cover is-empty" id="now-song-cover" aria-hidden="true">
                        <mdui-icon-music-note class="now-cover-glyph"></mdui-icon-music-note>
                    </div>
                    <div class="now-song-body">
                        <p class="now-eyebrow" id="now-song-kicker">
                            ${i18n.menu.awaitingChart}
                        </p>
                        <h2 class="now-song-title" id="now-song-title" aria-live="polite">
                            ${i18n.menu.importPrompt}
                        </h2>
                        <p class="now-song-artist" id="now-song-artist">
                            ${i18n.menu.importDescription}
                        </p>
                        <div class="now-song-meta" id="now-song-meta"></div>
                        <div class="now-song-actions">
                            <mdui-button
                                variant="filled"
                                id="now-start-btn"
                                disabled
                            >
                                <mdui-icon-play-arrow slot="icon" aria-hidden="true"></mdui-icon-play-arrow>
                                <span id="now-start-label">${i18n.menu.start}</span>
                            </mdui-button>
                            <mdui-button variant="tonal" id="now-import-btn">
                                <mdui-icon-folder-open slot="icon" aria-hidden="true"></mdui-icon-folder-open>
                                <span id="now-import-label">${i18n.menu.import}</span>
                            </mdui-button>
                        </div>
                    </div>
                </div>
            </mdui-card>

            <mdui-card
                variant="outlined"
                clickable
                class="now-drop-hint"
                id="now-drop-hint"
            >
                <div class="now-drop-hint-inner">
                    <mdui-icon-upload-file aria-hidden="true"></mdui-icon-upload-file>
                    <span data-i18n="menu.dropHint">${i18n.menu.dropHint}</span>
                </div>
            </mdui-card>

            <p class="now-play-hint" data-i18n="menu.playHint">
                ${i18n.menu.playHint}
            </p>
        </main>

        <footer class="now-menu-footer">
            <span id="now-file-name">${i18n.app.footer}</span>
            <button
                type="button"
                class="now-sound-credit"
                id="now-license-btn"
                data-i18n="app.soundCredit"
            >${i18n.app.soundCredit}</button>
            <span data-i18n="app.footerTech">${i18n.app.footerTech}</span>
        </footer>
    </div>

    <mdui-dialog
        id="now-pause"
        class="now-compact-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="now-pause-title"
    >
        <span slot="headline" id="now-pause-title" data-i18n="pause.title">
            ${i18n.pause.title}
        </span>
        <span slot="description" data-i18n="pause.body">${i18n.pause.body}</span>
        <p class="now-mini-hint" data-i18n="pause.hint">${i18n.pause.hint}</p>
        <mdui-button slot="action" variant="text" id="now-exit-btn">
            <mdui-icon-exit-to-app slot="icon" aria-hidden="true"></mdui-icon-exit-to-app>
            <span data-i18n="pause.exit">${i18n.pause.exit}</span>
        </mdui-button>
        <mdui-button slot="action" variant="tonal" id="now-restart-btn">
            <mdui-icon-restart-alt slot="icon" aria-hidden="true"></mdui-icon-restart-alt>
            <span data-i18n="pause.restart">${i18n.pause.restart}</span>
        </mdui-button>
        <mdui-button slot="action" variant="filled" id="now-resume-btn">
            <mdui-icon-play-arrow slot="icon" aria-hidden="true"></mdui-icon-play-arrow>
            <span data-i18n="pause.resume">${i18n.pause.resume}</span>
        </mdui-button>
    </mdui-dialog>

    <mdui-dialog
        id="now-results"
        class="now-result-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="now-result-heading"
    >
        <span slot="headline" id="now-result-heading" data-i18n="results.eyebrow">
            ${i18n.results.eyebrow}
        </span>
        <div class="now-result-head">
            <div class="now-grade" id="now-grade" data-grade="S">S</div>
            <div class="now-result-copy">
                <h2 id="now-result-title">${i18n.unknown.title}</h2>
                <p id="now-result-artist"></p>
            </div>
        </div>
        <div class="now-result-stats">
            <div class="now-result-stat">
                <span data-i18n="results.accuracy">${i18n.results.accuracy}</span>
                <strong id="now-result-acc">100%</strong>
            </div>
            <div class="now-result-stat">
                <span data-i18n="results.maxCombo">${i18n.results.maxCombo}</span>
                <strong id="now-result-maxcombo">0</strong>
            </div>
            <div class="now-result-stat">
                <span data-i18n="results.hit">${i18n.results.hit}</span>
                <strong id="now-result-hit">0</strong>
            </div>
            <div class="now-result-stat">
                <span data-i18n="results.miss">${i18n.results.miss}</span>
                <strong id="now-result-miss">0</strong>
            </div>
        </div>
        <mdui-button
            slot="action"
            variant="text"
            id="now-result-exit-btn"
        >
            <mdui-icon-exit-to-app slot="icon" aria-hidden="true"></mdui-icon-exit-to-app>
            <span data-i18n="results.exit">${i18n.results.exit}</span>
        </mdui-button>
        <mdui-button
            slot="action"
            variant="filled"
            id="now-retry-btn"
        >
            <mdui-icon-replay slot="icon" aria-hidden="true"></mdui-icon-replay>
            <span data-i18n="results.retry">${i18n.results.retry}</span>
        </mdui-button>
    </mdui-dialog>

    <mdui-dialog
        id="now-difficulty"
        class="now-difficulty-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="now-difficulty-title"
        close-on-esc
        close-on-overlay-click
    >
        <span slot="headline" id="now-difficulty-title" data-i18n="difficulty.title">
            ${i18n.difficulty.title}
        </span>
        <span slot="description" id="now-difficulty-sub"></span>
        <mdui-list id="now-difficulty-list" class="now-difficulty-list"></mdui-list>
        <mdui-button
            slot="action"
            variant="text"
            id="now-difficulty-cancel"
            data-i18n="difficulty.cancel"
        >
            ${i18n.difficulty.cancel}
        </mdui-button>
    </mdui-dialog>

    <mdui-dialog
        id="now-license"
        class="now-license-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="now-license-title"
        close-on-esc
        close-on-overlay-click
    >
        <span slot="headline" id="now-license-title" data-i18n="license.title">
            ${i18n.license.title}
        </span>
        <pre class="now-license-text" id="now-license-text">${i18n.license.loading}</pre>
        <mdui-button
            slot="action"
            variant="text"
            id="now-license-close"
            data-i18n="license.close"
        >
            ${i18n.license.close}
        </mdui-button>
    </mdui-dialog>

    <div class="now-loading-screen now-hidden" id="now-loading" role="status" aria-live="polite">
        <mdui-circular-progress aria-hidden="true"></mdui-circular-progress>
        <p id="now-loading-text">${i18n.loading.default}</p>
    </div>

    <div class="now-hud now-hidden" id="now-hud">
        <mdui-linear-progress
            class="now-hud-progress"
            id="now-hud-progress"
            max="1"
            value="0"
            role="progressbar"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow="0"
            aria-label="${i18n.hud.progress}"
            data-i18n-aria-label="hud.progress"
        ></mdui-linear-progress>
        <div class="now-hud-auto now-hidden" id="now-hud-auto">
            <mdui-icon-smart-toy aria-hidden="true"></mdui-icon-smart-toy>
            <span data-i18n="autoplay.badge">${i18n.autoplay.badge}</span>
        </div>
        <div class="now-hud-song" id="now-hud-song"></div>
    </div>

    <input
        type="file"
        id="now-file-input"
        accept=".osz,.osu,.zip,.osb,.mp3,.ogg,.wav,.m4a,.mp4,.webm,.ogv,.mov,.jpg,.jpeg,.png,.webp"
        multiple
        hidden
    />
`;

document.body.appendChild(root);

const menu = root.querySelector("#now-menu");
const songCover = root.querySelector("#now-song-cover");
const songKicker = root.querySelector("#now-song-kicker");
const songTitle = root.querySelector("#now-song-title");
const songArtist = root.querySelector("#now-song-artist");
const songMeta = root.querySelector("#now-song-meta");
const startBtn = root.querySelector("#now-start-btn");
const startLabel = root.querySelector("#now-start-label");
const importBtn = root.querySelector("#now-import-btn");
const importLabel = root.querySelector("#now-import-label");
const presetGrid = root.querySelector("#now-preset-grid");
const dropHint = root.querySelector("#now-drop-hint");
const fileName = root.querySelector("#now-file-name");
const resolutionChip = root.querySelector("#now-resolution-chip");
const resolutionLabel = root.querySelector("#now-resolution-label");
const fileInput = root.querySelector("#now-file-input");
const languageMenu = root.querySelector("#now-language-menu");
const licenseBtn = root.querySelector("#now-license-btn");
const licenseDialog = root.querySelector("#now-license");
const licenseText = root.querySelector("#now-license-text");
const licenseClose = root.querySelector("#now-license-close");

const pauseDialog = root.querySelector("#now-pause");
const resultsDialog = root.querySelector("#now-results");
const difficultyDialog = root.querySelector("#now-difficulty");
const difficultyList = root.querySelector("#now-difficulty-list");
const difficultySub = root.querySelector("#now-difficulty-sub");
const difficultyCancel = root.querySelector("#now-difficulty-cancel");
const resumeBtn = root.querySelector("#now-resume-btn");
const retryBtn = root.querySelector("#now-retry-btn");
const loadingScreen = root.querySelector("#now-loading");
const loadingText = root.querySelector("#now-loading-text");
const hud = root.querySelector("#now-hud");
const hudSong = root.querySelector("#now-hud-song");
const hudProgress = root.querySelector("#now-hud-progress");
const autoplayBtn = root.querySelector("#now-autoplay-btn");
const hudAuto = root.querySelector("#now-hud-auto");

let currentSong = null;
let difficultyResolver = null;
let hudScrubbing = false;
let scrubbingPointerId = null;
let scrubbingProgress = 0;

const compactActions = window.matchMedia("(max-width: 600px)");

function syncDialogActions() {
    pauseDialog.stackedActions = compactActions.matches;
    resultsDialog.stackedActions = compactActions.matches;
}

compactActions.addEventListener("change", syncDialogActions);
syncDialogActions();

autoplayBtn.selected = isAutoPlayEnabled();
hudAuto.classList.toggle("now-hidden", !isAutoPlayEnabled());

const UI_SOUND_SELECTOR = [
    "mdui-button",
    "mdui-button-icon",
    "mdui-chip",
    "mdui-card[clickable]",
    "mdui-list-item",
    "mdui-menu-item",
].join(",");

let hoveredSoundTarget = null;
let lastHoverSoundAt = 0;

function findUiSoundTarget(event) {
    const target = event.target;
    if (!(target instanceof Element)) return null;

    const element = target.closest(UI_SOUND_SELECTOR);
    if (!element) return null;
    if (element.closest("#now-resolution-dialog")) return null;
    if (element.disabled || element.hasAttribute("disabled")) return null;

    return element;
}

document.addEventListener("pointerover", (event) => {
    if (event.pointerType === "touch") return;

    const target = findUiSoundTarget(event);
    if (!target || target === hoveredSoundTarget) return;

    hoveredSoundTarget = target;
    const now = performance.now();
    if (now - lastHoverSoundAt < 55) return;

    lastHoverSoundAt = now;
    playUiHover();
});

document.addEventListener("pointerout", (event) => {
    const target = findUiSoundTarget(event);
    if (target === hoveredSoundTarget) {
        hoveredSoundTarget = null;
    }
});

document.addEventListener("click", (event) => {
    const target = findUiSoundTarget(event);
    if (!target) return;

    if (target.id === "now-start-btn") {
        playMenuPlaySelect();
    } else if (target.matches("mdui-list-item")) {
        playSongSelectDifficulty();
    } else {
        playUiSelect();
    }
});

for (const dialog of [pauseDialog, difficultyDialog]) {
    dialog.addEventListener("opened", () => playUiDialogOpen());
}
for (const dialog of [pauseDialog, resultsDialog, difficultyDialog]) {
    dialog.addEventListener("closed", () => playUiDialogClose());
}

function showElement(element) {
    element.classList.remove("now-hidden");
}

function hideElement(element) {
    element.classList.add("now-hidden");
}

function clearMeta() {
    songMeta.innerHTML = "";
}

function addMeta(label, value) {
    const item = document.createElement("span");
    item.className = "now-meta-item";

    const labelElement = document.createElement("span");
    labelElement.textContent = label;

    const valueElement = document.createElement("strong");
    valueElement.textContent = value;

    item.appendChild(labelElement);
    item.appendChild(valueElement);
    songMeta.appendChild(item);
}

function setCover(chart) {
    if (chart && chart.backgroundUrl) {
        songCover.classList.remove("is-empty");
        songCover.style.backgroundImage = `url("${chart.backgroundUrl}")`;
    } else {
        songCover.classList.add("is-empty");
        songCover.style.backgroundImage = "";
    }
}

export function setSong(chart: GameChart | null): void {
    currentSong = chart || null;

    if (!currentSong) {
        setCover(null);
        songKicker.textContent = i18n.menu.awaitingChart;
        songTitle.textContent = i18n.menu.importPrompt;
        songArtist.textContent = i18n.menu.importDescription;
        clearMeta();
        startBtn.disabled = true;
        startLabel.textContent = i18n.menu.start;
        importLabel.textContent = i18n.menu.import;
        showElement(dropHint);
        fileName.textContent = i18n.app.footer;
        return;
    }

    const metadata = currentSong.metadata || {};
    const title =
        metadata.titleUnicode ||
        metadata.title ||
        currentSong.fileName ||
        i18n.unknown.title;
    const artist =
        metadata.artistUnicode || metadata.artist || i18n.unknown.artist;

    setCover(currentSong);
    songKicker.textContent = i18n.menu.chartReady;
    songTitle.textContent = title;
    songArtist.textContent = artist;

    clearMeta();
    if (currentSong.bpm) addMeta(i18n.meta.bpm, currentSong.bpm);
    addMeta(
        i18n.meta.objects,
        currentSong.objectCount ?? currentSong.notes.length,
    );
    addMeta(
        i18n.meta.duration,
        formatDuration(currentSong.audioDurationMs || currentSong.lengthMs),
    );
    if (metadata.version) addMeta(i18n.meta.difficulty, metadata.version);
    if (metadata.creator) addMeta(i18n.meta.mapper, metadata.creator);

    startBtn.disabled = false;
    startLabel.textContent = i18n.menu.start;
    importLabel.textContent = i18n.menu.changeImport;
    hideElement(dropHint);
    fileName.textContent = currentSong.fileName
        ? `${currentSong.fileName} · ${i18n.menu.importedBadge}`
        : i18n.app.footer;
}

export function showMenu() {
    hidePause();
    hideResults();
    hideLoading();
    applyI18n(root);
    if (window.gameState !== "playing") {
        setSong(currentSong);
    }
    showElement(menu);
}

export function hideMenu() {
    hideElement(menu);
}

export function showPause() {
    pauseDialog.open = true;
}

export function hidePause() {
    pauseDialog.open = false;
}

export function showResults(chart: GameChart | null, stats: GameResults): void {
    const accuracy = stats.accuracy;
    let grade = "D";
    if (stats.total === 0) grade = "SS";
    else if (accuracy >= 0.98) grade = "S";
    else if (accuracy >= 0.94) grade = "A";
    else if (accuracy >= 0.88) grade = "B";
    else if (accuracy >= 0.8) grade = "C";

    const gradeElement = root.querySelector("#now-grade");
    const metadata = (chart && chart.metadata) || {};
    gradeElement.textContent = grade;
    gradeElement.dataset.grade = grade;
    root.querySelector("#now-result-title").textContent =
        metadata.titleUnicode || metadata.title || i18n.unknown.title;
    root.querySelector("#now-result-artist").textContent =
        metadata.artistUnicode || metadata.artist || "";
    root.querySelector("#now-result-acc").textContent =
        `${(accuracy * 100).toFixed(2)}%`;
    root.querySelector("#now-result-maxcombo").textContent = String(
        stats.maxCombo,
    );
    root.querySelector("#now-result-hit").textContent = String(stats.hitCount);
    root.querySelector("#now-result-miss").textContent = String(
        stats.missCount,
    );
    resultsDialog.open = true;
}

export function hideResults() {
    resultsDialog.open = false;
}

export function showLoading(text = i18n.loading.default) {
    loadingText.textContent = text;
    menu.inert = true;
    root.setAttribute("aria-busy", "true");
    showElement(loadingScreen);
}

export function setLoadingText(text) {
    loadingText.textContent = text;
}

export function hideLoading() {
    hideElement(loadingScreen);
    menu.inert = false;
    root.removeAttribute("aria-busy");
}

export function showToast(message, type = "error") {
    playNotification(type);
    const toast = snackbar({
        placement: "bottom",
        autoCloseDelay: 3600,
        queue: "nowjs",
    });
    toast.textContent = message;
    toast.dataset.type = type;
}

export function showHud(chart) {
    const metadata = (chart && chart.metadata) || {};
    hudSong.textContent = metadata.titleUnicode || metadata.title || "";
    hudProgress.value = 0;
    hudProgress.setAttribute("aria-valuenow", "0");
    hudAuto.classList.toggle("now-hidden", !isAutoPlayEnabled());
    updateHudScrubbable();
    showElement(hud);
}

export function hideHud() {
    hudScrubbing = false;
    scrubbingPointerId = null;
    hud.classList.remove("now-hud-seeking");
    hideElement(hud);
}

export function updateHudProgress(progress) {
    if (hudScrubbing) return;

    const value = Math.min(1, Math.max(0, progress));
    hudProgress.value = value;
    hudProgress.setAttribute("aria-valuenow", String(Math.round(value * 100)));
}

function updateHudScrubbable() {
    const enabled = isAutoPlayEnabled();
    hud.classList.toggle("now-hud-scrubbable", enabled);
    hudProgress.setAttribute("role", enabled ? "slider" : "progressbar");
    hudProgress.tabIndex = enabled ? 0 : -1;
    hudProgress.setAttribute("aria-valuemin", "0");
    hudProgress.setAttribute("aria-valuemax", "100");
}

function progressAtPointer(event) {
    const rect = hudProgress.getBoundingClientRect();
    if (!rect.width) return scrubbingProgress;
    return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
}

function updateScrubbingProgress(event) {
    scrubbingProgress = progressAtPointer(event);
    hudProgress.value = scrubbingProgress;
    hudProgress.setAttribute(
        "aria-valuenow",
        String(Math.round(scrubbingProgress * 100)),
    );
}

function finishHudScrubbing(event, commit) {
    if (!hudScrubbing) return;

    if (event && commit) updateScrubbingProgress(event);
    const progress = scrubbingProgress;
    hudScrubbing = false;
    scrubbingPointerId = null;
    hud.classList.remove("now-hud-seeking");

    if (event?.currentTarget?.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (commit) callbacks.seekEnd(progress);
}

hudProgress.addEventListener("pointerdown", (event) => {
    if (!isAutoPlayEnabled() || window.gameState !== "playing") return;
    if (window.isPaused || hudScrubbing) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (!callbacks.seekStart()) return;

    event.preventDefault();
    hudScrubbing = true;
    scrubbingPointerId = event.pointerId;
    hud.classList.add("now-hud-seeking");
    updateScrubbingProgress(event);
    hudProgress.setPointerCapture?.(event.pointerId);
});

hudProgress.addEventListener("pointermove", (event) => {
    if (!hudScrubbing || event.pointerId !== scrubbingPointerId) return;
    event.preventDefault();
    updateScrubbingProgress(event);
});

hudProgress.addEventListener("pointerup", (event) => {
    if (event.pointerId !== scrubbingPointerId) return;
    event.preventDefault();
    finishHudScrubbing(event, true);
});

hudProgress.addEventListener("pointercancel", (event) => {
    if (event.pointerId !== scrubbingPointerId) return;
    finishHudScrubbing(event, true);
});

hudProgress.addEventListener("keydown", (event) => {
    if (!isAutoPlayEnabled() || window.gameState !== "playing") return;
    let next = Number(hudProgress.value);
    if (event.key === "ArrowLeft") next -= 0.01;
    else if (event.key === "ArrowRight") next += 0.01;
    else return;

    event.preventDefault();
    if (!callbacks.seekStart()) return;
    scrubbingProgress = Math.max(0, Math.min(1, next));
    hudProgress.value = scrubbingProgress;
    hudProgress.setAttribute(
        "aria-valuenow",
        String(Math.round(scrubbingProgress * 100)),
    );
    callbacks.seekEnd(scrubbingProgress);
});

export function pickDifficulty(
    list: DifficultySummary[],
): Promise<number | null> {
    return new Promise((resolve) => {
        difficultyResolver = resolve;
        difficultyList.innerHTML = "";
        difficultySub.textContent = format(i18n.difficulty.subtitle, {
            count: list.length,
        });

        list.forEach((item, index) => {
            const metadata = item.metadata || {};
            const version =
                metadata.version ||
                format(i18n.difficulty.defaultName, { index: index + 1 });
            const creator = metadata.creator || i18n.unknown.mapper;
            const row = document.createElement("mdui-list-item");

            row.setAttribute(
                "headline",
                `${String(index + 1).padStart(2, "0")} · ${version}`,
            );
            row.setAttribute(
                "description",
                `${creator} · ${format(i18n.difficulty.bpm, {
                    bpm: Math.round(item.bpm),
                })} · ${format(i18n.difficulty.objects, {
                    count: item.objectCount,
                })}`,
            );

            const chevron = document.createElement("mdui-icon-chevron-right");
            chevron.setAttribute("slot", "end-icon");
            chevron.setAttribute("aria-hidden", "true");
            row.appendChild(chevron);

            row.addEventListener("click", () => closeDifficulty(index));
            difficultyList.appendChild(row);
        });

        difficultyDialog.open = true;
        difficultyDialog.addEventListener(
            "opened",
            () => {
                const firstRow = difficultyList.querySelector("mdui-list-item");
                (firstRow || difficultyCancel).focus({ preventScroll: true });
            },
            { once: true },
        );
    });
}

function settleDifficulty(value) {
    if (!difficultyResolver) return;
    const resolver = difficultyResolver;
    difficultyResolver = null;
    resolver(value);
}

function closeDifficulty(value) {
    if (difficultyDialog.open) {
        difficultyDialog.open = false;
    }
    settleDifficulty(value);
}

difficultyDialog.addEventListener("closed", () => settleDifficulty(null));

pauseDialog.addEventListener("opened", () => {
    resumeBtn.focus({ preventScroll: true });
});

resultsDialog.addEventListener("opened", () => {
    retryBtn.focus({ preventScroll: true });
});

function chooseFiles(files) {
    if (!files || !files.length) return;
    callbacks.importFiles(Array.from(files));
}

startBtn.addEventListener("click", () => callbacks.start());
importBtn.addEventListener("click", () => fileInput.click());
dropHint.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
    chooseFiles(fileInput.files);
    fileInput.value = "";
});

let licenseLoaded = false;

licenseBtn.addEventListener("click", async () => {
    if (!licenseLoaded) {
        licenseText.textContent = i18n.license.loading;
        try {
            const response = await fetch("./osu-resources/LICENCE.md");
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            licenseText.textContent = await response.text();
            licenseLoaded = true;
        } catch (error) {
            console.error("License load failed", error);
            licenseText.textContent = i18n.license.error;
        }
    }
    licenseDialog.open = true;
});

licenseClose.addEventListener("click", () => {
    licenseDialog.open = false;
});

function activateDropHint() {
    fileInput.click();
}

dropHint.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activateDropHint();
    }
});

root.querySelector("#now-resume-btn").addEventListener("click", () =>
    callbacks.resume(),
);
root.querySelector("#now-restart-btn").addEventListener("click", () =>
    callbacks.restart(),
);
root.querySelector("#now-exit-btn").addEventListener("click", () =>
    callbacks.exit(),
);
root.querySelector("#now-retry-btn").addEventListener("click", () =>
    callbacks.restart(),
);
root.querySelector("#now-result-exit-btn").addEventListener("click", () =>
    callbacks.exit(),
);
difficultyCancel.addEventListener("click", () => closeDifficulty(null));

languageMenu.addEventListener("change", () => {
    if (languageMenu.value) {
        setLanguage(languageMenu.value);
    }
});

onLanguageChange(() => {
    applyI18n(root);
    languageMenu.value = getLanguage();
    setSong(currentSong);
});

autoplayBtn.addEventListener("change", () => {
    setAutoPlay(autoplayBtn.selected);
});

window.addEventListener("nowjs-autoplay-change", (event) => {
    const enabled = Boolean(event.detail && event.detail.enabled);
    autoplayBtn.selected = enabled;
    hudAuto.classList.toggle("now-hidden", !enabled);
    updateHudScrubbable();
    showToast(enabled ? i18n.autoplay.enabled : i18n.autoplay.disabled, "info");
});

resolutionChip.addEventListener("click", async () => {
    if (window.gameState === "playing") return;
    const before = readStorage("gameResolution");
    const chosen = await showResolutionSelector();
    const beforeValue = RESOLUTIONS[before] || RESOLUTIONS["1080p"];
    resolutionLabel.textContent = formatResolutionChip();
    if (chosen !== beforeValue) {
        showToast(i18n.toast.resolutionNextLaunch, "info");
    }
    resolutionChip.focus({ preventScroll: true });
});

let dragDepth = 0;

function hasFiles(event) {
    return Boolean(
        event.dataTransfer &&
        Array.from(event.dataTransfer.types || []).includes("Files"),
    );
}

window.addEventListener("dragenter", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    if (window.gameState !== "menu") return;
    dragDepth += 1;
    menu.classList.add("is-dragging");
});

window.addEventListener("dragover", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
});

window.addEventListener("dragleave", (event) => {
    if (!hasFiles(event)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) menu.classList.remove("is-dragging");
});

window.addEventListener("drop", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth = 0;
    menu.classList.remove("is-dragging");
    if (window.gameState !== "menu") return;
    chooseFiles(event.dataTransfer.files);
});

document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;

    const active = document.activeElement;
    const tagName = active ? active.tagName : "";
    const interactive =
        tagName === "BUTTON" ||
        tagName === "INPUT" ||
        tagName === "SELECT" ||
        tagName === "TEXTAREA" ||
        tagName === "A" ||
        tagName.startsWith("MDUI-");

    if (
        !interactive &&
        !menu.classList.contains("now-hidden") &&
        !startBtn.disabled &&
        !root.querySelector("mdui-dialog[open]") &&
        loadingScreen.classList.contains("now-hidden")
    ) {
        event.preventDefault();
        callbacks.start();
    }
});
