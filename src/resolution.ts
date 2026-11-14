import "./vendor/mdui.js";
import { injectBaseStyles } from "./styles.ts";
import { i18n } from "./i18n/index.ts";
import type { Resolution } from "./domain.ts";
import {
    playUiDialogClose,
    playUiDialogOpen,
    playUiHover,
    playUiSelect,
} from "./audio.ts";

export const RESOLUTIONS = {
    "720p": { width: 1280, height: 720 },
    "1080p": { width: 1920, height: 1080 },
    "2k": { width: 2560, height: 1440 },
    "4k": { width: 3840, height: 2160 },
} as const satisfies Record<string, Resolution>;

export type ResolutionKey = keyof typeof RESOLUTIONS;

function isResolutionKey(value: string): value is ResolutionKey {
    return Object.hasOwn(RESOLUTIONS, value);
}

const DIALOG_ID = "now-resolution-dialog";
const TITLE_ID = "now-resolution-title";

function escapeHtml(value: unknown): string {
    return String(value).replace(
        /[&<>"']/g,
        (character) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            })[character],
    );
}

function injectResolutionStyles() {
    if (document.getElementById("nowjs-resolution-styles")) return;
    const style = document.createElement("style");
    style.id = "nowjs-resolution-styles";
    style.textContent = `
        .now-resolution-head {
            display: flex;
            align-items: center;
            gap: 16px;
        }

        .now-resolution-mark {
            display: grid;
            place-items: center;
            width: 48px;
            height: 48px;
            flex: none;
            border-radius: var(--mdui-shape-corner-large);
            background: rgb(var(--mdui-color-primary-container));
            color: rgb(var(--mdui-color-on-primary-container));
            font-size: 26px;
            font-weight: 600;
            line-height: 1;
        }

        .now-resolution-head h2 {
            margin: 0;
            color: rgb(var(--mdui-color-on-surface));
            font-size: var(--mdui-typescale-headline-small-size);
            font-weight: 500;
            line-height: var(--mdui-typescale-headline-small-line-height);
            letter-spacing: var(--mdui-typescale-headline-small-tracking);
        }

        .now-resolution-body {
            margin: 16px 0 0;
            color: rgb(var(--mdui-color-on-surface-variant));
            font-size: var(--mdui-typescale-body-medium-size);
            line-height: var(--mdui-typescale-body-medium-line-height);
            letter-spacing: var(--mdui-typescale-body-medium-tracking);
        }

        .now-resolution-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
            margin-top: 16px;
        }

        mdui-card.now-resolution-card {
            display: block;
            --shape-corner: var(--mdui-shape-corner-medium);
            cursor: pointer;
            background-color: color-mix(
                in srgb,
                rgb(var(--mdui-color-surface-container-highest)) 72%,
                transparent
            );
            border: 1px solid
                color-mix(
                    in srgb,
                    rgb(var(--mdui-color-outline-variant)) 45%,
                    transparent
                );
            backdrop-filter: blur(12px) saturate(1.1);
            -webkit-backdrop-filter: blur(12px) saturate(1.1);
            transition:
                background-color var(--mdui-motion-duration-short3)
                    var(--mdui-motion-easing-standard),
                border-color var(--mdui-motion-duration-short3)
                    var(--mdui-motion-easing-standard),
                color var(--mdui-motion-duration-short3)
                    var(--mdui-motion-easing-standard);
        }

        mdui-card.now-resolution-card:focus-visible {
            outline: 3px solid rgb(var(--mdui-color-primary));
            outline-offset: 2px;
        }

        .now-resolution-card-inner {
            display: flex;
            align-items: flex-start;
            gap: 16px;
            padding: 16px;
        }

        .now-resolution-copy {
            display: grid;
            gap: 4px;
            min-width: 0;
        }

        .now-resolution-title {
            display: flex;
            align-items: baseline;
            flex-wrap: wrap;
            gap: 8px;
            color: rgb(var(--mdui-color-on-surface));
            font-size: var(--mdui-typescale-title-medium-size);
            font-weight: 600;
            line-height: var(--mdui-typescale-title-medium-line-height);
            letter-spacing: var(--mdui-typescale-title-medium-tracking);
        }

        .now-resolution-tag {
            color: rgb(var(--mdui-color-primary));
            font-size: var(--mdui-typescale-label-small-size);
            font-weight: var(--mdui-typescale-label-small-weight);
            line-height: var(--mdui-typescale-label-small-line-height);
            letter-spacing: var(--mdui-typescale-label-small-tracking);
        }

        .now-resolution-size {
            color: rgb(var(--mdui-color-on-surface-variant));
            font-size: var(--mdui-typescale-body-small-size);
            line-height: var(--mdui-typescale-body-small-line-height);
            font-family: "Roboto Mono", "SFMono-Regular", Consolas, monospace;
        }

        .now-resolution-note {
            color: rgb(var(--mdui-color-on-surface-variant));
            font-size: var(--mdui-typescale-body-small-size);
            line-height: var(--mdui-typescale-body-small-line-height);
        }

        .now-resolution-check {
            margin-left: auto;
            flex: none;
            font-size: 22px;
            color: rgb(var(--mdui-color-primary));
            opacity: 0;
            transition: opacity var(--mdui-motion-duration-short3)
                var(--mdui-motion-easing-standard);
        }

        mdui-card.now-resolution-card.selected {
            background: rgb(var(--mdui-color-secondary-container));
            border-color: transparent;
        }

        mdui-card.now-resolution-card.selected .now-resolution-title,
        mdui-card.now-resolution-card.selected .now-resolution-tag,
        mdui-card.now-resolution-card.selected .now-resolution-size,
        mdui-card.now-resolution-card.selected .now-resolution-note,
        mdui-card.now-resolution-card.selected .now-resolution-check {
            color: rgb(var(--mdui-color-on-secondary-container));
        }

        mdui-card.now-resolution-card.selected .now-resolution-size,
        mdui-card.now-resolution-card.selected .now-resolution-note,
        mdui-card.now-resolution-card.selected .now-resolution-tag {
            opacity: 0.82;
        }

        mdui-card.now-resolution-card.selected .now-resolution-check {
            opacity: 1;
        }

        @media (max-width: 600px) {
            .now-resolution-grid {
                grid-template-columns: 1fr;
            }
        }
    `;
    document.head.appendChild(style);
}

