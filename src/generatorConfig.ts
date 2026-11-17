import {
    GENERATOR_MAX_AUDIO_BYTES,
    GENERATOR_MAX_IMAGE_BYTES,
    GeneratorError,
    checkGeneratorAbort,
} from "./generatorTypes.ts";
import type { PlayMode } from "./domain.ts";
import type { GeneratorDensity } from "./generatorTypes.ts";

const FORMAT = "nowjs-beatmap-generator";
const VERSION = 2;
const encodedLength = (bytes: number) => Math.ceil(bytes / 3) * 4;
export const GENERATOR_MAX_CONFIG_BYTES =
    encodedLength(GENERATOR_MAX_AUDIO_BYTES) +
    encodedLength(GENERATOR_MAX_IMAGE_BYTES) +
    65536;

export interface GeneratorConfigInputs {
    title: string;
    artist: string;
    /** Exact form value: empty means estimate again, not a saved guessed BPM. */
    bpm: string;
    mode: PlayMode;
    density: GeneratorDensity;
    difficulty: number;
    movementModel?: "phrases" | "learned";
    modelSeed?: number;
}
interface ConfigMedia {
    name: string;
    type: string;
    size: number;
    lastModified: number;
    encoding: "base64";
    base64: string;
}
interface GeneratorConfig {
    format: typeof FORMAT;
    version: typeof VERSION;
    createdAt: string;
    inputs: GeneratorConfigInputs;
    audio: ConfigMedia;
    /** null preserves "no image supplied / pure black", not the previous image. */
    background: ConfigMedia | null;
}
export interface RestoredGeneratorConfig {
    inputs: GeneratorConfigInputs;
    audio: File;
    background: File | null;
}
type Task = { signal?: AbortSignal; progress?: (value: number) => void };
const yieldTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new GeneratorError("config");
    return value as Record<string, unknown>;
}
function validateInputs(value: unknown, legacy = false): GeneratorConfigInputs {
    const input = record(value);
    for (const key of ["title", "artist"] as const) {
        if (
            typeof input[key] !== "string" ||
            input[key].length > 120 ||
            /[\r\n\0]/.test(input[key])
        )
            throw new GeneratorError("config");
    }
    if (
        typeof input.bpm !== "string" ||
        input.bpm.length > 32 ||
        (input.bpm !== "" &&
            (!/^(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?$/.test(input.bpm) ||
                !Number.isFinite(Number(input.bpm)) ||
                Number(input.bpm) < 30 ||
                Number(input.bpm) > 300))
    )
        throw new GeneratorError("config");
    if (input.mode !== "catch" && input.mode !== "mania")
        throw new GeneratorError("config");
    if (
        input.density !== "easy" &&
        input.density !== "normal" &&
        input.density !== "hard"
    )
        throw new GeneratorError("config");
    const difficulty =
        legacy && input.difficulty === undefined
            ? { easy: 1, normal: 2, hard: 4 }[input.density]
            : input.difficulty;
    if (
        typeof difficulty !== "number" ||
        !Number.isFinite(difficulty) ||
        difficulty < 1
    )
        throw new GeneratorError("config");
    if (
        input.movementModel !== undefined &&
        input.movementModel !== "phrases" &&
        input.movementModel !== "learned"
    )
        throw new GeneratorError("config");
    if (
        input.modelSeed !== undefined &&
        (!Number.isInteger(input.modelSeed) ||
            (input.modelSeed as number) < 0 ||
            (input.modelSeed as number) > 0xffffffff)
    )
        throw new GeneratorError("config");
    return {
        title: input.title as string,
        artist: input.artist as string,
        bpm: input.bpm,
        mode: input.mode,
        density: input.density,
        difficulty,
        ...(input.movementModel === undefined
            ? {}
            : { movementModel: input.movementModel as "phrases" | "learned" }),
        ...(input.modelSeed === undefined
            ? {}
            : { modelSeed: input.modelSeed as number }),
    };
}

function validateMedia(value: unknown, image: boolean): ConfigMedia {
    const media = record(value);
    const limit = image ? GENERATOR_MAX_IMAGE_BYTES : GENERATOR_MAX_AUDIO_BYTES;
    if (
        typeof media.name !== "string" ||
        media.name.length > 255 ||
        /[\\/\r\n\0]/.test(media.name) ||
        !(image ? /\.(png|jpe?g|webp)$/i : /\.(mp3|ogg|wav)$/i).test(
            media.name,
        ) ||
        typeof media.type !== "string" ||
        media.type.length > 256 ||
        /[\r\n\0]/.test(media.type) ||
        !Number.isSafeInteger(media.lastModified) ||
        (media.lastModified as number) < 0 ||
        !Number.isSafeInteger(media.size) ||
        (media.size as number) <= 0 ||
        media.encoding !== "base64" ||
        typeof media.base64 !== "string"
    )
        throw new GeneratorError("config");
    const size = media.size as number;
    if (size > limit || media.base64.length > encodedLength(limit))
        throw new GeneratorError("configSize");
    const data = media.base64;
    const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
    if (
        data.length !== encodedLength(size) ||
        (data.length / 4) * 3 - padding !== size
    )
        throw new GeneratorError("config");
    // Validate in bounded, non-backtracking chunks before decoding or allocating.
    const body = data.length - padding;
    for (let start = 0; start < body; start += 32768) {
        if (
            !/^[A-Za-z0-9+/]+$/.test(
                data.slice(start, Math.min(body, start + 32768)),
            )
        )
            throw new GeneratorError("config");
    }
    const alphabet =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    if (
        (padding === 2 && (alphabet.indexOf(data[body - 1]) & 15) !== 0) ||
        (padding === 1 && (alphabet.indexOf(data[body - 1]) & 3) !== 0)
    )
        throw new GeneratorError("config");
    return {
        name: media.name,
        type: media.type,
        size,
        lastModified: media.lastModified as number,
        encoding: "base64",
        base64: data,
    };
}

async function encodeFile(
    file: File,
    image: boolean,
    task: Task,
): Promise<ConfigMedia> {
    const limit = image ? GENERATOR_MAX_IMAGE_BYTES : GENERATOR_MAX_AUDIO_BYTES;
    if (file.size <= 0 || file.size > limit)
        throw new GeneratorError("configSize");
    checkGeneratorAbort(task.signal);
    const bytes = new Uint8Array(await file.arrayBuffer());
    checkGeneratorAbort(task.signal);
    const parts: string[] = [];
    // A multiple of three prevents padding in the middle. Avoid spreading
    // multi-megabyte arrays into one call (browser argument/stack limits).
    const chunk = 24576;
    for (let start = 0; start < bytes.length; start += chunk) {
        checkGeneratorAbort(task.signal);
        parts.push(
            btoa(String.fromCharCode(...bytes.subarray(start, start + chunk))),
        );
        if (parts.length % 32 === 0) {
            task.progress?.(Math.min(1, (start + chunk) / bytes.length));
            await yieldTask();
        }
    }
    checkGeneratorAbort(task.signal);
    const media = {
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified,
        encoding: "base64",
        base64: parts.join(""),
    };
    validateMedia(media, image);
    task.progress?.(1);
    checkGeneratorAbort(task.signal);
    return media as ConfigMedia;
}

async function restoreFile(media: ConfigMedia, task: Task): Promise<File> {
    checkGeneratorAbort(task.signal);
    const bytes = new Uint8Array(media.size);
    let offset = 0,
        count = 0;
    for (let start = 0; start < media.base64.length; start += 32768) {
        checkGeneratorAbort(task.signal);
        let binary: string;
        try {
            binary = atob(media.base64.slice(start, start + 32768));
        } catch {
            throw new GeneratorError("config");
        }
        for (let index = 0; index < binary.length; index++)
            bytes[offset++] = binary.charCodeAt(index);
        if (++count % 32 === 0) {
            task.progress?.(offset / media.size);
            await yieldTask();
        }
    }
    if (offset !== media.size) throw new GeneratorError("config");
    checkGeneratorAbort(task.signal);
    task.progress?.(1);
    checkGeneratorAbort(task.signal);
    return new File([bytes], media.name, {
        type: media.type,
        lastModified: media.lastModified,
    });
}

export async function serializeGeneratorConfig(
    inputs: GeneratorConfigInputs,
    audio: File | null,
    background: File | null,
    task: Task = {},
): Promise<string> {
    checkGeneratorAbort(task.signal);
    const fields = validateInputs(inputs);
    if (!audio) throw new GeneratorError("audio");
    task.progress?.(0);
    const config: GeneratorConfig = {
        format: FORMAT,
        version: VERSION,
        createdAt: new Date().toISOString(),
        inputs: fields,
        audio: await encodeFile(audio, false, {
            signal: task.signal,
            progress: (p) => task.progress?.(p * (background ? 0.8 : 1)),
        }),
        background: background
            ? await encodeFile(background, true, {
                  signal: task.signal,
                  progress: (p) => task.progress?.(0.8 + p * 0.2),
              })
            : null,
    };
    checkGeneratorAbort(task.signal);
    const json = JSON.stringify(config, null, 2);
    // Base64 is ASCII and the 64 KiB allowance exceeds all bounded UTF-8
    // metadata. Do not allocate a second ~80 MB Blob just to measure it.
    if (json.length > GENERATOR_MAX_CONFIG_BYTES)
        throw new GeneratorError("configSize");
    checkGeneratorAbort(task.signal);
    task.progress?.(1);
    checkGeneratorAbort(task.signal);
    return json;
}

export async function parseGeneratorConfig(
    text: string,
    task: Task = {},
): Promise<RestoredGeneratorConfig> {
    checkGeneratorAbort(task.signal);
    if (text.length > GENERATOR_MAX_CONFIG_BYTES)
        throw new GeneratorError("configSize");
    let parsed: Record<string, unknown>;
    try {
        parsed = record(JSON.parse(text));
    } catch {
        throw new GeneratorError("config");
    }
    if (
        parsed.format !== FORMAT ||
        (parsed.version !== VERSION && parsed.version !== 1) ||
        typeof parsed.createdAt !== "string" ||
        parsed.createdAt.length > 64 ||
        !Number.isFinite(Date.parse(parsed.createdAt))
    )
        throw new GeneratorError("config");
    const inputs = validateInputs(parsed.inputs, parsed.version === 1);
    const audio = validateMedia(parsed.audio, false);
    const background =
        parsed.background === null
            ? null
            : validateMedia(parsed.background, true);
    // Validate both resources first; a bad background must not partly replace
    // the caller's current audio or other form fields.
    task.progress?.(0);
    const restoredAudio = await restoreFile(audio, {
        signal: task.signal,
        progress: (p) => task.progress?.(p * (background ? 0.8 : 1)),
    });
    const restoredBackground = background
        ? await restoreFile(background, {
              signal: task.signal,
              progress: (p) => task.progress?.(0.8 + p * 0.2),
          })
        : null;
    checkGeneratorAbort(task.signal);
    task.progress?.(1);
    checkGeneratorAbort(task.signal);
    return { inputs, audio: restoredAudio, background: restoredBackground };
}

export async function readGeneratorConfigFile(file: File, task: Task = {}) {
    checkGeneratorAbort(task.signal);
    if (file.size > GENERATOR_MAX_CONFIG_BYTES)
        throw new GeneratorError("configSize");
    return parseGeneratorConfig(await file.text(), task);
}

export function generatorConfigFileName(
    title: string,
    audioName: string,
): string {
    const base = (title.trim() || audioName.replace(/\.[^.]+$/, "") || "nowJS")
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
        .replace(/[. ]+$/g, "")
        .slice(0, 80);
    return `${base || "nowJS"}.nowjs-generator.json`;
}
