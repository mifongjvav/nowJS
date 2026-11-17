import { zipSync, strToU8 } from "./vendor/fflate.js";
import { GeneratorError } from "./generatorTypes.ts";
import type {
    AudioOnset,
    GeneratorAnalysis,
    GeneratorOptions,
    GeneratedBeatmapPack,
} from "./generatorTypes.ts";

// Opaque 1x1 RGB PNG, not a transparent placeholder.
export const GENERATOR_BLACK_PNG = new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0,
    0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222, 0, 0, 0, 12, 73, 68, 65, 84, 120,
    156, 99, 96, 96, 96, 0, 0, 0, 4, 0, 1, 246, 23, 56, 85, 0, 0, 0, 0, 73, 69,
    78, 68, 174, 66, 96, 130,
]);

export function cleanGeneratorText(text: string, fallback: string) {
    return (
        String(text ?? "")
            .replace(/[\r\n\t\0]/g, " ")
            .trim()
            .slice(0, 120) || fallback
    );
}

export function createGeneratorNotes(
    analysis: GeneratorAnalysis,
    options: GeneratorOptions,
) {
    if (
        !["catch", "mania"].includes(options.mode) ||
        !["easy", "normal", "hard"].includes(options.density)
    )
        throw new GeneratorError("failed");
    if (
        !Number.isFinite(analysis.bpm) ||
        analysis.bpm < 30 ||
        analysis.bpm > 300
    )
        throw new GeneratorError("bpm");
    if (!analysis.frames.length) throw new GeneratorError("noNotes");
    const divisions = { easy: 1, normal: 2, hard: 4 }[options.density];
    const beat = 60000 / analysis.bpm,
        step = beat / divisions;
    const grid = new Map<number, AudioOnset>();
    const put = (onset: AudioOnset) => {
        const index = Math.round((onset.timeMs - analysis.offsetMs) / step);
        const timeMs = analysis.offsetMs + index * step;
        if (
            timeMs < 250 ||
            timeMs > analysis.durationMs - 100 ||
            Math.abs(timeMs - onset.timeMs) > Math.min(75, step * 0.4)
        )
            return;
        if (!grid.has(index) || grid.get(index)!.strength < onset.strength)
            grid.set(index, { ...onset, timeMs });
    };
    for (const onset of analysis.onsets) put(onset);
    // Sustained/tonal tracks may have few transients: use their audible beats,
    // never silence, as an explicit low-confidence rhythm draft.
    if (grid.size < 4) {
        const spacing =
            analysis.frames.length > 1
                ? analysis.frames[1].timeMs - analysis.frames[0].timeMs
                : 1;
        const start = Math.ceil((250 - analysis.offsetMs) / beat);
        for (
            let i = start;
            analysis.offsetMs + i * beat < analysis.durationMs - 100;
            i++
        ) {
            const timeMs = analysis.offsetMs + i * beat;
            const frame =
                analysis.frames[
                    Math.max(
                        0,
                        Math.min(
                            analysis.frames.length - 1,
                            Math.round(
                                (timeMs - analysis.frames[0].timeMs) / spacing,
                            ),
                        ),
                    )
                ];
            if (frame?.rms > 0.015)
                put({ timeMs, strength: 0.3, brightness: frame.brightness });
        }
    }
    const candidates = [...grid.values()].sort((a, b) => a.timeMs - b.timeMs);
    if (!candidates.length) throw new GeneratorError("noNotes");
    let seed = Math.round(analysis.durationMs) ^ Math.round(analysis.bpm * 100);
    const random = () =>
        (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    let x = 256,
        previousTime = -Infinity,
        previousLane = -1;
    const minGap =
        options.density === "easy"
            ? Math.max(120, beat * 0.8)
            : options.density === "normal"
              ? 110
              : 80;
    const notes: { x: number; time: number }[] = [];
    for (const candidate of candidates) {
        const time = Math.round(candidate.timeMs);
        if (time - previousTime < minGap) continue;
        if (options.mode === "mania") {
            let lane = Math.min(
                3,
                Math.floor(
                    (random() * 0.7 +
                        Math.min(1, candidate.brightness * 4) * 0.3) *
                        4,
                ),
            );
            if (lane === previousLane && time - previousTime < beat * 1.5)
                lane = (lane + 1 + Math.floor(random() * 3)) % 4;
            previousLane = lane;
            x = 64 + lane * 128;
        } else {
            const target =
                48 +
                (random() * 0.65 +
                    Math.min(1, candidate.brightness * 4) * 0.35) *
                    416;
            // Conservative jumps remain playable at the default comfort speed.
            const reach = Math.min(170, (time - previousTime) * 0.3);
            x = Math.max(
                32,
                Math.min(
                    480,
                    x + Math.max(-reach, Math.min(reach, target - x)),
                ),
            );
        }
        notes.push({ x: Math.round(x), time });
        previousTime = time;
    }
    if (!notes.length) throw new GeneratorError("noNotes");
    return notes;
}

export function buildGeneratedBeatmap(
    analysis: GeneratorAnalysis,
    options: GeneratorOptions,
    audio: { extension: string; bytes: Uint8Array },
    background = GENERATOR_BLACK_PNG,
): GeneratedBeatmapPack {
    if (!["mp3", "ogg", "wav"].includes(audio.extension))
        throw new GeneratorError("audio");
    const title = cleanGeneratorText(options.title, "Generated track");
    const artist = cleanGeneratorText(options.artist, "Unknown Artist");
    const notes = createGeneratorNotes(analysis, options);
    const beat = 60000 / analysis.bpm;
    const version = `Generated ${options.density}`;
    const osu = [
        "osu file format v14",
        "",
        "[General]",
        `AudioFilename:audio.${audio.extension}`,
        "AudioLeadIn:1000",
        "PreviewTime:-1",
        "Countdown:0",
        "SampleSet:Normal",
        `Mode:${options.mode === "mania" ? 3 : 2}`,
        "",
        "[Metadata]",
        `Title:${title}`,
        `TitleUnicode:${title}`,
        `Artist:${artist}`,
        `ArtistUnicode:${artist}`,
        "Creator:nowJS Generator",
        `Version:${version}`,
        "Source:Local Meyda analysis",
        "Tags:nowjs generated meyda",
        "",
        "[Difficulty]",
        "HPDrainRate:5",
        "CircleSize:4",
        "OverallDifficulty:5",
        "ApproachRate:5",
        "SliderMultiplier:1.4",
        "SliderTickRate:1",
        "",
        "[Events]",
        '0,0,"background.png",0,0',
        "",
        "[TimingPoints]",
        `${analysis.offsetMs},${beat.toFixed(8)},4,1,0,80,1,0`,
        "",
        "[HitObjects]",
        ...notes.map((note) => `${note.x},192,${note.time},1,0,0:0:0:0:`),
        "",
    ].join("\r\n");
    const bytes = zipSync(
        {
            "generated.osu": [strToU8(osu), { level: 6 }],
            [`audio.${audio.extension}`]: [audio.bytes, { level: 0 }],
            "background.png": [background, { level: 0 }],
        },
        { level: 0 },
    );
    const safeName =
        title
            .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
            .replace(/[. ]+$/g, "")
            .slice(0, 80) || "nowJS";
    return {
        bytes,
        osu,
        noteCount: notes.length,
        fileName: `${safeName} (nowJS).osz`,
        analysis: {
            bpm: analysis.bpm,
            estimatedBpm: analysis.estimatedBpm,
            confidence: analysis.confidence,
            durationMs: analysis.durationMs,
        },
    };
}
