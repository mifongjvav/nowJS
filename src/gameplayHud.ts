import { Container, Graphics, Text } from "./vendor/pixi.js";
import { MD3_COLORS, THEME_CHANGE_EVENT } from "./theme.ts";
import { i18n, onLanguageChange } from "./i18n/index.ts";
import { isAutoPlayEnabled } from "./autoplay.ts";
import {
    getGameplayHudLayout,
    hudProgressAtPoint,
} from "./gameplayHudLayout.ts";
import type { GameChart } from "./domain.ts";

interface SeekCallbacks {
    seekStart: () => boolean;
    seekEnd: (progress: number) => void;
}

// Regular Pixi scene nodes are also serialized by the render worker. Pointer
// events use canvas coordinates instead of Pixi hit testing so the replacement
// OffscreenCanvas presentation surface supports exactly the same controls.
class GameplayHud {
    private root = new Container();
    private panels = new Graphics();
    private track = new Graphics();
    private fill = new Graphics();
    private accuracy = this.text(28, "700");
    private accuracyLabel = this.text(12, "700");
    private auto = this.text(14, "700");
    private title = this.text(14, "700");
    private artist = this.text(12);
    private details = this.text(11);
    private chart: GameChart | null = null;
    private progress = 0;
    private pointer: number | null = null;
    private capture: HTMLCanvasElement | null = null;
    private callbacks: SeekCallbacks | null = null;
    private hover = false;
    private accessibility = new WeakMap<HTMLCanvasElement, string>();
    private layout = getGameplayHudLayout(window.gameWidth, window.gameHeight);

    constructor() {
        this.root.label = "gameplay-hud";
        this.root.visible = false;
        this.root.addChild(
            this.panels,
            this.track,
            this.fill,
            this.accuracy,
            this.auto,
            this.title,
            this.artist,
            this.details,
            this.accuracyLabel,
        );
        window.statsLayer.addChild(this.root);
        this.accuracy.anchor.set(1, 0);
        this.accuracy.alpha = 0.88;
        this.accuracy.style.letterSpacing = window.gameScale;
        this.accuracyLabel.anchor.set(1, 0);
        this.auto.anchor.set(0.5, 0);
        window.addEventListener("pointerdown", this.pointerDown, true);
        window.addEventListener("pointermove", this.pointerMove, true);
        window.addEventListener("pointerup", this.pointerUp, true);
        window.addEventListener("pointercancel", this.pointerUp, true);
        window.addEventListener("keydown", this.keyDown, true);
        // Commit before the game's blur/pause handler freezes media.
        window.addEventListener(
            "blur",
            (event) => {
                if (event.target === window) this.finishSeek();
            },
            true,
        );
        window.addEventListener("nowjs-autoplay-change", () => {
            this.finishSeek();
            this.refresh();
        });
        window.addEventListener(THEME_CHANGE_EVENT, () => this.refresh());
        onLanguageChange(() => this.refresh());
    }

    private text(size: number, weight: "400" | "700" = "400") {
        return new Text({
            text: "",
            style: {
                fontFamily: "sans-serif",
                fontSize: size * window.gameScale,
                fontWeight: weight,
                fill: MD3_COLORS.onSurface,
            },
        });
    }

    show(chart: GameChart, callbacks: SeekCallbacks) {
        this.cancelCapture();
        this.chart = chart;
        this.callbacks = callbacks;
        this.progress = 0;
        this.hover = false;
        this.root.visible = true;
        this.refresh();
    }

    hide() {
        this.cancelCapture();
        this.root.visible = false;
        this.hover = false;
        this.syncAccessibility();
    }

    update(progress: number) {
        if (!this.root.visible) return;
        if (this.pointer === null) {
            const next = Math.max(0, Math.min(1, progress));
            if (next !== this.progress) {
                this.progress = next;
                this.fill.scale.x = next;
            }
        }
        const total = window.hitCount + window.missCount;
        const accuracy = total > 0 ? window.hitCount / total : 1;
        this.accuracy.text = `${(accuracy * 100).toFixed(2)}%`;
        this.syncAccessibility();
    }

