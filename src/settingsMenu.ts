import { getSettings, onSettingsChange, updateSettings } from "./settings.ts";
import type { GameSettings } from "./settings.ts";
import { i18n } from "./i18n/index.ts";

export function initSettingsMenu(root: HTMLElement): void {
    const dialog = document.createElement("mdui-dialog");
    dialog.id = "now-settings";
    dialog.className = "now-settings-dialog";
    dialog.setAttribute("close-on-esc", "");
    dialog.setAttribute("close-on-overlay-click", "");
    dialog.setAttribute("aria-labelledby", "now-settings-title");
    dialog.innerHTML = `
        <span slot="headline" id="now-settings-title" data-i18n="settings.title">${i18n.settings.title}</span>
        <div class="now-settings-content">
            ${(
                [
                    "storyboard",
                    "video",
                    "blur",
                    "dynamicColors",
                    "decoupledRendering",
                ] as const
            )
                .map(
                    (key) => `
                    <label class="now-setting-row">
                        <span id="now-setting-${key}" data-i18n="settings.${key}">${i18n.settings[key]}</span>
                        <mdui-switch data-setting="${key}" aria-labelledby="now-setting-${key}"></mdui-switch>
                    </label>`,
                )
                .join("")}
            <p class="now-setting-hint" data-i18n="settings.experimentalHint">${i18n.settings.experimentalHint}</p>
            <label class="now-setting-slider">
                <span><span id="now-dim-label" data-i18n="settings.backgroundDim">${i18n.settings.backgroundDim}</span><output id="now-dim-value"></output></span>
                <input type="range" min="0" max="100" step="1" data-setting="backgroundDim" aria-labelledby="now-dim-label" />
                <span class="now-setting-hint" data-i18n="settings.dimHint">${i18n.settings.dimHint}</span>
            </label>
            <label class="now-setting-slider">
                <span><span id="now-blur-label" data-i18n="settings.backgroundBlur">${i18n.settings.backgroundBlur}</span><output id="now-blur-value"></output></span>
                <input type="range" min="0" max="30" step="1" data-setting="backgroundBlur" aria-labelledby="now-blur-label" />
            </label>
        </div>
        <mdui-button slot="action" variant="text" id="now-settings-close" data-i18n="settings.close">${i18n.settings.close}</mdui-button>
    `;
    root.appendChild(dialog);

    const controls = dialog.querySelectorAll<
        HTMLInputElement & { checked: boolean }
    >("[data-setting]");
    const sync = () => {
        const settings = getSettings();
        for (const control of controls) {
            const key = control.dataset.setting as keyof GameSettings;
            const value = settings[key];
            if (typeof value === "boolean") control.checked = value;
            else control.value = String(value);
            if (key === "backgroundBlur") control.disabled = !settings.blur;
        }
        dialog.querySelector("#now-dim-value").textContent =
            `${settings.backgroundDim}%`;
        dialog.querySelector("#now-blur-value").textContent = String(
            settings.backgroundBlur,
        );
    };
    for (const control of controls) {
        const key = control.dataset.setting as keyof GameSettings;
        const numeric = control.tagName === "INPUT";
        control.addEventListener(numeric ? "input" : "change", () => {
            updateSettings({
                [key]: numeric ? Number(control.value) : control.checked,
            });
        });
    }
    sync();
    onSettingsChange(sync);
    root.querySelector("#now-settings-btn").addEventListener("click", () => {
        dialog.setAttribute("open", "");
    });
    dialog
        .querySelector("#now-settings-close")
        .addEventListener("click", () => {
            dialog.removeAttribute("open");
        });
}
