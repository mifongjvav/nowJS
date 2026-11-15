import {
    compileCatchChart,
    decodeArchiveText,
    extractArchive,
    findArchiveFile,
    findArchiveFileByExtension,
    getMimeType,
    parseOsu,
    resolveArchivePath,
} from "./osuParser.ts";
import {
    getAnimationFramePath,
    getStoryboardRange,
    normalizeStoryboardPath,
    parseStoryboard,
} from "./storyboard.ts";
import {
    getMusicDurationMs,
    loadMusic,
    playSongSelectConfirm,
    unloadMusic,
} from "./audio.ts";
import {
    clearStoryboard,
    clearVideo,
    setBackground,
    setSamples,
    setStoryboard,
    setVideo,
} from "./background.ts";
import * as ui from "./ui.ts";
import { format, i18n } from "./i18n/index.ts";
import type {
    ArchiveFile,
    GameChart,
    ParsedBeatmap,
    PresetChart,
    StoryboardData,
    StoryboardBundle,
} from "./domain.ts";

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".ogv", ".mov"];
const PRESET_CACHE_VERSION = 2;
const PRESET_CHARTS = [
    {
        // MOSS rejects ASCII whitespace in package paths, so the archive uses
        // a sanitized filename while the UI keeps the original beatmap title.
        file: "355322-nekodex-circles.osz",
        label: "355322 nekodex - circles!.osz",
    },
] satisfies PresetChart[];

function isStoryboardMediaLine(line) {
    return /^\s*(Sprite|Animation)\s*,/i.test(line);
}

function getInlineStoryboardText(parsed: ParsedBeatmap): string {
    const inlineLines = (parsed.eventsRaw || []).filter(isStoryboardMediaLine);
    if (!inlineLines.length) return "";

    return [...(parsed.variablesRaw || []), "[Events]", ...inlineLines].join(
        "\n",
    );
}

function getArchiveStoryboardData(
    archive: ReturnType<typeof extractArchive>,
    parsed: ParsedBeatmap,
): StoryboardData {
    const osbEntry = findArchiveFileByExtension(archive.files, [".osb"]);
    const sharedText = osbEntry ? decodeArchiveText(osbEntry) : "";
    const inlineText = getInlineStoryboardText(parsed);
    const shared = sharedText.trim()
        ? parseStoryboard(sharedText)
        : { sprites: [], samples: [] };
    const beatmap = inlineText
        ? parseStoryboard(inlineText)
        : { sprites: [], samples: [] };

    return {
        // .osb is shared by every difficulty; .osu contributes difficulty-
        // specific objects and sounds. Keep both sets in authored order.
        sprites: [...shared.sprites, ...beatmap.sprites],
        samples: [...shared.samples, ...beatmap.samples],
    };
}

function buildStoryboard(
    source: string | StoryboardData | null,
    resolveUrl: (normalizedPath: string, originalPath: string) => string | null,
): StoryboardBundle | null {
    if (!source) return null;

    const data = typeof source === "string" ? parseStoryboard(source) : source;
    if (!data.sprites.length) return null;

    const fileUrls = new Map<string, string>();
    const resolve = (file: string): void => {
        const normalized = normalizeStoryboardPath(file);
        if (!normalized || fileUrls.has(normalized)) return;

        const url = resolveUrl(normalized, file);
        if (url) fileUrls.set(normalized, url);
    };

    for (const sprite of data.sprites) {
        if (sprite.animation) {
            for (
                let frame = 0;
                frame < sprite.animation.frameCount;
                frame += 1
            ) {
                resolve(getAnimationFramePath(sprite.file, frame));
            }
        } else {
            resolve(sprite.file);
        }
    }

    if (!fileUrls.size) return null;
    return { data, fileUrls };
}

function findCompanionFile(
    files: File[],
    wantedPath: string | null | undefined,
    relativeTo = "",
): File | null {
    if (!wantedPath) return null;
    const wanted = resolveArchivePath(wantedPath, relativeTo);
    if (!wanted) return null;

    const wantedBase = wanted.split("/").pop();
    for (const file of files) {
        const name = resolveArchivePath(file.webkitRelativePath || file.name);
        if (!name) continue;
        if (name === wanted || name.split("/").pop() === wantedBase) {
            return file;
        }
    }
    return null;
}