export function showResolutionSelector(): Promise<Resolution> {
    injectBaseStyles();
    injectResolutionStyles();

    return new Promise((resolve) => {
        const storedKey = localStorage.getItem("gameResolution") || "";
        const savedKey: ResolutionKey = isResolutionKey(storedKey)
            ? storedKey
            : "1080p";
        let selectedKey: ResolutionKey = savedKey;
        let choice: ResolutionKey | null = null;
        let settled = false;

        const dialog = document.createElement("mdui-dialog");
        dialog.id = DIALOG_ID;
        dialog.className = "now-resolution-dialog";
        dialog.setAttribute("role", "dialog");
        dialog.setAttribute("aria-modal", "true");
        dialog.setAttribute("aria-labelledby", TITLE_ID);
        dialog.setAttribute("close-on-esc", "");
        dialog.setAttribute("close-on-overlay-click", "");
        dialog.innerHTML = `
            <div slot="header" class="now-resolution-head">
                <div class="now-resolution-mark" aria-hidden="true">n</div>
                <div>
                    <p class="now-eyebrow">${escapeHtml(i18n.resolution.eyebrow)}</p>
                    <h2 id="${TITLE_ID}">${escapeHtml(i18n.resolution.title)}</h2>
                </div>
            </div>
            <p class="now-resolution-body">${escapeHtml(i18n.resolution.body)}</p>
            <div class="now-resolution-grid" role="radiogroup"></div>
            <mdui-button slot="action" variant="text" data-action="cancel">
                ${escapeHtml(i18n.resolution.cancel)}
            </mdui-button>
            <mdui-button slot="action" variant="filled" data-action="confirm">
                ${escapeHtml(i18n.resolution.apply)}
            </mdui-button>
        `;

        let hoveredSoundTarget = null;
        let lastHoverSoundAt = 0;

        const findSoundTarget = (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return null;

            const element = target.closest("mdui-button, mdui-card[clickable]");
            if (!element) return null;
            if (element.disabled || element.hasAttribute("disabled"))
                return null;

            return element;
        };

        dialog.addEventListener("pointerover", (event) => {
            if (event.pointerType === "touch") return;

            const target = findSoundTarget(event);
            if (!target || target === hoveredSoundTarget) return;

            hoveredSoundTarget = target;
            const now = performance.now();
            if (now - lastHoverSoundAt < 55) return;

            lastHoverSoundAt = now;
            playUiHover();
        });

        dialog.addEventListener("pointerout", (event) => {
            const target = findSoundTarget(event);
            if (target === hoveredSoundTarget) {
                hoveredSoundTarget = null;
            }
        });

        dialog.addEventListener("click", (event) => {
            if (findSoundTarget(event)) {
                playUiSelect();
            }
        });

        dialog.addEventListener("closed", () => playUiDialogClose());

        const grid = dialog.querySelector(".now-resolution-grid");
        grid.setAttribute("aria-label", i18n.resolution.aria);

        const cards: Array<{ key: ResolutionKey; card: HTMLElement }> = [];

        (Object.keys(RESOLUTIONS) as ResolutionKey[]).forEach((key) => {
            const item = RESOLUTIONS[key];
            const label = i18n.resolution[key].label;
            const note = i18n.resolution[key].note;
            const card = document.createElement("mdui-card");
            card.className = "now-resolution-card";
            card.setAttribute("variant", "filled");
            card.setAttribute("clickable", "");
            card.setAttribute("role", "radio");
            card.setAttribute("tabindex", "0");
            card.innerHTML = `
                <div class="now-resolution-card-inner">
                    <span class="now-resolution-copy">
                        <span class="now-resolution-title">
                            ${key.toUpperCase()}
                            <span class="now-resolution-tag">${escapeHtml(label)}</span>
                        </span>
                        <span class="now-resolution-size">${item.width} × ${item.height}</span>
                        <span class="now-resolution-note">${escapeHtml(note)}</span>
                    </span>
                    <mdui-icon-check-circle
                        class="now-resolution-check"
                        aria-hidden="true"
                    ></mdui-icon-check-circle>
                </div>
            `;

            const select = () => {
                selectedKey = key;
                updateSelection();
            };

            card.addEventListener("click", select);
            card.addEventListener("keydown", (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    select();
                }
            });

            cards.push({ key, card });
            grid.appendChild(card);
        });

        function updateSelection() {
            cards.forEach(({ key, card }) => {
                const selected = key === selectedKey;
                card.classList.toggle("selected", selected);
                card.setAttribute("aria-checked", String(selected));
            });
        }

        updateSelection();

        const close = (apply) => {
            if (settled) return;
            settled = true;
            choice = apply ? selectedKey : null;
            dialog.open = false;
        };

        dialog.addEventListener("closed", () => {
            resolve(RESOLUTIONS[choice ?? savedKey]);
            dialog.remove();
        });

        dialog
            .querySelector('[data-action="confirm"]')
            .addEventListener("click", () => {
                if (selectedKey) {
                    localStorage.setItem("gameResolution", selectedKey);
                }
                close(true);
            });
        dialog
            .querySelector('[data-action="cancel"]')
            .addEventListener("click", () => close(false));

        document.body.appendChild(dialog);
        dialog.open = true;
        playUiDialogOpen();
    });
}

export function getSavedResolution(): Resolution {
    const saved = localStorage.getItem("gameResolution") || "1080p";
    return isResolutionKey(saved) ? RESOLUTIONS[saved] : RESOLUTIONS["1080p"];
}