    private fit(text: Text, maxWidth: number) {
        text.scale.set(1);
        if (text.width > maxWidth) text.scale.set(maxWidth / text.width);
    }

    private refresh() {
        if (!this.chart) return;
        const { scale, inset, right, bottom, metadataWidth } = this.layout;
        const metadata = this.chart.metadata;
        this.title.text =
            metadata.titleUnicode || metadata.title || i18n.unknown.title;
        this.artist.text =
            metadata.artistUnicode || metadata.artist || i18n.unknown.artist;
        this.details.text = [
            metadata.version,
            `${i18n.meta.mapper}: ${metadata.creator || i18n.unknown.mapper}`,
        ]
            .filter(Boolean)
            .join("  ·  ");
        this.title.position.set(inset + 8 * scale, bottom - 50 * scale);
        this.artist.position.set(inset + 8 * scale, bottom - 31 * scale);
        this.details.position.set(inset + 8 * scale, bottom - 15 * scale);
        for (const text of [this.title, this.artist, this.details]) {
            text.style.fill = MD3_COLORS.onSurface;
            this.fit(text, metadataWidth - 16 * scale);
        }
        this.artist.alpha = 0.8;
        this.details.alpha = 0.65;
        this.accuracyLabel.text = i18n.hud.accuracy;
        this.accuracyLabel.position.set(right - 10 * scale, 20 * scale);
        this.accuracyLabel.style.fill = MD3_COLORS.primary;
        this.accuracy.position.set(right - 10 * scale, 37 * scale);
        this.accuracy.style.fill = MD3_COLORS.onSurface;
        this.auto.text =
            i18n.autoplay.badge === "AUTO"
                ? "AUTO"
                : `AUTO · ${i18n.autoplay.badge}`;
        this.auto.position.set(window.gameWidth / 2, 24 * scale);
        this.auto.style.fill = MD3_COLORS.primary;
        this.auto.visible = isAutoPlayEnabled();
        this.update(this.progress);
        this.panels
            .clear()
            .roundRect(
                inset,
                bottom - 58 * scale,
                Math.max(
                    this.title.width,
                    this.artist.width,
                    this.details.width,
                ) +
                    16 * scale,
                58 * scale,
                6 * scale,
            )
            .fill({ color: MD3_COLORS.surface, alpha: 0.55 })
            .roundRect(
                right - scale,
                22 * scale,
                3 * scale,
                52 * scale,
                2 * scale,
            )
            .fill({ color: MD3_COLORS.primary, alpha: 0.8 });
        this.drawProgress();
    }

    private drawProgress() {
        const bar = this.layout.progress;
        const height =
            this.pointer !== null || (this.hover && isAutoPlayEnabled())
                ? bar.height * 2
                : bar.height;
        this.track
            .clear()
            .roundRect(bar.x, bar.y, bar.width, height, height / 2)
            .fill({ color: MD3_COLORS.onSurface, alpha: 0.24 });
        this.fill.position.set(bar.x, bar.y);
        this.fill
            .clear()
            .roundRect(0, 0, bar.width, height, height / 2)
            .fill(MD3_COLORS.primary);
        this.fill.scale.x = this.progress;
    }

    private isCanvas(target: EventTarget | null): target is HTMLCanvasElement {
        return (
            target === window.app.canvas ||
            (target instanceof HTMLCanvasElement &&
                target.id === "now-thread-canvas")
        );
    }

    private point(event: PointerEvent) {
        return hudProgressAtPoint(
            event.clientX,
            event.clientY,
            window.app.canvas.getBoundingClientRect(),
            window.gameWidth,
            window.gameHeight,
        );
    }

