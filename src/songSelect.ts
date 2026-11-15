import {
    compileChart,
    decodeArchiveText,
    extractArchive,
    findArchiveFile,
    findArchiveFileByExtension,
    getMimeType,
    parseOsu,
    resolveArchivePath,
    summarizeOsu,
} from "./osuParser.ts";
import {
    getAnimationFramePaths,
    getStoryboardRange,
    normalizeStoryboardPath,
    parseStoryboard,
} from "./storyboard.ts";
import {
    clearCustomHitSamples,
    getMusicDurationMs,
    loadMusic,
    playSongSelectConfirm,
    preloadCatchSamples,
    unloadMusic,
} from "./audio.ts";
import {
    clearStoryboard,
    clearVideo,
    getBackgroundImage,
    setBackground,
    setSamples,
    setStoryboard,
    setVideo,
} from "./background.ts";
import * as ui from "./ui.ts";
import {
    applyThemeFromBackground,
    resetThemeFromBackground,
} from "./dynamicTheme.ts";
import { format, i18n } from "./i18n/index.ts";
import type {
    ArchiveFile,
    CatchHitSample,
    CatchNote,
    CompiledCatchChart,
    GameChart,
    ParsedBeatmap,
    PlayMode,
    PresetChart,
    StoryboardData,
    StoryboardBundle,
} from "./domain.ts";

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".ogv", ".mov"];
const PRESET_CACHE_VERSION = 3;
const PRESET_CHARTS = [
    {
        // MOSS rejects ASCII whitespace in package paths, so the archive uses
        // a sanitized filename while the UI keeps the original beatmap title.
        file: "355322-nekodex-circles.osz",
        label: "355322 nekodex - circles!.osz",
    },
    {
        file: "1841885-cysmix-triangles.osz",
        label: "1841885 cYsmix - triangles.osz",
    },
    {
        file: "1011011-nekodex-new-beginnings.osz",
        label: "1011011 nekodex - new beginnings.osz",
    },
] satisfies PresetChart[];

const DEFAULT_SKIN_FILES = new Set([
    "sliderb0.png",
    "sliderfollowcircle.png",
    "sliderscorepoint.png",
    "reversearrow.png",
    "spinner-background.png",
    "spinner-circle.png",
]);
const DEFAULT_SKIN_ROOT = `${import.meta.env.BASE_URL}osu-resources/Skins/Default`;
const defaultSkinUrls = new Map<string, string>();
let defaultSkinPromise: Promise<void> | null = null;

function ensureDefaultSkinUrls(): Promise<void> {
    if (defaultSkinPromise) return defaultSkinPromise;

    defaultSkinPromise = Promise.all(
        [...DEFAULT_SKIN_FILES].map(async (file) => {
            try {
                const response = await fetch(`${DEFAULT_SKIN_ROOT}/${file}`);
                if (!response.ok) return;

                const blob = await response.blob();
                defaultSkinUrls.set(
                    file,
                    URL.createObjectURL(
                        new Blob([blob], { type: "image/png" }),
                    ),
                );
            } catch (error) {
                console.warn("默认皮肤资源加载失败", file, error);
            }
        }),
    ).then(() => undefined);

    return defaultSkinPromise;
}

function getDefaultSkinUrl(normalizedPath: string): string | null {
    const base = normalizedPath.split("/").pop();
    if (!base || !DEFAULT_SKIN_FILES.has(base)) return null;
    return defaultSkinUrls.get(base) || null;
}

function getStaticSpriteCandidates(file: string): string[] {
    const normalized = normalizeStoryboardPath(file);
    const candidates = [normalized];
    const match = normalized.match(/^(.*?)(\d+)(\.[^./]+)$/);
    if (match) {
        candidates.push(`${match[1]}-${match[2]}${match[3]}`);
    }
    return candidates;
}

function isStoryboardMediaLine(line) {
    return /^\s*(Sprite|Animation|[46])\s*,/i.test(line);
}

function isStoryboardContentLine(line) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("[")) {
        return false;
    }

    const type = (trimmed.split(",", 1)[0] || "").trim().toLowerCase();
    return ![
        "0",
        "1",
        "2",
        "3",
        "5",
        "background",
        "video",
        "break",
        "colour",
        "color",
        "sample",
    ].includes(type);
}

