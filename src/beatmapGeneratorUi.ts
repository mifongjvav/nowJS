import { applyI18n, format, i18n, onLanguageChange } from "./i18n/index.ts";
import { generateBeatmapPack } from "./beatmapGeneratorClient.ts";
import { GeneratorError } from "./generatorTypes.ts";
import {
    serializeGeneratorConfig,
    readGeneratorConfigFile,
    generatorConfigFileName,
} from "./generatorConfig.ts";
import type { GeneratorConfigInputs } from "./generatorConfig.ts";
import type {
    GeneratedBeatmapPack,
    GeneratorDensity,
    GeneratorErrorCode,
    GeneratorProgress,
} from "./generatorTypes.ts";
import type { PlayMode } from "./domain.ts";

function restoreGeneratorFileInput(input: HTMLInputElement, file: File | null) {
    input.value = "";
    if (!file) return;
    try {
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
    } catch {
        // Restricted hosts may not expose a writable FileList. The controller
        // keeps the restored File in memory and shows its name separately.
    }
}

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
            <div class="now-generator-config-actions">
                <mdui-button id="now-generator-config-export" variant="outlined" data-i18n="generator.configExport">${i18n.generator.configExport}</mdui-button>
                <mdui-button id="now-generator-config-import" variant="text" data-i18n="generator.configImport">${i18n.generator.configImport}</mdui-button>
                <a id="now-generator-config-download" class="now-hidden" data-i18n="generator.configDownload">${i18n.generator.configDownload}</a>
            </div>
            <p class="now-generator-hint" data-i18n="generator.configHint">${i18n.generator.configHint}</p>
            <label><span data-i18n="generator.audio">${i18n.generator.audio}</span>
                <input id="now-generator-audio" type="file" accept=".mp3,.ogg,.wav" required />
                <span class="now-generator-hint now-hidden" id="now-generator-restored-audio"></span>
            </label>
            <label><span data-i18n="generator.background">${i18n.generator.background}</span>
                <input id="now-generator-background" type="file" accept=".png,.jpg,.jpeg,.webp" />
                <span class="now-generator-hint now-hidden" id="now-generator-restored-background"></span>
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
        <input type="file" id="now-generator-config-file" accept=".json,application/json" hidden />
        <mdui-button slot="action" variant="text" id="now-generator-close" data-i18n="generator.close">${i18n.generator.close}</mdui-button>
        <mdui-button slot="action" variant="filled" id="now-generator-run" data-i18n="generator.generate">${i18n.generator.generate}</mdui-button>`;
    root.appendChild(dialog);
    const form = dialog.querySelector<HTMLFormElement>("#now-generator-form")!;
    const configExport = dialog.querySelector<
        HTMLElement & { disabled: boolean }
    >("#now-generator-config-export")!;
    const configImport = dialog.querySelector<
        HTMLElement & { disabled: boolean }
    >("#now-generator-config-import")!;
    const configInput = dialog.querySelector<HTMLInputElement>(
        "#now-generator-config-file",
    )!;
    const configDownload = dialog.querySelector<HTMLAnchorElement>(
        "#now-generator-config-download",
    )!;
    const restoredAudioName = dialog.querySelector<HTMLElement>(
        "#now-generator-restored-audio",
    )!;
    const restoredBackgroundName = dialog.querySelector<HTMLElement>(
        "#now-generator-restored-background",
    )!;
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
    let restoredAudio: File | null = null;
    let restoredBackground: File | null = null;
    let configUrl = "";
    let notice: "configExported" | "configImported" | null = null;
    const selectedAudio = () => restoredAudio ?? audio.files?.[0] ?? null;
    const selectedBackground = () =>
        restoredBackground ?? background.files?.[0] ?? null;
    const snapshotInputs = (): GeneratorConfigInputs => ({
        title: title.value,
        artist: artist.value,
        bpm: bpm.value,
        mode: mode.value as PlayMode,
        density: density.value as GeneratorDensity,
    });

    const render = () => {
        run.disabled = busy;
        configExport.disabled =
            configImport.disabled =
            configInput.disabled =
                busy;
        black.disabled = busy;
        audio.required = !restoredAudio;
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
        if (phase) progress.value = phase.value;
        for (const [label, input, file] of [
            [restoredAudioName, audio, restoredAudio],
            [restoredBackgroundName, background, restoredBackground],
        ] as const) {
            const fallback = file && !input.files?.length;
            label.classList.toggle("now-hidden", !fallback);
            label.textContent = fallback
                ? format(i18n.generator.configFileLoaded, { name: file.name })
                : "";
        }
        status.dataset.error = String(Boolean(error));
        if (error) status.textContent = i18n.generator.errors[error];
        else if (cancelled) status.textContent = i18n.generator.cancelled;
        else if (busy && phase)
            status.textContent = `${i18n.generator[phase.stage]} ${Math.round(phase.value * 100)}%`;
        else
            status.textContent = notice
                ? i18n.generator[notice]
                : result
                  ? i18n.generator.done
                  : "";
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
    const clearConfigDownload = () => {
        if (configUrl) URL.revokeObjectURL(configUrl);
        configUrl = "";
        configDownload.removeAttribute("href");
        configDownload.classList.add("now-hidden");
    };
    const startTask = (stage: GeneratorProgress["stage"]) => {
        busy = true;
        error = null;
        cancelled = false;
        notice = null;
        phase = { stage, value: 0 };
        controller = new AbortController();
        render();
        return controller.signal;
    };
    const finishTask = () => {
        busy = false;
        controller = null;
        render();
    };
    const taskError = (cause: unknown, signal: AbortSignal) => {
        if (signal.aborted) cancelled = true;
        else error = cause instanceof GeneratorError ? cause.code : "failed";
    };
    form.addEventListener("submit", (event) => event.preventDefault());
    form.addEventListener("change", () => {
        if (!busy) {
            clearResult();
            clearConfigDownload();
            notice = null;
            error = null;
            cancelled = false;
            render();
        }
    });
    audio.addEventListener("change", () => {
        restoredAudio = null;
        if (!title.value || title.value === autoTitle) {
            autoTitle = audio.files?.[0]?.name.replace(/\.[^.]+$/, "") || "";
            title.value = autoTitle;
        }
    });
    background.addEventListener("change", () => {
        restoredBackground = null;
    });
    black.addEventListener("click", () => {
        restoredBackground = null;
        background.value = "";
        clearResult();
        clearConfigDownload();
        notice = null;
        error = null;
        cancelled = false;
        render();
    });
    configExport.addEventListener("click", async () => {
        if (busy || !form.reportValidity()) return;
        clearConfigDownload();
        const inputs = snapshotInputs(),
            sourceAudio = selectedAudio(),
            sourceBackground = selectedBackground();
        const signal = startTask("configExportProgress");
        try {
            const json = await serializeGeneratorConfig(
                inputs,
                sourceAudio,
                sourceBackground,
                {
                    signal,
                    progress: (value) => {
                        phase = { stage: "configExportProgress", value };
                        render();
                    },
                },
            );
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            if (signal.aborted || !dialog.open) return;
            configUrl = URL.createObjectURL(
                new Blob([json], { type: "application/json;charset=utf-8" }),
            );
            configDownload.href = configUrl;
            configDownload.download = generatorConfigFileName(
                inputs.title,
                sourceAudio!.name,
            );
            configDownload.classList.remove("now-hidden");
            notice = "configExported";
            configDownload.click();
        } catch (cause) {
            taskError(cause, signal);
        } finally {
            finishTask();
        }
    });
    configImport.addEventListener("click", () => {
        if (!busy) configInput.click();
    });
    configInput.addEventListener("change", async () => {
        const file = configInput.files?.[0];
        if (!file || busy) return;
        const signal = startTask("configImportProgress");
        try {
            const loaded = await readGeneratorConfigFile(file, {
                signal,
                progress: (value) => {
                    phase = { stage: "configImportProgress", value };
                    render();
                },
            });
            if (signal.aborted || !dialog.open) return;
            clearResult();
            clearConfigDownload();
            restoredAudio = loaded.audio;
            restoredBackground = loaded.background;
            restoreGeneratorFileInput(audio, loaded.audio);
            restoreGeneratorFileInput(background, loaded.background);
            title.value = loaded.inputs.title;
            artist.value = loaded.inputs.artist;
            bpm.value = loaded.inputs.bpm;
            mode.value = loaded.inputs.mode;
            density.value = loaded.inputs.density;
            const base = loaded.audio.name.replace(/\.[^.]+$/, "");
            autoTitle = title.value === base ? base : "";
            notice = "configImported";
        } catch (cause) {
            taskError(cause, signal);
        } finally {
            configInput.value = "";
            finishTask();
        }
    });
    run.addEventListener("click", async () => {
        if (busy || !form.reportValidity()) return;
        clearResult();
        const signal = startTask("decode");
        try {
            const pack = await generateBeatmapPack(
                selectedAudio(),
                selectedBackground(),
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
            taskError(cause, signal);
        } finally {
            finishTask();
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
        if (configUrl) URL.revokeObjectURL(configUrl);
    });
    render();
}
