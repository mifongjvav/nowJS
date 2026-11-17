import { analyzeGeneratorAudio } from "./beatmapAnalysis.ts";
import {
    GENERATOR_DEFAULT_COLORS,
    extractGeneratorComboColors,
} from "./generatorColors.ts";
import {
    buildGeneratedBeatmap,
    GENERATOR_BLACK_PNG,
} from "./beatmapGenerator.ts";
import {
    GENERATOR_MAX_AUDIO_BYTES,
    GENERATOR_MAX_IMAGE_BYTES,
    GENERATOR_MAX_SECONDS,
    GENERATOR_SAMPLE_RATE,
    GeneratorError,
    checkGeneratorAbort,
} from "./generatorTypes.ts";
import type { GeneratorOptions, GeneratorProgress } from "./generatorTypes.ts";
import { getGeneratorDifficulty } from "./generatorDifficulty.ts";

async function decodeGeneratorAudio(bytes: Uint8Array, signal?: AbortSignal) {
    checkGeneratorAbort(signal);
    if (typeof OfflineAudioContext === "undefined")
        throw new GeneratorError("decode");
    const context = new OfflineAudioContext(1, 1, GENERATOR_SAMPLE_RATE);
    let buffer: AudioBuffer;
    try {
        buffer = await context.decodeAudioData(bytes.slice().buffer);
    } catch {
        checkGeneratorAbort(signal);
        throw new GeneratorError("decode");
    }
    checkGeneratorAbort(signal);
    if (buffer.duration < 2 || buffer.duration > GENERATOR_MAX_SECONDS)
        throw new GeneratorError("duration");
    // Pick the strongest channel instead of averaging: opposite-phase stereo
    // must not become silence. The archive still contains the original audio.
    let channel = 0,
        strongest = -1;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
        const data = buffer.getChannelData(c);
        let energy = 0;
        for (let i = 0; i < data.length; i += 128) energy += data[i] * data[i];
        if (energy > strongest) {
            strongest = energy;
            channel = c;
        }
    }
    return {
        samples: new Float32Array(buffer.getChannelData(channel)),
        sampleRate: buffer.sampleRate,
    };
}

async function makeGeneratorBackground(
    file: File | null,
    signal?: AbortSignal,
) {
    if (!file)
        return {
            bytes: GENERATOR_BLACK_PNG,
            colors: [...GENERATOR_DEFAULT_COLORS],
        };
    const url = URL.createObjectURL(file);
    try {
        const image = new Image();
        await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
                image.onload = image.onerror = null;
                signal?.removeEventListener("abort", abort);
            };
            const abort = () => {
                cleanup();
                reject(new DOMException("Cancelled", "AbortError"));
            };
            image.onload = () => {
                cleanup();
                resolve();
            };
            image.onerror = () => {
                cleanup();
                reject(new GeneratorError("image"));
            };
            signal?.addEventListener("abort", abort, { once: true });
            if (signal?.aborted) {
                abort();
                return;
            }
            image.src = url;
        });
        checkGeneratorAbort(signal);
        if (!(image.naturalWidth > 0 && image.naturalHeight > 0))
            throw new GeneratorError("image");
        if (
            image.naturalWidth * image.naturalHeight > 16_777_216 ||
            image.naturalWidth > 8192 ||
            image.naturalHeight > 8192
        )
            throw new GeneratorError("imageSize");
        const ratio = Math.min(
            1,
            1920 / image.naturalWidth,
            1080 / image.naturalHeight,
        );
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new GeneratorError("image");
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, "image/png"),
        );
        if (!blob) throw new GeneratorError("image");
        checkGeneratorAbort(signal);
        const thumbnail = document.createElement("canvas");
        thumbnail.width = thumbnail.height = 64;
        const thumbnailContext = thumbnail.getContext("2d");
        if (!thumbnailContext) throw new GeneratorError("image");
        thumbnailContext.drawImage(canvas, 0, 0, 64, 64);
        const colors = extractGeneratorComboColors(
            thumbnailContext.getImageData(0, 0, 64, 64).data,
        );
        return { bytes: new Uint8Array(await blob.arrayBuffer()), colors };
    } finally {
        URL.revokeObjectURL(url);
    }
}

export async function generateBeatmapPack(
    audio: File | null,
    background: File | null,
    options: GeneratorOptions,
    signal?: AbortSignal,
    progress?: (state: GeneratorProgress) => void,
) {
    checkGeneratorAbort(signal);
    getGeneratorDifficulty(options);
    const extension = audio?.name.split(".").at(-1)?.toLowerCase();
    if (!audio || !extension || !["mp3", "ogg", "wav"].includes(extension))
        throw new GeneratorError("audio");
    if (audio.size <= 0 || audio.size > GENERATOR_MAX_AUDIO_BYTES)
        throw new GeneratorError("audioSize");
    if (background && !/\.(png|jpe?g|webp)$/i.test(background.name))
        throw new GeneratorError("image");
    if (
        background &&
        (background.size <= 0 || background.size > GENERATOR_MAX_IMAGE_BYTES)
    )
        throw new GeneratorError("imageSize");
    if (
        options.bpm !== undefined &&
        (!Number.isFinite(options.bpm) || options.bpm < 30 || options.bpm > 300)
    )
        throw new GeneratorError("bpm");
    progress?.({ stage: "decode", value: 0 });
    const bytes = new Uint8Array(await audio.arrayBuffer());
    checkGeneratorAbort(signal);
    const decoded = await decodeGeneratorAudio(bytes, signal);
    const picture = await makeGeneratorBackground(background, signal);
    const analysis = await analyzeGeneratorAudio(
        decoded.samples,
        decoded.sampleRate,
        {
            bpm: options.bpm,
            signal,
            progress: (value) =>
                progress?.({ stage: "analyze", value: 0.15 + value * 0.7 }),
        },
    );
    progress?.({ stage: "pack", value: 0.9 });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    checkGeneratorAbort(signal);
    const result = buildGeneratedBeatmap(
        analysis,
        options,
        { extension, bytes },
        picture.bytes,
        picture.colors,
    );
    checkGeneratorAbort(signal);
    progress?.({ stage: "pack", value: 1 });
    return result;
}