function findCompanionByExtension(
    files: File[],
    extensions: readonly string[],
): File | null {
    return (
        files.find((file) =>
            extensions.some((extension) =>
                file.name.toLowerCase().endsWith(extension),
            ),
        ) || null
    );
}

let currentChart: GameChart | null = null;
let ownedUrls: string[] = [];
let loadGeneration = 0;

function computeFallSpeed(preemptMs) {
    const scale = window.gameScale;
    const judgeY = window.gameHeight - 160 * scale;
    return (judgeY + 50 * scale) / (preemptMs / 1000);
}

function finalizeChart(
    chart: Omit<GameChart, "fallSpeed" | "endTime">,
): GameChart {
    chart.fallSpeed = computeFallSpeed(chart.preemptMs);
    const tail = chart.audioDurationMs
        ? Math.min(chart.audioDurationMs, chart.lastNoteTime + 6000)
        : chart.lastNoteTime + 2200;
    chart.endTime = Math.max(chart.lastNoteTime + 2200, tail);
    return chart;
}

function makeBlobUrl(entry: ArchiveFile, into: string[]): string {
    const blob = new Blob([entry.data], { type: getMimeType(entry.name) });
    const url = URL.createObjectURL(blob);
    into.push(url);
    return url;
}

function makeFileUrl(file: File, into: string[]): string {
    const url = URL.createObjectURL(file);
    into.push(url);
    return url;
}

function revokeUrls(urls: string[]): void {
    for (const url of urls) {
        URL.revokeObjectURL(url);
    }
}

async function selectChart(
    chart: GameChart,
    newUrls: string[],
    token: number,
): Promise<boolean> {
    if (token !== loadGeneration) {
        revokeUrls(newUrls);
        return false;
    }

    await setBackground(chart.backgroundUrl, {
        blur: !chart.hasVideo && !chart.hasStoryboard,
    });
    if (token !== loadGeneration) {
        revokeUrls(newUrls);
        return false;
    }

    setSamples(chart.samples || []);

    if (chart.videoUrl) {
        setVideo(chart.videoUrl, chart.videoOffset || 0);
    } else {
        clearVideo();
    }

    if (chart.storyboard) {
        setStoryboard(chart.storyboard.data, {
            fileUrls: chart.storyboard.fileUrls,
            backgroundFile: chart.backgroundFile,
            widescreen: chart.widescreenStoryboard,
            replacesBackground: chart.replacesBackground,
        });
    } else {
        clearStoryboard();
    }

    const previousUrls = ownedUrls;
    ownedUrls = newUrls;
    revokeUrls(previousUrls);

    currentChart = chart;
    window.currentChart = chart;
    ui.setSong(chart);
    return true;
}

export function getCurrentChart(): GameChart | null {
    return currentChart;
}

function summarize(parsed: ParsedBeatmap, fileName: string) {
    const firstRed = parsed.timingPoints.find(
        (point) => point.uninherited && point.beatLength > 0,
    );
    const metadata = parsed.metadata;
    return {
        metadata: {
            ...metadata,
            title: metadata.title || fileName.replace(/\.osu$/i, ""),
            titleUnicode:
                metadata.titleUnicode ||
                metadata.title ||
                fileName.replace(/\.osu$/i, ""),
        },
        bpm: firstRed ? 60000 / firstRed.beatLength : 0,
        objectCount: parsed.hitObjects.length,
    };
}

