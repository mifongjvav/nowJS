import { getSettings, onSettingsChange, updateSettings } from "./settings.ts";
import type { GameSettings } from "./settings.ts";
import { format, i18n } from "./i18n/index.ts";
import { onLanguageChange } from "./i18n/index.ts";
import { getThreadStatuses, onThreadStatus } from "./threads/status.ts";
import { getActiveRendererLabel } from "./rendererSelection.ts";
import {
    getCatchControls,
    setCatchControlMode,
    setCatchBinding,
    setCatchSpeed,
    resetCatchControls,
    onCatchControlsChange,
    catchKeyLabel,
} from "./catchControls.ts";
import type { CatchAction } from "./catchMovement.ts";

type SwitchKey =
    | "storyboard"
    | "video"
    | "blur"
    | "photosensitive"
    | "ignoreWebgpuVideoRisk"
    | "dynamicColors"
    | "decoupledRendering"
    | "multithreading";

function switchRow(key: SwitchKey): string {
    return `
        <label class="now-setting-row">
            <span id="now-setting-${key}" data-i18n="settings.${key}">${i18n.settings[key]}</span>
            <mdui-switch data-setting="${key}" aria-labelledby="now-setting-${key}"></mdui-switch>
        </label>`;
}

function settingsGroup(
    name: string,
    titleKey:
        | "groupDisplay"
        | "groupAccessibility"
        | "groupExperimental"
        | "groupControls",
    body: string,
): string {
    return `
        <section class="now-settings-group" aria-labelledby="now-settings-group-${name}">
            <h3 id="now-settings-group-${name}" data-i18n="settings.${titleKey}">${i18n.settings[titleKey]}</h3>
            <div class="now-settings-group-body">${body}</div>
        </section>`;
}