function getInlineStoryboardText(parsed: ParsedBeatmap): string {
    const rawLines = parsed.eventsRaw || [];
    if (!rawLines.some(isStoryboardMediaLine)) return "";

    // Keep sprite/animation declarations and their commands. Ordinary events
    // (background/video/break/sample) are handled by the beatmap parser.
    const inlineLines = rawLines.filter(isStoryboardContentLine);
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
        ? parseStoryboard(sharedText, parsed.formatVersion)
        : { sprites: [], samples: [] };
    const beatmap = inlineText
        ? parseStoryboard(inlineText, parsed.formatVersion)
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
    const resolveCandidate = (candidate: string): string | null => {
        const normalized = normalizeStoryboardPath(candidate);
        if (!normalized) return null;
        if (fileUrls.has(normalized)) return normalized;

        const url = resolveUrl(normalized, candidate);
        if (url) {
            fileUrls.set(normalized, url);
            return normalized;
        }
        return null;
    };

    const resolveStatic = (file: string): void => {
        const normalized = normalizeStoryboardPath(file);
        if (!normalized || fileUrls.has(normalized)) return;

        let resolved = null;
        for (const candidate of getStaticSpriteCandidates(file)) {
            resolved = resolveCandidate(candidate);
            if (resolved) break;
        }

        if (resolved) {
            if (resolved !== normalized) {
                fileUrls.set(normalized, fileUrls.get(resolved));
            }
            return;
        }

        const fallback = getDefaultSkinUrl(normalized);
        if (fallback) {
            fileUrls.set(normalized, fallback);
        }
    };

    for (const sprite of data.sprites) {
        if (sprite.animation) {
            for (
                let frame = 0;
                frame < sprite.animation.frameCount;
                frame += 1
            ) {
                for (const candidate of getAnimationFramePaths(
                    sprite.file,
                    frame,
                )) {
                    if (resolveCandidate(candidate)) break;
                }
            }
        } else {
            resolveStatic(sprite.file);
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
type ChartVariants = Partial<Record<PlayMode, CompiledCatchChart>>;
let currentVariants: ChartVariants | null = null;
interface PendingVariant {
    parsed: ParsedBeatmap;
    playMode: PlayMode;
    resolveSample: (filename: string) => string | null;
    variants: ChartVariants;
}
let pendingVariant: PendingVariant | null = null;
let ownedUrls: string[] = [];
let loadGeneration = 0;

function computeFallSpeed(preemptMs) {
    const scale = window.gameScale;
    const judgeY = window.gameHeight - 160 * scale;
    return (judgeY + 50 * scale) / (preemptMs / 1000);
}

function refreshChartTiming(chart) {
    chart.fallSpeed = computeFallSpeed(chart.preemptMs);
    const tail = chart.audioDurationMs
        ? Math.min(chart.audioDurationMs, chart.lastNoteTime + 6000)
        : chart.lastNoteTime + 2200;
    chart.endTime = Math.max(
        chart.lastNoteTime + 2200,
        tail,
        chart.storyboardEndTime || 0,
    );
}

function finalizeChart(
    chart: Omit<GameChart, "fallSpeed" | "endTime">,
): GameChart {
    refreshChartTiming(chart);
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

function stripExtension(path: string): string {
    return path.replace(/\.[^./\\]+$/, "");
}

function getSampleFileCandidates(sample: CatchHitSample): string[] {
    if (sample.filename) {
        return [sample.filename, stripExtension(sample.filename)];
    }

    // A custom sample bank index of 1 opts into beatmap samples; 2 and above
    // additionally use the numbered file name before the unsuffixed one.
    if (!sample.index || sample.index < 1) return [];
    const base = `${sample.bank}-${sample.name}`;
    const names = [];
    if (sample.index >= 2) names.push(`${base}${sample.index}.wav`);
    names.push(`${base}.wav`);
    return names;
}

function attachHitSampleUrls(
    notes: CatchNote[],
    resolveFile: (filename: string) => string | null,
): void {
    const cache = new Map<string, string | null>();

    for (const note of notes) {
        for (const sample of note.samples || []) {
            if (sample.url) continue;

            const candidates = getSampleFileCandidates(sample);
            if (!candidates.length) continue;

            const key = candidates.join("|").toLowerCase();
            let url: string | null;
            if (cache.has(key)) {
                url = cache.get(key) ?? null;
            } else {
                url = null;
                for (const candidate of candidates) {
                    url = resolveFile(candidate);
                    if (url) break;
                }
                cache.set(key, url);
            }

            if (url) sample.url = url;
        }
    }
}

async function selectChart(
    chart: GameChart,
    variants: ChartVariants,
    newUrls: string[],
    token: number,
): Promise<boolean> {
    if (token !== loadGeneration) {
        revokeUrls(newUrls);
        return false;
    }

    await setBackground(chart.backgroundUrl);
    if (token !== loadGeneration) {
        revokeUrls(newUrls);
        return false;
    }

    // The image is already decoded for the playfield, so reuse it here
    // instead of loading and quantising the full-size background again.
    void applyThemeFromBackground(chart.backgroundUrl, getBackgroundImage());

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
    clearCustomHitSamples();
    revokeUrls(previousUrls);

    currentChart = chart;
    currentVariants = variants;
    window.currentChart = chart;
    preloadCatchSamples(chart.notes);
    ui.setSong(chart);
    return true;
}

export function getCurrentChart(): GameChart | null {
    return currentChart;
}

function getVariant(mode: PlayMode): CompiledCatchChart | null {
    if (!currentChart || !currentVariants) return null;

    const cached = currentVariants[mode];
    if (cached) return cached;

    const pending = pendingVariant;
    if (
        !pending ||
        pending.playMode !== mode ||
        pending.variants !== currentVariants
    ) {
        return null;
    }

    const compiled = compileChart(pending.parsed, mode);
    attachHitSampleUrls(compiled.notes, pending.resolveSample);
    currentVariants[mode] = compiled;
    if (currentVariants.catch && currentVariants.mania) pendingVariant = null;
    return compiled;
}

function warmPendingVariant(): void {
    const pending = pendingVariant;
    if (!pending || !currentVariants || pending.variants !== currentVariants) {
        return;
    }
    getVariant(pending.playMode);
}

function scheduleVariantWarmup(): void {
    if (!pendingVariant) return;

    const requestIdle = (
        window as Window & {
            requestIdleCallback?: (
                callback: () => void,
                options?: { timeout: number },
            ) => number;
        }
    ).requestIdleCallback;

    if (typeof requestIdle === "function") {
        requestIdle(warmPendingVariant, { timeout: 1500 });
    } else {
        setTimeout(warmPendingVariant, 120);
    }
}

export function setPlayMode(mode: PlayMode): void {
    if (window.gameState !== "menu") return;

    const chart = currentChart;
    const variant = getVariant(mode);
    if (!chart || !variant || chart.playMode === mode) return;
    if (!variant.notes.length) {
        // Keep the picker in sync if a chart has no playable notes in the
        // requested mode.
        ui.setSong(chart);
        return;
    }

    chart.notes = variant.notes;
    chart.playMode = variant.playMode;
    chart.mania = variant.mania;
    chart.sourceKeys = variant.sourceKeys;
    chart.objectCount = variant.objectCount;
    chart.firstNoteTime = variant.firstNoteTime;
    chart.lastNoteTime = variant.lastNoteTime;
    chart.lengthMs = variant.lengthMs;
    chart.preemptMs = variant.preemptMs;
    chart.bpm = variant.bpm;
    refreshChartTiming(chart);

    window.currentChart = chart;
    preloadCatchSamples(chart.notes);
    ui.setSong(chart);
}

async function buildImportedChart(
    file: File,
    fileList: File[],
    token: number,
): Promise<GameChart | null> {
    const lowerName = file.name.toLowerCase();
    const newUrls = [];
    const defaultSkinPromise = ensureDefaultSkinUrls();
    let parsed: ParsedBeatmap;
    let archive: ReturnType<typeof extractArchive> | null = null;
    let beatmapPath = file.webkitRelativePath || file.name;

    try {
        if (lowerName.endsWith(".osz") || lowerName.endsWith(".zip")) {
            archive = extractArchive(await file.arrayBuffer());

            if (archive.beatmaps.length === 1) {
                const entry = archive.beatmaps[0];
                const candidate = parseOsu(entry.text);
                if (!candidate.hitObjects.length) {
                    throw new Error(i18n.error.archiveNoBeatmap);
                }
                beatmapPath = entry.name;
                parsed = candidate;
            } else {
                const playable = archive.beatmaps
                    .map((entry) => ({
                        entry,
                        summary: summarizeOsu(entry.text, entry.name),
                    }))
                    .filter((item) => item.summary.objectCount > 0);

                if (!playable.length) {
                    throw new Error(i18n.error.archiveNoBeatmap);
                }

                let chosen = playable[0];
                if (playable.length > 1) {
                    ui.hideLoading();
                    const index = await ui.pickDifficulty(
                        playable.map((item) => item.summary),
                    );
                    if (token !== loadGeneration) return null;
                    if (index === null) return null;
                    ui.showLoading(i18n.loading.parsing);
                    chosen = playable[index];
                }

                beatmapPath = chosen.entry.name;
                parsed = parseOsu(chosen.entry.text);
            }
        } else if (lowerName.endsWith(".osu")) {
            parsed = parseOsu(await file.text());
        } else {
            throw new Error(i18n.error.unsupportedFile);
        }

        if (!parsed.hitObjects.length) {
            throw new Error(i18n.error.noPlayableObjects);
        }

        const defaultMode: PlayMode =
            parsed.general.mode === 3 ? "mania" : "catch";
        const variants: ChartVariants = {};
        let compiled = compileChart(parsed, defaultMode);
        variants[defaultMode] = compiled;
        if (!compiled.notes.length) {
            const fallbackMode: PlayMode =
                defaultMode === "mania" ? "catch" : "mania";
            const fallback = compileChart(parsed, fallbackMode);
            if (!fallback.notes.length) {
                throw new Error(i18n.error.noPlayableObjects);
            }
            variants[fallbackMode] = fallback;
            compiled = fallback;
        }
        const alternateMode: PlayMode =
            compiled.playMode === "mania" ? "catch" : "mania";

        // Resolve per-object custom hit samples from the .osu hitSample
        // filename (and from the archive/companion files). Missing files fall
        // back to the built-in Argon Pro/Argon/default sample banks.
        const resolveHitSample = (filename: string) => {
            if (archive) {
                const entry = findArchiveFile(
                    archive.files,
                    filename,
                    beatmapPath,
                );
                return entry ? makeBlobUrl(entry, newUrls) : null;
            }

            const companion = findCompanionFile(
                fileList,
                filename,
                beatmapPath,
            );
            return companion ? makeFileUrl(companion, newUrls) : null;
        };
        let audioUrl = null;
        let backgroundUrl = null;
        let audioDurationMs = 0;
        let videoUrl = null;
        let storyboard: StoryboardBundle | null = null;

        attachHitSampleUrls(compiled.notes, resolveHitSample);
        const pending: PendingVariant | null = variants[alternateMode]
            ? null
            : {
                  parsed,
                  playMode: alternateMode,
                  resolveSample: resolveHitSample,
                  variants,
              };

        let musicPromise: Promise<unknown> | null = null;
        const startMusic = () => {
            if (audioUrl && !musicPromise) {
                musicPromise = loadMusic(audioUrl);
                // The failure is reported when the chart awaits the load;
                // mark the early rejection as handled in the meantime.
                musicPromise.catch(() => undefined);
            }
        };

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
                startMusic();
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

            await defaultSkinPromise;
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
                startMusic();
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
            const storyboardParts: StoryboardData[] = [];

            if (osbFile) {
                storyboardParts.push(
                    parseStoryboard(await osbFile.text(), parsed.formatVersion),
                );
            }
            const inlineStoryboard = getInlineStoryboardText(parsed);
            if (inlineStoryboard) {
                storyboardParts.push(
                    parseStoryboard(inlineStoryboard, parsed.formatVersion),
                );
            }

            await defaultSkinPromise;
            storyboard = buildStoryboard(
                {
                    sprites: storyboardParts.flatMap((part) => part.sprites),
                    samples: storyboardParts.flatMap((part) => part.samples),
                },
                (normalized, file) => {
                    const match = findCompanionFile(
                        fileList,
                        file,
                        beatmapPath,
                    );
                    if (!match) return null;
                    const url = URL.createObjectURL(match);
                    newUrls.push(url);
                    return url;
                },
            );
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
                layer: sample.layer,
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
                // Decoding starts as soon as the audio entry is known so it
                // overlaps storyboard parsing and media URL creation.
                await (musicPromise || loadMusic(audioUrl));
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
            mode: compiled.mode,
            playMode: compiled.playMode,
            mania: compiled.mania,
            sourceKeys: compiled.sourceKeys,
            audioUrl,
            audioDurationMs,
            backgroundUrl,
            backgroundFile: parsed.events.background,
            videoUrl,
            videoOffset: parsed.events.videoOffset || 0,
            storyboard,
            samples,
            breaks: parsed.events.breaks || [],
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

        const applied = await selectChart(chart, variants, newUrls, token);
        if (!applied) return null;
        pendingVariant = pending;
        return chart;
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
        if (chart.mode === 3) {
            const keys = chart.sourceKeys ?? chart.mania?.sourceKeys ?? 4;
            const laneCount = chart.mania?.laneCount ?? 4;
            const maniaMessage =
                chart.playMode === "mania" && keys !== laneCount
                    ? format(i18n.toast.maniaConverted, {
                          keys,
                          laneCount,
                      })
                    : format(i18n.toast.maniaDetected, { keys });
            ui.showToast(maniaMessage, "info");
        }
        playSongSelectConfirm();
        window.gameState = "menu";
        window.gameplayLayer.visible = false;
        window.statsLayer.visible = false;
        scheduleVariantWarmup();
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
    void ensureDefaultSkinUrls();
    ui.setUICallbacks({
        importFiles,
        preset: loadPresetChart,
        modeChange: setPlayMode,
    });
    ui.setPresetCharts(PRESET_CHARTS);
}

export function showPresetMenu() {
    currentChart = null;
    currentVariants = null;
    pendingVariant = null;
    window.currentChart = null;
    resetThemeFromBackground();
    ui.setSong(null);
    ui.hideLoading();
    ui.showMenu();
    window.gameState = "menu";
    window.gameplayLayer.visible = false;
    window.statsLayer.visible = false;
}