async function buildImportedChart(
    file: File,
    fileList: File[],
    token: number,
): Promise<GameChart | null> {
    const lowerName = file.name.toLowerCase();
    const newUrls = [];
    let parsed: ParsedBeatmap;
    let archive: ReturnType<typeof extractArchive> | null = null;
    let beatmapPath = file.webkitRelativePath || file.name;

    try {
        if (lowerName.endsWith(".osz") || lowerName.endsWith(".zip")) {
            archive = extractArchive(await file.arrayBuffer());
            const parsedList = archive.beatmaps
                .map((entry) => ({
                    entry,
                    parsed: parseOsu(entry.text),
                }))
                .filter((item) => item.parsed.hitObjects.length > 0);

            if (!parsedList.length) {
                throw new Error(i18n.error.archiveNoBeatmap);
            }

            let chosen = parsedList[0];
            if (parsedList.length > 1) {
                ui.hideLoading();
                const summaries = parsedList.map((item) =>
                    summarize(item.parsed, item.entry.name),
                );
                const index = await ui.pickDifficulty(summaries);
                if (token !== loadGeneration) return null;
                if (index === null) return null;
                ui.showLoading(i18n.loading.parsing);
                chosen = parsedList[index];
            }

            beatmapPath = chosen.entry.name;
            parsed = chosen.parsed;
        } else if (lowerName.endsWith(".osu")) {
            parsed = parseOsu(await file.text());
        } else {
            throw new Error(i18n.error.unsupportedFile);
        }

        if (!parsed.hitObjects.length) {
            throw new Error(i18n.error.noPlayableObjects);
        }

        const compiled = compileCatchChart(parsed);
        if (!compiled.notes.length) {
            throw new Error(i18n.error.noPlayableObjects);
        }

        let audioUrl = null;
        let backgroundUrl = null;
        let audioDurationMs = 0;
        let videoUrl = null;
        let storyboard: StoryboardBundle | null = null;

        if (archive) {
            const audioEntry =
                findArchiveFile(
                    archive.files,
                    parsed.general.audioFilename,
                    beatmapPath,
                ) ||
                findArchiveFileByExtension(archive.files, [
                    ".mp3",
                    ".ogg",
                    ".wav",
                    ".m4a",
                ]);
            if (audioEntry) {
                audioUrl = makeBlobUrl(audioEntry, newUrls);
            }

            const backgroundEntry =
                findArchiveFile(
                    archive.files,
                    parsed.events.background,
                    beatmapPath,
                ) ||
                findArchiveFileByExtension(archive.files, [
                    ".jpg",
                    ".jpeg",
                    ".png",
                    ".webp",
                ]);
            if (backgroundEntry) {
                backgroundUrl = makeBlobUrl(backgroundEntry, newUrls);
            }

            if (parsed.events.video) {
                const videoEntry =
                    findArchiveFile(
                        archive.files,
                        parsed.events.video,
                        beatmapPath,
                    ) ||
                    findArchiveFileByExtension(archive.files, VIDEO_EXTENSIONS);
                if (videoEntry) {
                    videoUrl = makeBlobUrl(videoEntry, newUrls);
                }
            }

            storyboard = buildStoryboard(
                getArchiveStoryboardData(archive, parsed),
                (normalized, file) => {
                    const entry = findArchiveFile(
                        archive.files,
                        file,
                        beatmapPath,
                    );
                    return entry ? makeBlobUrl(entry, newUrls) : null;
                },
            );
        } else {
            const companionAudio =
                findCompanionFile(
                    fileList,
                    parsed.general.audioFilename,
                    beatmapPath,
                ) ||
                fileList.find((item) =>
                    /\.(mp3|ogg|wav|m4a)$/i.test(item.name),
                );
            if (companionAudio) {
                audioUrl = URL.createObjectURL(companionAudio);
                newUrls.push(audioUrl);
            }

            const companionImage =
                findCompanionFile(
                    fileList,
                    parsed.events.background,
                    beatmapPath,
                ) ||
                fileList.find((item) => /\.(jpe?g|png|webp)$/i.test(item.name));
            if (companionImage) {
                backgroundUrl = URL.createObjectURL(companionImage);
                newUrls.push(backgroundUrl);
            }

            if (parsed.events.video) {
                const videoFile =
                    findCompanionFile(
                        fileList,
                        parsed.events.video,
                        beatmapPath,
                    ) || findCompanionByExtension(fileList, VIDEO_EXTENSIONS);
                if (videoFile) {
                    videoUrl = URL.createObjectURL(videoFile);
                    newUrls.push(videoUrl);
                }
            }

            const osbFile = fileList.find((item) =>
                item.name.toLowerCase().endsWith(".osb"),
            );
            const storyboardText = osbFile
                ? await osbFile.text()
                : getInlineStoryboardText(parsed);

            storyboard = buildStoryboard(storyboardText, (normalized, file) => {
                const match = findCompanionFile(fileList, file, beatmapPath);
                if (!match) return null;
                const url = URL.createObjectURL(match);
                newUrls.push(url);
                return url;
            });
        }

        const sampleEvents = [
            ...(parsed.events.samples || []),
            ...(storyboard?.data.samples || []),
        ];
        const sampleUrlCache = new Map<string, string>();
        const samples: GameChart["samples"] = [];

        for (const sample of sampleEvents) {
            const normalized = normalizeStoryboardPath(sample.file);
            if (!normalized || !Number.isFinite(sample.time)) continue;

            let url = sampleUrlCache.get(normalized);
            if (!url) {
                if (archive) {
                    const entry = findArchiveFile(
                        archive.files,
                        sample.file,
                        beatmapPath,
                    );
                    if (!entry) continue;
                    url = makeBlobUrl(entry, newUrls);
                } else {
                    const file = findCompanionFile(
                        fileList,
                        sample.file,
                        beatmapPath,
                    );
                    if (!file) continue;
                    url = makeFileUrl(file, newUrls);
                }
                sampleUrlCache.set(normalized, url);
            }

            samples.push({
                time: sample.time,
                url,
                volume: sample.volume ?? 100,
            });
        }

        samples.sort((a, b) => a.time - b.time);

        const backgroundPath = normalizeStoryboardPath(
            parsed.events.background,
        );
        const replacesBackground = Boolean(
            storyboard &&
            backgroundPath &&
            storyboard.data.sprites.some(
                (sprite) =>
                    sprite.layer === "Background" &&
                    normalizeStoryboardPath(sprite.file) === backgroundPath,
            ),
        );

        const storyboardRange = storyboard
            ? getStoryboardRange(storyboard.data)
            : null;
        const sampleStart = samples.length ? samples[0].time : Infinity;
        const sampleEnd = samples.length
            ? samples[samples.length - 1].time
            : -Infinity;
        const earliestMediaTime = Math.min(
            storyboardRange?.start ?? Infinity,
            sampleStart,
        );
        const storyboardStartTime = Number.isFinite(earliestMediaTime)
            ? earliestMediaTime
            : 0;

        if (token !== loadGeneration) {
            revokeUrls(newUrls);
            return null;
        }

        if (!archive && !audioUrl) {
            ui.showToast(i18n.toast.noAudio, "info");
        }

        if (audioUrl) {
            ui.showLoading(i18n.loading.audio);
            try {
                await loadMusic(audioUrl);
                if (token !== loadGeneration) {
                    revokeUrls(newUrls);
                    return null;
                }
                audioDurationMs = getMusicDurationMs();
            } catch (error) {
                if (token !== loadGeneration) {
                    revokeUrls(newUrls);
                    return null;
                }
                console.warn("音频加载失败", error);
                unloadMusic();
                audioUrl = null;
                ui.showToast(i18n.toast.audioFailed, "info");
            }
        } else {
            unloadMusic();
        }

        const titleFallback = file.name.replace(/\.(osz|zip|osu)$/i, "");
        const metadata = compiled.metadata;
        metadata.title = metadata.title || titleFallback;
        metadata.titleUnicode = metadata.titleUnicode || metadata.title;

        const chart = finalizeChart({
            source: archive ? "osz" : "osu",
            fileName:
                fileList.length > 1
                    ? format(i18n.menu.multipleFiles, {
                          name: file.name,
                          count: fileList.length,
                      })
                    : file.name,
            metadata,
            bpm: compiled.bpm,
            notes: compiled.notes,
            objectCount: compiled.objectCount,
            firstNoteTime: compiled.firstNoteTime,
            lastNoteTime: compiled.lastNoteTime,
            lengthMs: compiled.lengthMs,
            preemptMs: compiled.preemptMs,
            audioUrl,
            audioDurationMs,
            backgroundUrl,
            backgroundFile: parsed.events.background,
            videoUrl,
            videoOffset: parsed.events.videoOffset || 0,
            storyboard,
            samples,
            replacesBackground,
            storyboardStartTime,
            storyboardEndTime: Math.max(
                storyboardRange?.end ?? 0,
                Number.isFinite(sampleEnd) ? sampleEnd : 0,
            ),
            widescreenStoryboard: parsed.general.widescreenStoryboard,
            hasVideo: Boolean(videoUrl),
            hasStoryboard: Boolean(storyboard),
        });

        chart.endTime = Math.max(
            chart.endTime,
            storyboardRange?.end ?? 0,
            Number.isFinite(sampleEnd) ? sampleEnd : 0,
        );

        const applied = await selectChart(chart, newUrls, token);
        return applied ? chart : null;
    } catch (error) {
        revokeUrls(newUrls);
        throw error;
    }
}