export function initSettingsMenu(root: HTMLElement): void {
    const dialog = document.createElement("mdui-dialog");
    dialog.id = "now-settings";
    dialog.className = "now-settings-dialog";
    dialog.setAttribute("close-on-esc", "");
    dialog.setAttribute("close-on-overlay-click", "");
    dialog.setAttribute("aria-labelledby", "now-settings-title");
    const rendererOptions = [
        ["auto", i18n.settings.rendererAuto, "settings.rendererAuto"],
        ["webgpu", i18n.settings.rendererWebgpu, "settings.rendererWebgpu"],
        ["webgl2", "WebGL 2", null],
        ["webgl1", "WebGL 1", null],
        ["canvas", "Canvas", null],
    ]
        .map(
            ([value, label, i18nKey]) =>
                `<option value="${value}"${i18nKey ? ` data-i18n="${i18nKey}"` : ""}>${label}</option>`,
        )
        .join("");
    const displayBody = `
        <div class="now-setting-block">
            <label class="now-setting-select-row">
                <span id="now-renderer-label" data-i18n="settings.renderer">${i18n.settings.renderer}</span>
                <select data-setting="renderer" aria-labelledby="now-renderer-label">${rendererOptions}</select>
            </label>
            <p class="now-setting-hint" data-i18n="settings.rendererHint">${i18n.settings.rendererHint}</p>
            <p id="now-renderer-status" class="now-setting-hint"></p>
            <div id="now-webgpu-video-risk" class="now-setting-block now-hidden">
                ${switchRow("ignoreWebgpuVideoRisk")}
                <p class="now-setting-hint" data-i18n="settings.ignoreWebgpuVideoRiskHint">${i18n.settings.ignoreWebgpuVideoRiskHint}</p>
            </div>
        </div>
        ${(["storyboard", "video", "blur"] as const).map(switchRow).join("")}
        <label class="now-setting-slider">
            <span><span id="now-blur-label" data-i18n="settings.backgroundBlur">${i18n.settings.backgroundBlur}</span><output id="now-blur-value"></output></span>
            <input type="range" min="0" max="30" step="1" data-setting="backgroundBlur" aria-labelledby="now-blur-label" />
        </label>
        <label class="now-setting-slider">
            <span><span id="now-dim-label" data-i18n="settings.backgroundDim">${i18n.settings.backgroundDim}</span><output id="now-dim-value"></output></span>
            <input type="range" min="0" max="100" step="1" data-setting="backgroundDim" aria-labelledby="now-dim-label" />
            <span class="now-setting-hint" data-i18n="settings.dimHint">${i18n.settings.dimHint}</span>
        </label>
        ${switchRow("dynamicColors")}`;
    const accessibilityBody = `
        <div class="now-setting-block">
            ${switchRow("photosensitive")}
            <p class="now-setting-hint" data-i18n="settings.photosensitiveHint">${i18n.settings.photosensitiveHint}</p>
        </div>`;
    const experimentalBody = `
        ${(["decoupledRendering", "multithreading"] as const).map(switchRow).join("")}
        <p class="now-setting-hint" data-i18n="settings.experimentalHint">${i18n.settings.experimentalHint}</p>
        <p class="now-setting-hint" data-i18n="settings.threadHint">${i18n.settings.threadHint}</p>
        <div id="now-thread-status" class="now-thread-status" aria-live="polite"></div>`;
    const controlsBody = `
        <label class="now-setting-select-row">
            <span data-i18n="settings.catchMode">${i18n.settings.catchMode}</span>
            <select id="now-catch-input-mode" aria-label="${i18n.settings.catchMode}" data-i18n-aria-label="settings.catchMode">
                <option value="keyboard" data-i18n="settings.catchKeyboard">${i18n.settings.catchKeyboard}</option>
                <option value="pointer" data-i18n="settings.catchPointer">${i18n.settings.catchPointer}</option>
            </select>
        </label>
        <label class="now-setting-slider">
            <span><span id="now-catch-speed-label" data-i18n="settings.catchSpeed">${i18n.settings.catchSpeed}</span><output id="now-catch-speed-value"></output></span>
            <input id="now-catch-speed" type="range" min="25" max="100" step="5" aria-labelledby="now-catch-speed-label" />
            <span class="now-setting-hint" data-i18n="settings.catchSpeedHint">${i18n.settings.catchSpeedHint}</span>
        </label>
        ${(["left", "right", "dash"] as const)
            .map((action) => {
                const key = (
                    {
                        left: "catchLeft",
                        right: "catchRight",
                        dash: "catchDash",
                    } as const
                )[action];
                return `<div class="now-setting-row">
                <span id="now-catch-${action}-label" data-i18n="settings.${key}">${i18n.settings[key]}</span>
                <mdui-button variant="outlined" data-catch-binding="${action}" aria-labelledby="now-catch-${action}-label"></mdui-button>
            </div>`;
            })
            .join("")}
        <p class="now-setting-hint" data-i18n="settings.catchHint">${i18n.settings.catchHint}</p>
        <p id="now-catch-binding-status" class="now-setting-hint" aria-live="polite"></p>
        <mdui-button variant="text" id="now-catch-reset" data-i18n="settings.catchReset">${i18n.settings.catchReset}</mdui-button>`;
    dialog.innerHTML = `
        <span slot="headline" id="now-settings-title" data-i18n="settings.title">${i18n.settings.title}</span>
        <div class="now-settings-content">
            ${settingsGroup("display", "groupDisplay", displayBody)}
            ${settingsGroup("controls", "groupControls", controlsBody)}
            ${settingsGroup("accessibility", "groupAccessibility", accessibilityBody)}
            ${settingsGroup("experimental", "groupExperimental", experimentalBody)}
        </div>
        <mdui-button slot="action" variant="text" id="now-settings-close" data-i18n="settings.close">${i18n.settings.close}</mdui-button>
    `;
    root.appendChild(dialog);
    let captureAction: CatchAction | null = null;
    const modePicker = dialog.querySelector<HTMLSelectElement>(
        "#now-catch-input-mode",
    );
    const bindingStatus = dialog.querySelector("#now-catch-binding-status");
    const speedControl =
        dialog.querySelector<HTMLInputElement>("#now-catch-speed");
    const speedValue = dialog.querySelector("#now-catch-speed-value");
    const bindingButtons = dialog.querySelectorAll<
        HTMLElement & { disabled: boolean }
    >("[data-catch-binding]");
    const syncCatchControls = () => {
        const controls = getCatchControls();
        modePicker.value = controls.mode;
        speedControl.value = String(Math.round(controls.speed * 100));
        speedControl.disabled = controls.mode !== "keyboard";
        speedValue.textContent = `${Math.round(controls.speed * 100)}%`;
        for (const button of bindingButtons) {
            const action = button.dataset.catchBinding as CatchAction;
            button.textContent =
                captureAction === action
                    ? i18n.settings.catchBindPrompt
                    : catchKeyLabel(controls[action]);
            button.disabled = controls.mode !== "keyboard";
        }
    };
    speedControl.addEventListener("input", () => {
        speedValue.textContent = `${speedControl.value}%`;
    });
    speedControl.addEventListener("change", () => {
        setCatchSpeed(Number(speedControl.value) / 100);
    });
    for (const button of bindingButtons)
        button.addEventListener("click", () => {
            captureAction = button.dataset.catchBinding as CatchAction;
            bindingStatus.textContent = i18n.settings.catchBindPrompt;
            syncCatchControls();
        });
    dialog.addEventListener(
        "keydown",
        (event: KeyboardEvent) => {
            if (!captureAction) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            if (event.repeat) return;
            if (event.code === "Escape") captureAction = null;
            else {
                if (!setCatchBinding(captureAction, event.code)) {
                    bindingStatus.textContent = i18n.settings.catchBindInvalid;
                    return;
                }
                captureAction = null;
            }
            bindingStatus.textContent = "";
            syncCatchControls();
        },
        true,
    );
    modePicker.addEventListener("change", () => {
        captureAction = null;
        bindingStatus.textContent = "";
        setCatchControlMode(
            modePicker.value === "pointer" ? "pointer" : "keyboard",
        );
    });
    dialog.querySelector("#now-catch-reset").addEventListener("click", () => {
        captureAction = null;
        bindingStatus.textContent = "";
        resetCatchControls();
    });
    dialog.addEventListener("closed", () => {
        captureAction = null;
        bindingStatus.textContent = "";
        syncCatchControls();
    });
    onCatchControlsChange(syncCatchControls);
    onLanguageChange(syncCatchControls);
    syncCatchControls();

    type SettingControl = Element & {
        checked?: boolean;
        value?: string;
        disabled?: boolean;
    };
    const controls = dialog.querySelectorAll<SettingControl>("[data-setting]");
    const webgpuVideoRiskRow = dialog.querySelector("#now-webgpu-video-risk");
    const sync = () => {
        const settings = getSettings();
        webgpuVideoRiskRow.classList.toggle(
            "now-hidden",
            settings.renderer !== "webgpu",
        );
        for (const control of controls) {
            const key = control.dataset.setting as keyof GameSettings;
            const value = settings[key];
            if (typeof value === "boolean") control.checked = value;
            else control.value = String(value);
            if (key === "backgroundBlur") control.disabled = !settings.blur;
            if (key === "decoupledRendering")
                control.disabled = settings.multithreading;
        }
        dialog.querySelector("#now-dim-value").textContent =
            `${settings.backgroundDim}%`;
        dialog.querySelector("#now-blur-value").textContent = String(
            settings.backgroundBlur,
        );
    };
    for (const control of controls) {
        const key = control.dataset.setting as keyof GameSettings;
        const isRange =
            control instanceof HTMLInputElement && control.type === "range";
        control.addEventListener(isRange ? "input" : "change", () => {
            const value =
                control instanceof HTMLSelectElement
                    ? control.value
                    : isRange
                      ? Number(control.value)
                      : Boolean(control.checked);
            updateSettings({ [key]: value });
        });
    }
    sync();
    const rendererStatus = dialog.querySelector("#now-renderer-status");
    const syncRendererStatus = () => {
        rendererStatus.textContent = format(i18n.settings.rendererCurrent, {
            renderer: getActiveRendererLabel(window.app?.renderer),
        });
    };
    syncRendererStatus();
    onSettingsChange(sync);
    const syncThreads = () => {
        const statusRoot = dialog.querySelector("#now-thread-status");
        statusRoot.replaceChildren();
        const labels = {
            logic: i18n.settings.threadLogic,
            render: i18n.settings.threadRender,
            audio: i18n.settings.threadAudio,
            input: i18n.settings.threadInput,
        };
        const states = {
            off: i18n.settings.threadOff,
            starting: i18n.settings.threadStarting,
            active: i18n.settings.threadActive,
            fallback: i18n.settings.threadFallback,
        };
        for (const [name, status] of Object.entries(getThreadStatuses())) {
            const row = document.createElement("div");
            row.dataset.thread = name;
            row.dataset.state = status.state;
            const title = document.createElement("span"),
                state = document.createElement("span");
            title.textContent = labels[name];
            state.textContent = states[status.state];
            row.append(title, state);
            if (status.detail) {
                const detail = document.createElement("small");
                detail.textContent = status.detail;
                row.appendChild(detail);
            }
            statusRoot.appendChild(row);
        }
    };
    onThreadStatus(syncThreads);
    onLanguageChange(() => {
        syncThreads();
        syncRendererStatus();
    });
    syncThreads();
    dialog.addEventListener("opened", () => {
        sync();
        syncRendererStatus();
    });
    root.querySelector("#now-settings-btn").addEventListener("click", () => {
        sync();
        syncRendererStatus();
        dialog.setAttribute("open", "");
    });
    dialog
        .querySelector("#now-settings-close")
        .addEventListener("click", () => {
            dialog.removeAttribute("open");
        });
}
