import {
    playBreakCountdownGo,
    playBreakCountdownTick,
    playSectionResult,
} from "./audio.ts";

interface BreakInfo {
    start: number;
    end: number;
}

let overlay: HTMLDivElement | null = null;
let result: HTMLDivElement | null = null;
let passIcon: HTMLElement | null = null;
let failIcon: HTMLElement | null = null;
let countdown: HTMLDivElement | null = null;

let activeBreak: BreakInfo | null = null;
let lastCountdown: number | null = null;
let goShown = false;
let resultHideAt = 0;

const RESULT_FLASH_MS = 450;
const RESULT_HOLD_MS = 2000;

function ensureOverlay(): void {
    if (overlay) return;

    overlay = document.createElement("div");
    overlay.id = "now-break-overlay";
    overlay.className = "now-break-overlay now-hidden";
    overlay.innerHTML = `
        <div class="now-break-result" id="now-break-result">
            <mdui-icon-check-circle class="now-break-icon is-pass"></mdui-icon-check-circle>
            <mdui-icon-cancel class="now-break-icon is-fail"></mdui-icon-cancel>
        </div>
        <div class="now-break-countdown now-hidden" id="now-break-countdown"></div>
    `;
    (document.getElementById("nowjs-ui") || document.body).appendChild(overlay);

    result = overlay.querySelector("#now-break-result");
    passIcon = overlay.querySelector(".now-break-icon.is-pass");
    failIcon = overlay.querySelector(".now-break-icon.is-fail");
    countdown = overlay.querySelector("#now-break-countdown");
}

function showCountdown(text: string, isGo = false): void {
    if (!countdown) return;

    countdown.textContent = text;
    countdown.classList.toggle("is-go", isGo);
    countdown.classList.remove("now-hidden", "is-popping");
    // Restart the pop animation for each new number.
    countdown.getBoundingClientRect();
    countdown.classList.add("is-popping");
}

function flashResult(passing: boolean): void {
    const icon = passing ? passIcon : failIcon;
    const other = passing ? failIcon : passIcon;
    if (!icon || !other) return;

    other.classList.remove("is-flashing");
    icon.classList.remove("is-flashing");
    icon.getBoundingClientRect();
    icon.classList.add("is-flashing");
}

export function beginBreakOverlay(
    passing: boolean,
    breakInfo: BreakInfo,
): void {
    ensureOverlay();
    if (!overlay || !result || !countdown) return;

    activeBreak = breakInfo;
    lastCountdown = null;
    goShown = false;
    resultHideAt = breakInfo.start + RESULT_FLASH_MS + RESULT_HOLD_MS;
    overlay.classList.remove("now-hidden");
    result.style.visibility = "visible";
    countdown.classList.add("now-hidden");
    countdown.classList.remove("is-go");
    flashResult(passing);
    playSectionResult(passing);
}

export function updateBreakOverlay(time: number): void {
    if (!activeBreak || !overlay || !result || !countdown) return;

    const { end } = activeBreak;

    if (!goShown && time >= resultHideAt) {
        result.style.visibility = "hidden";
    }

    if (goShown) {
        if (time >= end + 700) {
            resetBreakOverlay();
        }
        return;
    }

    if (time >= end) {
        result.style.visibility = "hidden";
        showCountdown("GO!", true);
        playBreakCountdownGo();
        goShown = true;
        return;
    }

    if (time >= end - 3000) {
        result.style.visibility = "hidden";
        const count = Math.max(1, Math.ceil((end - time) / 1000));
        if (count !== lastCountdown) {
            lastCountdown = count;
            showCountdown(String(count));
            playBreakCountdownTick();
        }
    }
}

export function resetBreakOverlay(): void {
    activeBreak = null;
    lastCountdown = null;
    goShown = false;
    resultHideAt = 0;

    if (overlay) {
        overlay.classList.add("now-hidden");
    }
    if (result) {
        result.style.visibility = "visible";
    }
    if (passIcon) {
        passIcon.classList.remove("is-flashing");
    }
    if (failIcon) {
        failIcon.classList.remove("is-flashing");
    }
    if (countdown) {
        countdown.classList.add("now-hidden");
        countdown.classList.remove("is-go", "is-popping");
        countdown.textContent = "";
    }
}
