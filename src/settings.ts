import { readStorage, writeStorage } from "./storage.ts";

export interface GameSettings {
    storyboard: boolean;
    video: boolean;
    blur: boolean;
    backgroundDim: number;
    backgroundBlur: number;
    dynamicColors: boolean;
    decoupledRendering: boolean;
    multithreading: boolean;
}

const defaults: GameSettings = {
    storyboard: true,
    video: true,
    blur: true,
    backgroundDim: 48,
    backgroundBlur: 10,
    dynamicColors: true,
    decoupledRendering: false,
    multithreading: false,
};
const STORAGE_KEY = "nowjs-settings";
const listeners = new Set<(settings: Readonly<GameSettings>) => void>();
let settings = { ...defaults };

function sanitize(values: Partial<GameSettings>): GameSettings {
    const next = { ...settings };
    for (const key of Object.keys(defaults) as (keyof GameSettings)[]) {
        const value = values[key];
        if (typeof defaults[key] === "boolean") {
            if (typeof value === "boolean")
                Object.assign(next, { [key]: value });
        } else if (typeof value === "number" && Number.isFinite(value)) {
            const max = key === "backgroundBlur" ? 30 : 100;
            Object.assign(next, { [key]: Math.max(0, Math.min(max, value)) });
        }
    }
    if (next.multithreading) next.decoupledRendering = true;
    return next;
}

try {
    const stored = JSON.parse(readStorage(STORAGE_KEY) || "null");
    if (stored && typeof stored === "object") settings = sanitize(stored);
} catch {
    // Invalid or unavailable storage must not prevent startup.
}

export function getSettings(): Readonly<GameSettings> {
    return settings;
}

export function updateSettings(values: Partial<GameSettings>): void {
    const next = sanitize(values);
    const keys = Object.keys(next) as (keyof GameSettings)[];
    if (keys.every((key) => next[key] === settings[key])) return;
    settings = next;
    writeStorage(STORAGE_KEY, JSON.stringify(settings));
    for (const listener of listeners) listener(settings);
}

export function onSettingsChange(
    listener: (settings: Readonly<GameSettings>) => void,
): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
