import { zipSync, strToU8 } from "./vendor/fflate.js";
import { GeneratorError } from "./generatorTypes.ts";
import {
    GENERATOR_DEFAULT_COLORS,
    normalizeGeneratorComboColors,
} from "./generatorColors.ts";
import {
    createGeneratorObjects,
    countGeneratorObjects,
    serializeGeneratorObjects,
    getGeneratorSliderLength,
} from "./generatorObjects.ts";
import type {
    GeneratorAnalysis,
    GeneratorOptions,
    GeneratedBeatmapPack,
} from "./generatorTypes.ts";
import { createGeneratorNotes } from "./generatorPatterns.ts";
import { getGeneratorDifficulty } from "./generatorDifficulty.ts";
import { validateMovementOptions } from "./generatorLearnedMovement.ts";
export { createGeneratorNotes } from "./generatorPatterns.ts";

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

export function buildGeneratedBeatmap(
    analysis: GeneratorAnalysis,
    options: GeneratorOptions,
    audio: { extension: string; bytes: Uint8Array },
    background = GENERATOR_BLACK_PNG,
    colors: readonly number[] = GENERATOR_DEFAULT_COLORS,
): GeneratedBeatmapPack {
    validateMovementOptions(options);
    if (!["mp3", "ogg", "wav"].includes(audio.extension))
        throw new GeneratorError("audio");
    const title = cleanGeneratorText(options.title, "Generated track");
    const artist = cleanGeneratorText(options.artist, "Unknown Artist");
    // Catch positions are finalized after sliders/showers and colour groups
    // are known. Do not run a second, discarded neural/phrase layout first.
    const notes = createGeneratorNotes(analysis, options, {
        deferCatchLayout: true,
    });
    const objects = createGeneratorObjects(analysis, options, notes);
    const objectCounts = countGeneratorObjects(objects);
    const comboColors = normalizeGeneratorComboColors(colors);
    const beat = 60000 / analysis.bpm;
    const difficulty = getGeneratorDifficulty(options);
    const version = `${difficulty.name} Lv.${difficulty.level} - ${
        options.mode === "catch" && options.movementModel === "learned"
            ? `Neural v4 seed ${options.modelSeed ?? 1}`
            : "Review v4"
    }`;
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
        `HPDrainRate:${difficulty.hp.toFixed(2)}`,
        `CircleSize:${options.mode === "mania" ? 4 : difficulty.circleSize.toFixed(2)}`,
        `OverallDifficulty:${difficulty.approachRate.toFixed(2)}`,
        `ApproachRate:${difficulty.approachRate.toFixed(2)}`,
        "SliderMultiplier:1.4",
        "SliderTickRate:1",
        "",
        "[Events]",
        '0,0,"background.png",0,0',
        "",
        "[TimingPoints]",
        `${analysis.offsetMs},${beat.toFixed(8)},4,1,0,80,1,0`,
        ...(objectCounts.sliders
            ? [
                  `${analysis.offsetMs},${(-14000 / getGeneratorSliderLength(analysis.bpm, options)).toFixed(8)},4,1,0,80,0,0`,
              ]
            : []),
        "",
        "[Colours]",
        ...comboColors.map(
            (c, i) =>
                `Combo${i + 1} : ${(c >> 16) & 255},${(c >> 8) & 255},${c & 255}`,
        ),
        "",
        "[HitObjects]",
        ...serializeGeneratorObjects(objects, analysis),
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
        noteCount: objects.length,
        objectCounts,
        comboColors,
        fileName: `${safeName} (nowJS Lv.${difficulty.level}).osz`,
        analysis: {
            bpm: analysis.bpm,
            estimatedBpm: analysis.estimatedBpm,
            confidence: analysis.confidence,
            durationMs: analysis.durationMs,
        },
    };
}
