import type { PlayMode } from "./domain.ts";

export const GENERATOR_SAMPLE_RATE = 22050;
export const GENERATOR_MAX_SECONDS = 600;
export const GENERATOR_MAX_AUDIO_BYTES = 50 * 1024 * 1024;
export const GENERATOR_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export type GeneratorDensity = "easy" | "normal" | "hard";
export type GeneratorErrorCode =
    | "audio"
    | "audioSize"
    | "image"
    | "imageSize"
    | "decode"
    | "duration"
    | "bpm"
    | "silent"
    | "noNotes"
    | "config"
    | "configSize"
    | "failed";
export class GeneratorError extends Error {
    code: GeneratorErrorCode;
    constructor(code: GeneratorErrorCode) {
        super(code);
        this.name = "GeneratorError";
        this.code = code;
    }
}
export interface AudioFeatureFrame {
    timeMs: number;
    rms: number;
    novelty: number;
    brightness: number;
}
export interface AudioOnset {
    timeMs: number;
    strength: number;
    brightness: number;
}
export interface GeneratorAnalysis {
    bpm: number;
    estimatedBpm: boolean;
    confidence: number;
    offsetMs: number;
    durationMs: number;
    frames: AudioFeatureFrame[];
    onsets: AudioOnset[];
}
export interface GeneratorOptions {
    mode: PlayMode;
    density: GeneratorDensity;
    title: string;
    artist: string;
    bpm?: number;
}
export interface GeneratedBeatmapPack {
    bytes: Uint8Array;
    fileName: string;
    osu: string;
    noteCount: number;
    comboColors: number[];
    objectCounts: GeneratorObjectCounts;
    analysis: Pick<
        GeneratorAnalysis,
        "bpm" | "estimatedBpm" | "confidence" | "durationMs"
    >;
}
export interface GeneratorObjectCounts {
    circles: number;
    sliders: number;
    holds: number;
    bananaShowers: number;
}
export interface GeneratorProgress {
    stage:
        | "decode"
        | "analyze"
        | "pack"
        | "configExportProgress"
        | "configImportProgress";
    value: number;
}
export function checkGeneratorAbort(signal?: AbortSignal) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
}
