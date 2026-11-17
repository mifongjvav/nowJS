import { readStorage, writeStorage } from "./storage.ts";

const STORAGE_KEY = "nowjs-mania-hold-tails";
const RECTANGLE_KEY = "nowjs-mania-rectangles";
let rectangles = readStorage(RECTANGLE_KEY) === "1";
const rectangleListeners = new Set<() => void>();

// osu!mania judges hold-note tails, so keep that behaviour by default while
// letting players opt out.
let enabled = readStorage(STORAGE_KEY) !== "0";

export function isHoldTailJudgementEnabled(): boolean {
    return enabled;
}

export function setHoldTailJudgementEnabled(value: boolean): void {
    enabled = Boolean(value);
    writeStorage(STORAGE_KEY, enabled ? "1" : "0");
}

export function isManiaRectangleEnabled(): boolean {
    return rectangles;
}

export function setManiaRectangleEnabled(value: boolean): void {
    const next = Boolean(value);
    if (next === rectangles) return;
    rectangles = next;
    writeStorage(RECTANGLE_KEY, rectangles ? "1" : "0");
    for (const listener of rectangleListeners) listener();
}

export function onManiaRectangleChange(listener: () => void): () => void {
    rectangleListeners.add(listener);
    return () => rectangleListeners.delete(listener);
}
