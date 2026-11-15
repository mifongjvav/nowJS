import { readStorage, writeStorage } from "./storage.ts";

const STORAGE_KEY = "nowjs-mania-hold-tails";

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
