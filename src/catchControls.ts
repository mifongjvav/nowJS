import { readStorage, writeStorage } from "./storage.ts";
import type { CatchAction } from "./catchMovement.ts";

export interface CatchControls {
    mode: "keyboard" | "pointer";
    left: string;
    right: string;
    dash: string;
}
const STORAGE_KEY = "nowjs-catch-controls";
const defaults: CatchControls = {
    mode: "keyboard",
    left: "KeyA",
    right: "KeyS",
    dash: "KeyD",
};
let controls = { ...defaults };
const listeners = new Set<() => void>();
export function isCatchBinding(code: string) {
    return /^(Key[A-Z]|Digit[0-9]|Arrow(Left|Right|Up|Down)|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Space|Numpad[0-9])$/.test(
        code,
    );
}
try {
    const stored = JSON.parse(readStorage(STORAGE_KEY) || "null");
    if (stored && ["keyboard", "pointer"].includes(stored.mode)) {
        const keys = [stored.left, stored.right, stored.dash];
        if (
            keys.every(
                (key) => typeof key === "string" && isCatchBinding(key),
            ) &&
            new Set(keys).size === 3
        )
            controls = {
                ...defaults,
                mode: stored.mode,
                left: stored.left,
                right: stored.right,
                dash: stored.dash,
            };
    }
} catch {
    /* Ignore invalid or unavailable storage. */
}
export function getCatchControls(): Readonly<CatchControls> {
    return controls;
}
export function setCatchControlMode(mode: CatchControls["mode"]) {
    if (mode !== "keyboard" && mode !== "pointer") return;
    controls = { ...controls, mode };
    save();
}
export function setCatchBinding(action: CatchAction, code: string) {
    if (!isCatchBinding(code)) return false;
    const next = { ...controls };
    // Swapping duplicate bindings keeps all three actions reachable.
    for (const other of ["left", "right", "dash"] as const) {
        if (other !== action && next[other] === code)
            next[other] = controls[action];
    }
    next[action] = code;
    controls = next;
    save();
    return true;
}
export function resetCatchControls() {
    controls = { ...defaults };
    save();
}
export function onCatchControlsChange(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
export function catchKeyLabel(code: string) {
    return code
        .replace(/^Key|^Digit/, "")
        .replace("ArrowLeft", "←")
        .replace("ArrowRight", "→");
}
function save() {
    writeStorage(STORAGE_KEY, JSON.stringify(controls));
    for (const listener of listeners) listener();
}