    private canSeek() {
        return (
            this.root.visible &&
            isAutoPlayEnabled() &&
            window.gameState === "playing" &&
            !window.isPaused
        );
    }

    private pointerDown = (event: PointerEvent) => {
        if (
            !this.canSeek() ||
            this.pointer !== null ||
            !this.isCanvas(event.target)
        )
            return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        const point = this.point(event);
        if (!point?.inside || !this.callbacks?.seekStart()) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.pointer = event.pointerId;
        this.capture = event.target;
        this.capture.focus();
        this.capture.setPointerCapture(event.pointerId);
        this.progress = point.progress;
        this.drawProgress();
    };

    private pointerMove = (event: PointerEvent) => {
        if (this.pointer !== null) {
            if (event.pointerId !== this.pointer) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            this.progress = this.point(event)?.progress ?? this.progress;
            this.drawProgress();
            this.syncAccessibility();
            return;
        }
        const hover =
            this.canSeek() &&
            this.isCanvas(event.target) &&
            Boolean(this.point(event)?.inside);
        if (hover !== this.hover) {
            this.hover = hover;
            this.drawProgress();
            this.syncAccessibility();
        }
    };

    private pointerUp = (event: PointerEvent) => {
        if (event.pointerId !== this.pointer) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.type === "pointerup") {
            this.progress = this.point(event)?.progress ?? this.progress;
        }
        this.finishSeek();
    };

    private cancelCapture() {
        const pointer = this.pointer;
        this.pointer = null;
        if (pointer !== null && this.capture?.hasPointerCapture(pointer)) {
            this.capture.releasePointerCapture(pointer);
        }
        this.capture = null;
    }

    private finishSeek() {
        if (this.pointer === null) return;
        this.cancelCapture();
        this.callbacks?.seekEnd(this.progress);
        this.drawProgress();
    }

    private keyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
            this.finishSeek();
            return;
        }
        if (!this.canSeek() || !this.isCanvas(event.target)) return;
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        if (!this.callbacks?.seekStart()) return;
        this.progress = Math.max(
            0,
            Math.min(
                1,
                this.progress + (event.key === "ArrowLeft" ? -0.01 : 0.01),
            ),
        );
        this.callbacks.seekEnd(this.progress);
        this.drawProgress();
    };

    private syncAccessibility() {
        const enabled = this.root.visible && isAutoPlayEnabled();
        const canvases = [
            window.app.canvas,
            document.querySelector<HTMLCanvasElement>("#now-thread-canvas"),
        ];
        for (const canvas of canvases) {
            if (!canvas) continue;
            const signature = `${enabled}:${this.hover}:${Math.round(this.progress * 100)}:${i18n.hud.progress}`;
            if (this.accessibility.get(canvas) === signature) continue;
            this.accessibility.set(canvas, signature);
            canvas.style.cursor = enabled && this.hover ? "pointer" : "";
            canvas.tabIndex = enabled ? 0 : -1;
            if (enabled) {
                canvas.setAttribute("role", "slider");
                canvas.setAttribute("aria-label", i18n.hud.progress);
                canvas.setAttribute("aria-valuemin", "0");
                canvas.setAttribute("aria-valuemax", "100");
                canvas.setAttribute(
                    "aria-valuenow",
                    String(Math.round(this.progress * 100)),
                );
            } else {
                for (const name of [
                    "role",
                    "aria-label",
                    "aria-valuemin",
                    "aria-valuemax",
                    "aria-valuenow",
                ]) {
                    canvas.removeAttribute(name);
                }
            }
        }
    }
}

let hud: GameplayHud | null = null;
export function showGameplayHud(chart: GameChart, callbacks: SeekCallbacks) {
    hud ??= new GameplayHud();
    hud.show(chart, callbacks);
}
export function hideGameplayHud() {
    hud?.hide();
}
export function updateGameplayHud(progress: number) {
    hud?.update(progress);
}