export async function importFiles(files: File[]): Promise<void> {
    if (!files.length) return;

    const mainFile = files.find((file) => /\.(osu|osz|zip)$/i.test(file.name));
    if (!mainFile) {
        ui.showToast(i18n.toast.chooseFile);
        return;
    }

    const token = ++loadGeneration;
    ui.showLoading(i18n.loading.reading);
    try {
        const chart = await buildImportedChart(mainFile, files, token);
        if (token !== loadGeneration) return;
        if (!chart) {
            ui.hideLoading();
            return;
        }
        ui.hideLoading();
        ui.setSong(chart);
        ui.showMenu();
        playSongSelectConfirm();
        window.gameState = "menu";
        window.gameplayLayer.visible = false;
        window.statsLayer.visible = false;
    } catch (error) {
        if (token !== loadGeneration) return;
        console.error(error);
        ui.hideLoading();
        ui.showToast(
            format(i18n.toast.importFailed, {
                message: error.message || error,
            }),
        );
    }
}

async function loadPresetChart(preset: PresetChart): Promise<void> {
    ui.showLoading(i18n.loading.reading);

    try {
        // MOSS resolves fetch paths from the package root. Avoid document.baseURI
        // (the sandbox document is a Blob URL) and use a package-relative path.
        // The version query bypasses stale edge/browser caches that can hold an
        // HTML fallback for a missing asset; MOSS's package fetch ignores it.
        const response = await fetch(
            `./preset-charts/${encodeURIComponent(preset.file)}?v=${PRESET_CACHE_VERSION}`,
        );
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const blob = await response.blob();
        const expectedSize = Number(
            response.headers.get("content-length") || 0,
        );
        if (
            !response.headers.get("content-encoding") &&
            expectedSize > 0 &&
            blob.size !== expectedSize
        ) {
            throw new Error(i18n.error.presetIncomplete);
        }
        const signature = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
        if (signature[0] !== 0x50 || signature[1] !== 0x4b) {
            throw new Error(i18n.error.presetNotZip);
        }

        const file = new File([blob], preset.file, {
            type: "application/zip",
        });
        await importFiles([file]);
    } catch (error) {
        console.error("预制曲包加载失败", error);
        ui.hideLoading();
        ui.showToast(
            format(i18n.toast.presetFailed, { message: error.message }),
        );
    }
}

export function initSongSelect() {
    ui.setUICallbacks({
        importFiles,
        preset: loadPresetChart,
    });
    ui.setPresetCharts(PRESET_CHARTS);
}

export function showPresetMenu() {
    currentChart = null;
    window.currentChart = null;
    ui.setSong(null);
    ui.hideLoading();
    ui.showMenu();
    window.gameState = "menu";
    window.gameplayLayer.visible = false;
    window.statsLayer.visible = false;
}
