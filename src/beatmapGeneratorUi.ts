import { applyI18n, format, i18n, onLanguageChange } from "./i18n/index.ts";
import { generateBeatmapPack } from "./beatmapGeneratorClient.ts";
import { GeneratorError } from "./generatorTypes.ts";
import type {
    GeneratedBeatmapPack,
    GeneratorDensity,
    GeneratorErrorCode,
    GeneratorProgress,
} from "./generatorTypes.ts";
import type { PlayMode } from "./domain.ts";

export function initBeatmapGenerator(
    root: HTMLElement,
    importFiles: (files: File[]) => void,
) {
    const dialog = document.createElement("mdui-dialog");
    dialog.id = "now-generator";
    dialog.className = "now-generator-dialog";
    dialog.setAttribute("close-on-esc", "");
    dialog.setAttribute("close-on-overlay-click", "");
    dialog.setAttribute("aria-labelledby", "now-generator-title");
    dialog.innerHTML = `
        <span slot="headline" id="now-generator-title" data-i18n="generator.title">${i18n.generator.title}</span>
        <form id="now-generator-form" class="now-generator-form">
            <p class="now-generator-hint" data-i18n="generator.description">${i18n.generator.description}</p>
            <label><span data-i18n="generator.audio">${i18n.generator.audio}</span>
                <input id="now-generator-audio" type="file" accept=".mp3,.ogg,.wav" required />
            </label>
            <label><span data-i18n="generator.background">${i18n.generator.background}</span>
                <input id="now-generator-background" type="file" accept=".png,.jpg,.jpeg,.webp" />
            </label>
            <mdui-button id="now-generator-black" variant="text" data-i18n="generator.black">${i18n.generator.black}</mdui-button>
            <div class="now-generator-grid">
                <label><span data-i18n="generator.songTitle">${i18n.generator.songTitle}</span>
                    <input id="now-generator-song-title" maxlength="120" />
                </label>
                <label><span data-i18n="generator.artist">${i18n.generator.artist}</span>
                    <input id="now-generator-artist" maxlength="120" />
                </label>
                <label><span data-i18n="generator.bpm">${i18n.generator.bpm}</span>
                    <input id="now-generator-bpm" type="number" min="30" max="300" step="any" placeholder="${i18n.generator.autoBpm}" data-i18n-placeholder="generator.autoBpm" />
                </label>
                <label><span data-i18n="generator.mode">${i18n.generator.mode}</span>
                    <select id="now-generator-mode">
                        <option value="catch">Catch</option>
                        <option value="mania">Mania 4K</option>
                    </select>
                </label>
                <label><span data-i18n="generator.density">${i18n.generator.density}</span>
                    <select id="now-generator-density">
                        <option value="easy" data-i18n="generator.easy">${i18n.generator.easy}</option>
                        <option value="normal" selected data-i18n="generator.normal">${i18n.generator.normal}</option>
                        <option value="hard" data-i18n="generator.hard">${i18n.generator.hard}</option>
                    </select>
                </label>
            </div>
            <p class="now-generator-hint" data-i18n="generator.limits">${i18n.generator.limits}</p>
            <mdui-linear-progress id="now-generator-progress" class="now-hidden" max="1" value="0"></mdui-linear-progress>
            <p id="now-generator-status" role="status" aria-live="polite"></p>
            <section id="now-generator-result" class="now-hidden">
                <p id="now-generator-summary"></p>
                <p id="now-generator-objects"></p>
                <div class="now-generator-colors">
                    <span data-i18n="generator.colors">${i18n.generator.colors}</span>
                    <div id="now-generator-palette"></div>
                </div>
                <p class="now-generator-hint" data-i18n="generator.review">${i18n.generator.review}</p>
                <div class="now-generator-result-actions">
                    <a id="now-generator-download" data-i18n="generator.download">${i18n.generator.download}</a>
                    <mdui-button id="now-generator-import" variant="tonal" data-i18n="generator.import">${i18n.generator.import}</mdui-button>
                </div>
            </section>
        </form>
        <mdui-button slot="action" variant="text" id="now-generator-close" data-i18n="generator.close">${i18n.generator.close}</mdui-button>
        <mdui-button slot="action" variant="filled" id="now-generator-run" data-i18n="generator.generate">${i18n.generator.generate}</mdui-button>`;
    root.appendChild(dialog);
    const form = dialog.querySelector<HTMLFormElement>("#now-generator-form")!;
    const audio = dialog.querySelector<HTMLInputElement>(
        "#now-generator-audio",
    )!;
    const background = dialog.querySelector<HTMLInputElement>(
        "#now-generator-background",
    )!;
    const title = dialog.querySelector<HTMLInputElement>(
        "#now-generator-song-title",
    )!;
    const artist = dialog.querySelector<HTMLInputElement>(
        "#now-generator-artist",
    )!;
    const bpm = dialog.querySelector<HTMLInputElement>("#now-generator-bpm")!;
    const mode = dialog.querySelector<HTMLSelectElement>(
        "#now-generator-mode",
    )!;
    const density = dialog.querySelector<HTMLSelectElement>(
        "#now-generator-density",
    )!;
    const run = dialog.querySelector<HTMLElement & { disabled: boolean }>(
        "#now-generator-run",
    )!;
    const black = dialog.querySelector<HTMLElement & { disabled: boolean }>(
        "#now-generator-black",
    )!;
    const close = dialog.querySelector("#now-generator-close")!;
    const progress = dialog.querySelector<HTMLElement & { value: number }>(
        "#now-generator-progress",
    )!;
    const status = dialog.querySelector<HTMLElement>("#now-generator-status")!;
    const resultSection = dialog.querySelector("#now-generator-result")!;
    const summary = dialog.querySelector("#now-generator-summary")!;
    const objectSummary = dialog.querySelector("#now-generator-objects")!;
    const palette = dialog.querySelector("#now-generator-palette")!;
    const download = dialog.querySelector<HTMLAnchorElement>(
        "#now-generator-download",
    )!;
    const importButton = dialog.querySelector<
        HTMLElement & { disabled: boolean }
    >("#now-generator-import")!;
    let controller: AbortController | null = null;
    let busy = false;
    let result: GeneratedBeatmapPack | null = null;
    let url = "";
    let autoTitle = "";
    let phase: GeneratorProgress | null = null;
    let error: GeneratorErrorCode | null = null;
    let cancelled = false;

    const render = () => {
        run.disabled = busy;
        black.disabled = busy;
        importButton.disabled = busy || !result;
        for (const input of [
            audio,
            background,
            title,
            artist,
            bpm,
            mode,
            density,
        ])
            input.disabled = busy;
        form.setAttribute("aria-busy", String(busy));
        progress.classList.toggle("now-hidden", !busy);
        status.dataset.error = String(Boolean(error));
        if (error) status.textContent = i18n.generator.errors[error];
        else if (cancelled) status.textContent = i18n.generator.cancelled;
        else if (busy && phase)
            status.textContent = `${i18n.generator[phase.stage]} ${Math.round(phase.value * 100)}%`;
        else status.textContent = result ? i18n.generator.done : "";
        if (result) {
            summary.textContent = format(i18n.generator.summary, {
                count: result.noteCount,
                bpm: result.analysis.bpm.toFixed(2),
                source: result.analysis.estimatedBpm
                    ? i18n.generator.estimated
                    : i18n.generator.manual,
                seconds: Math.round(result.analysis.durationMs / 1000),
            });
            if (
                result.analysis.estimatedBpm &&
                result.analysis.confidence < 0.35
            )
                summary.textContent += ` ${i18n.generator.lowConfidence}`;
            objectSummary.textContent = format(i18n.generator.objects, {
                circles: result.objectCounts.circles,
                sliders: result.objectCounts.sliders,
                holds: result.objectCounts.holds,
                bananas: result.objectCounts.bananaShowers,
            });
            palette.replaceChildren(
                ...result.comboColors.map((color, index) => {
                    const swatch = document.createElement("span");
                    const hex = `#${color.toString(16).padStart(6, "0")}`;
                    swatch.style.backgroundColor = hex;
                    swatch.title = `Combo ${index + 1}: ${hex}`;
                    swatch.setAttribute("role", "img");
                    swatch.setAttribute("aria-label", swatch.title);
                    return swatch;
                }),
            );
        }
    };
    const clearResult = () => {
        if (url) URL.revokeObjectURL(url);
        url = "";
        result = null;
        palette.replaceChildren();
        download.removeAttribute("href");
        resultSection.classList.add("now-hidden");
    };
    form.addEventListener("submit", (event) => event.preventDefault());
    form.addEventListener("change", () => {
        if (!busy) {
            clearResult();
            error = null;
            cancelled = false;
            render();
        }
    });
    audio.addEventListener("change", () => {
        if (!title.value || title.value === autoTitle) {
            autoTitle = audio.files?.[0]?.name.replace(/\.[^.]+$/, "") || "";
            title.value = autoTitle;
        }
    });
    black.addEventListener("click", () => {
        background.value = "";
        clearResult();
        error = null;
        cancelled = false;
        render();
    });
    run.addEventListener("click", async () => {
        if (busy || !form.reportValidity()) return;
        clearResult();
        busy = true;
        error = null;
        cancelled = false;
        phase = { stage: "decode", value: 0 };
        controller = new AbortController();
        const signal = controller.signal;
        render();
        try {
            const pack = await generateBeatmapPack(
                audio.files?.[0] ?? null,
                background.files?.[0] ?? null,
                {
                    mode: mode.value as PlayMode,
                    density: density.value as GeneratorDensity,
                    title: title.value,
                    artist: artist.value,
                    ...(bpm.value.trim() ? { bpm: Number(bpm.value) } : {}),
                },
                signal,
                (state) => {
                    phase = state;
                    progress.value = state.value;
                    render();
                },
            );
            if (signal.aborted || !dialog.open) return;
            result = pack;
            url = URL.createObjectURL(
                new Blob([pack.bytes], { type: "application/zip" }),
            );
            download.href = url;
            download.download = pack.fileName;
            resultSection.classList.remove("now-hidden");
            requestAnimationFrame(() => {
                if (dialog.open)
                    resultSection.scrollIntoView({ block: "nearest" });
            });
        } catch (cause) {
            if (signal.aborted) cancelled = true;
            else
                error = cause instanceof GeneratorError ? cause.code : "failed";
        } finally {
            busy = false;
            controller = null;
            render();
        }
    });
    close.addEventListener("click", () => {
        controller?.abort();
        dialog.open = false;
    });
    const abortClosedJob = () => {
        if (!dialog.open) controller?.abort();
    };
    dialog.addEventListener("close", abortClosedJob);
    dialog.addEventListener("closed", abortClosedJob);
    importButton.addEventListener("click", () => {
        if (!result || busy) return;
        const file = new File([result.bytes], result.fileName, {
            type: "application/octet-stream",
        });
        dialog.open = false;
        importFiles([file]);
    });
    root.querySelector("#now-generator-btn")?.addEventListener("click", () => {
        if (window.gameState !== "menu") return;
        dialog.stackedActions = window.matchMedia("(max-width: 600px)").matches;
        dialog.open = true;
        render();
    });
    onLanguageChange(() => {
        applyI18n(dialog);
        render();
    });
    window.addEventListener("beforeunload", () => {
        controller?.abort();
        if (url) URL.revokeObjectURL(url);
    });
    render();
}
