import * as PIXI from "./vendor/pixi.js";
import type {
    StoryboardCommand,
    StoryboardData,
    StoryboardSprite,
    StoryboardTrigger,
} from "./domain.ts";

const STORYBOARD_HEIGHT = 480;
const ORIGIN_ANCHORS = {
    TopLeft: [0, 0],
    TopCentre: [0.5, 0],
    TopRight: [1, 0],
    CentreLeft: [0, 0.5],
    Centre: [0.5, 0.5],
    CentreRight: [1, 0.5],
    BottomLeft: [0, 1],
    BottomCentre: [0.5, 1],
    BottomRight: [1, 1],
};

const LAYER_INDEX = {
    Background: 0,
    Fail: 1,
    Pass: 2,
    Foreground: 3,
    Overlay: 4,
};

// Legacy storyboards store layers/origins as numeric ids.
const LEGACY_LAYERS = [
    "Background",
    "Fail",
    "Pass",
    "Foreground",
    "Overlay",
    "Overlay",
];
const LEGACY_ORIGINS = [
    "TopLeft",
    "Centre",
    "CentreLeft",
    "TopRight",
    "BottomCentre",
    "TopCentre",
    "TopLeft",
    "CentreRight",
    "BottomLeft",
    "BottomRight",
];

function normalizeLayer(value) {
    const text = String(value || "").trim();
    if (/^\d+$/.test(text)) {
        return LEGACY_LAYERS[Number(text)] || "Background";
    }
    return text || "Background";
}

function normalizeOrigin(value) {
    const text = String(value || "").trim();
    if (/^\d+$/.test(text)) {
        return LEGACY_ORIGINS[Number(text)] || "TopLeft";
    }
    return text || "Centre";
}

function getAnimationDelay(value, formatVersion) {
    const delay = parseNumber(value, 0);
    if (formatVersion > 0 && formatVersion < 6) {
        // osu-stable converted old animation frame delays this way.
        return Math.round(0.015 * delay) * 1.186 * (1000 / 60);
    }
    return delay;
}

function parseSampleLayer(value) {
    const text = String(value ?? "")
        .trim()
        .toLowerCase();
    if (text === "background") return 0;
    if (text === "fail") return 1;
    if (text === "pass") return 2;
    if (text === "foreground") return 3;
    if (text === "overlay") return 4;

    const layer = Number(text);
    return Number.isInteger(layer) && layer >= 0 && layer <= 5 ? layer : 0;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function parseNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function splitCsv(line) {
    if (!line.includes('"')) {
        const parts = line.split(",");
        for (let i = 0; i < parts.length; i += 1) {
            parts[i] = parts[i].trim();
        }
        return parts;
    }

    const parts = [];
    let start = 0;
    let quoted = false;

    for (let i = 0; i < line.length; i += 1) {
        const character = line[i];
        if (character === '"') {
            quoted = !quoted;
            continue;
        }
        if (character === "," && !quoted) {
            parts.push(line.slice(start, i).replace(/"/g, "").trim());
            start = i + 1;
        }
    }
    parts.push(line.slice(start).replace(/"/g, "").trim());
    return parts;
}

export function normalizeStoryboardPath(
    path: string | null | undefined,
): string {
    return String(path || "")
        .replace(/\\/g, "/")
        .replace(/^\.?\//, "")
        .toLowerCase();
}

export function getAnimationFramePath(
    path: string,
    frameIndex: number,
): string {
    return getAnimationFramePaths(path, frameIndex)[0];
}

export function getAnimationFramePaths(
    path: string,
    frameIndex: number,
): string[] {
    const file = String(path || "");
    const dotIndex = file.lastIndexOf(".");
    if (dotIndex === -1) {
        return [`${file}${frameIndex}`, `${file}-${frameIndex}`];
    }

    const base = file.slice(0, dotIndex);
    const extension = file.slice(dotIndex);
    return [
        `${base}${frameIndex}${extension}`,
        `${base}-${frameIndex}${extension}`,
    ];
}

const VALID_COMMANDS = new Set([
    "F",
    "S",
    "V",
    "M",
    "MX",
    "MY",
    "R",
    "C",
    "P",
    "L",
    "T",
]);

function parseCommand(parts) {
    const type = (parts[0] || "").toUpperCase();
    if (!VALID_COMMANDS.has(type)) return null;

    if (type === "L") {
        return {
            type: "L",
            start: parseNumber(parts[1], 0),
            count: parseNumber(parts[2], 0),
            commands: [],
        };
    }

    if (type === "T") {
        return {
            type: "T",
            trigger: parts[1] || "",
            start: parseNumber(parts[2], 0),
            end: parseNumber(parts[3], 0),
        };
    }

    const start = parseNumber(parts[2], 0);
    const end = parts[3] === "" ? start : parseNumber(parts[3], start);
    return {
        type,
        easing: parseNumber(parts[1], 0),
        start,
        end,
        params: parts.slice(4),
    };
}

interface StoryboardPlayerOptions {
    width?: number;
    height?: number;
    fileUrls?: Map<string, string>;
    backgroundFile?: string;
}

interface InitialSpriteValues {
    alpha: number;
    x: number;
    y: number;
    scale: number;
    vectorX: number;
    vectorY: number;
    rotation: number;
    tint: number;
    additive: boolean;
    flipH: boolean;
    flipV: boolean;
}

interface CommandCandidate {
    command: Exclude<StoryboardCommand, { type: "L" } | { type: "T" }>;
    start: number;
    end: number;
    offset: number;
    order: number;
}

interface ActiveTrigger {
    group: StoryboardTrigger;
    commands: StoryboardCommand[];
    start: number;
    end: number;
}

interface SpriteRecord {
    sprite: PIXI.Sprite;
    data: StoryboardSprite;
    anchorX: number;
    anchorY: number;
    firstCommand: number;
    displayEndTime: number;
    initial: InitialSpriteValues;
    framePaths: string[];
    candidates: CommandCandidate[];
    activeTriggers: ActiveTrigger[];
}

interface TriggerBinding {
    record: SpriteRecord;
    group: StoryboardTrigger;
}

interface OrderReference {
    value: number;
}

export function parseStoryboard(
    text: string,
    formatVersion = 0,
): StoryboardData {
    const sprites = [];
    const samples = [];
    const variables = {};
    let currentSprite = null;
    let loopStack = [];
    let currentTrigger = null;

    const lines = String(text || "").split(/\r?\n/);
    for (const raw of lines) {
        let indent = 0;
        while (indent < raw.length && raw.charCodeAt(indent) <= 32) {
            indent += 1;
        }
        let end = raw.length;
        while (end > indent && raw.charCodeAt(end - 1) <= 32) {
            end -= 1;
        }
        const original = raw.slice(indent, end);
        if (!original || original.startsWith("//")) continue;
        if (original.startsWith("[")) continue;

        if (original.startsWith("$")) {
            const equalIndex = original.indexOf("=");
            if (equalIndex !== -1) {
                variables[original.slice(0, equalIndex)] = original.slice(
                    equalIndex + 1,
                );
            }
            continue;
        }

        const expanded =
            original.indexOf("$") === -1
                ? original
                : original.replace(
                      /\$([A-Za-z0-9_]+)/g,
                      (match, name) => variables[`$${name}`] ?? match,
                  );
        const parts = splitCsv(expanded);
        const type = (parts[0] || "").toUpperCase();

        if (
            type === "SPRITE" ||
            type === "ANIMATION" ||
            type === "4" ||
            type === "6"
        ) {
            const isAnimation = type === "ANIMATION" || type === "6";
            const layer = normalizeLayer(parts[1]);
            const origin = normalizeOrigin(parts[2]);
            const file = parts[3] || "";
            const x = parseNumber(parts[4], 0);
            const y = parseNumber(parts[5], 0);

            currentSprite = {
                layer,
                layerIndex: LAYER_INDEX[layer] ?? 0,
                origin,
                file,
                x,
                y,
                commands: [],
                triggers: [],
                animation: isAnimation
                    ? {
                          frameCount: Math.max(
                              1,
                              Math.round(parseNumber(parts[6], 1)),
                          ),
                          frameDelay: getAnimationDelay(
                              parts[7],
                              formatVersion,
                          ),
                          loopType:
                              (parts[8] || "").toLowerCase() === "looponce"
                                  ? "LoopOnce"
                                  : "LoopForever",
                      }
                    : null,
            };
            sprites.push(currentSprite);
            loopStack = [];
            currentTrigger = null;
            continue;
        }

        if (type === "SAMPLE" || type === "5") {
            const time = parseNumber(parts[1], 0);
            const file = parts[3] || "";
            const volume = parseNumber(parts[4], 100);
            if (file) {
                samples.push({
                    time,
                    file,
                    volume,
                    layer: parseSampleLayer(parts[2]),
                });
            }
            continue;
        }

        if (!currentSprite) continue;

        if (type === "T") {
            const trigger = parseCommand(parts);
            if (trigger && trigger.type === "T") {
                currentTrigger = {
                    indent,
                    group: {
                        trigger: trigger.trigger,
                        start: trigger.start,
                        end: trigger.end,
                        commands: [],
                    },
                };
                currentSprite.triggers.push(currentTrigger.group);
            }
            loopStack = [];
            continue;
        }

        if (currentTrigger) {
            if (indent > currentTrigger.indent) {
                // Nested trigger commands belong to the trigger group.
            } else {
                currentTrigger = null;
                loopStack = [];
            }
        }

        const command = parseCommand(parts);
        if (!command) continue;

        while (
            loopStack.length &&
            loopStack[loopStack.length - 1].indent >= indent
        ) {
            loopStack.pop();
        }

        const rootCommands = currentTrigger
            ? currentTrigger.group.commands
            : currentSprite.commands;
        if (command.type === "L") {
            const parent =
                loopStack.length > 0
                    ? loopStack[loopStack.length - 1].loop.commands
                    : rootCommands;
            parent.push(command);
            loopStack.push({ loop: command, indent });
        } else if (loopStack.length > 0) {
            loopStack[loopStack.length - 1].loop.commands.push(command);
        } else {
            rootCommands.push(command);
        }
    }

    return { sprites, samples };
}

const ELASTIC_CONST = (2 * Math.PI) / 0.3;
const ELASTIC_CONST2 = 0.3 / 4;
const BACK_CONST = 1.70158;
const BACK_CONST2 = BACK_CONST * 1.525;
const BOUNCE_CONST = 1 / 2.75;
const EXPO_OFFSET = 2 ** -10;
const ELASTIC_OFFSET_FULL = 2 ** -11;
const ELASTIC_OFFSET_HALF =
    2 ** -10 * Math.sin((0.5 - ELASTIC_CONST2) * ELASTIC_CONST);
const ELASTIC_OFFSET_QUARTER =
    2 ** -10 * Math.sin((0.25 - ELASTIC_CONST2) * ELASTIC_CONST);
const IN_OUT_ELASTIC_OFFSET =
    2 ** -10 * Math.sin(((1 - ELASTIC_CONST2 * 1.5) * ELASTIC_CONST) / 1.5);

function outBounce(time) {
    if (time < BOUNCE_CONST) {
        return 7.5625 * time * time;
    }
    if (time < 2 * BOUNCE_CONST) {
        time -= 1.5 * BOUNCE_CONST;
        return 7.5625 * time * time + 0.75;
    }
    if (time < 2.5 * BOUNCE_CONST) {
        time -= 2.25 * BOUNCE_CONST;
        return 7.5625 * time * time + 0.9375;
    }
    time -= 2.625 * BOUNCE_CONST;
    return 7.5625 * time * time + 0.984375;
}

function ease(easing, value) {
    let time = clamp(value, 0, 1);

    switch (easing) {
        case 1:
        case 4:
            return time * (2 - time);
        case 2:
        case 3:
            return time * time;
        case 5:
            if (time < 0.5) return time * time * 2;
            time -= 1;
            return time * time * -2 + 1;
        case 6:
            return time * time * time;
        case 7:
            time -= 1;
            return time * time * time + 1;
        case 8:
            if (time < 0.5) return time * time * time * 4;
            time -= 1;
            return time * time * time * 4 + 1;
        case 9:
            return time ** 4;
        case 10:
            time -= 1;
            return 1 - time ** 4;
        case 11:
            if (time < 0.5) return time ** 4 * 8;
            time -= 1;
            return time ** 4 * -8 + 1;
        case 12:
            return time ** 5;
        case 13:
            time -= 1;
            return time ** 5 + 1;
        case 14:
            if (time < 0.5) return time ** 5 * 16;
            time -= 1;
            return time ** 5 * 16 + 1;
        case 15:
            return 1 - Math.cos((time * Math.PI) / 2);
        case 16:
            return Math.sin((time * Math.PI) / 2);
        case 17:
            return 0.5 - 0.5 * Math.cos(Math.PI * time);
        case 18:
            return 2 ** (10 * (time - 1)) + EXPO_OFFSET * (time - 1);
        case 19:
            return -(2 ** (-10 * time)) + 1 + EXPO_OFFSET * time;
        case 20:
            if (time < 0.5) {
                return (
                    0.5 * (2 ** (20 * time - 10) + EXPO_OFFSET * (2 * time - 1))
                );
            }
            return (
                1 -
                0.5 * (2 ** (-20 * time + 10) + EXPO_OFFSET * (-2 * time + 1))
            );
        case 21:
            return 1 - Math.sqrt(1 - time * time);
        case 22:
            time -= 1;
            return Math.sqrt(1 - time * time);
        case 23:
            time *= 2;
            if (time < 1) {
                return 0.5 - 0.5 * Math.sqrt(1 - time * time);
            }
            time -= 2;
            return 0.5 * Math.sqrt(1 - time * time) + 0.5;
        case 24:
            return (
                -(2 ** (-10 + 10 * time)) *
                    Math.sin((1 - ELASTIC_CONST2 - time) * ELASTIC_CONST) +
                ELASTIC_OFFSET_FULL * (1 - time)
            );
        case 25:
            return (
                2 ** (-10 * time) *
                    Math.sin((time - ELASTIC_CONST2) * ELASTIC_CONST) +
                1 -
                ELASTIC_OFFSET_FULL * time
            );
        case 26:
            return (
                2 ** (-10 * time) *
                    Math.sin((0.5 * time - ELASTIC_CONST2) * ELASTIC_CONST) +
                1 -
                ELASTIC_OFFSET_HALF * time
            );
        case 27:
            return (
                2 ** (-10 * time) *
                    Math.sin((0.25 * time - ELASTIC_CONST2) * ELASTIC_CONST) +
                1 -
                ELASTIC_OFFSET_QUARTER * time
            );
        case 28:
            time *= 2;
            if (time < 1) {
                return (
                    -0.5 *
                    (2 ** (-10 + 10 * time) *
                        Math.sin(
                            ((1 - ELASTIC_CONST2 * 1.5 - time) *
                                ELASTIC_CONST) /
                                1.5,
                        ) -
                        IN_OUT_ELASTIC_OFFSET * (1 - time))
                );
            }
            time -= 1;
            return (
                0.5 *
                    (2 ** (-10 * time) *
                        Math.sin(
                            ((time - ELASTIC_CONST2 * 1.5) * ELASTIC_CONST) /
                                1.5,
                        ) -
                        IN_OUT_ELASTIC_OFFSET * time) +
                1
            );
        case 29:
            return time * time * ((BACK_CONST + 1) * time - BACK_CONST);
        case 30:
            time -= 1;
            return time * time * ((BACK_CONST + 1) * time + BACK_CONST) + 1;
        case 31:
            time *= 2;
            if (time < 1) {
                return (
                    0.5 * time * time * ((BACK_CONST2 + 1) * time - BACK_CONST2)
                );
            }
            time -= 2;
            return (
                0.5 *
                (time * time * ((BACK_CONST2 + 1) * time + BACK_CONST2) + 2)
            );
        case 32:
            return 1 - outBounce(1 - time);
        case 33:
            return outBounce(time);
        case 34:
            if (time < 0.5) {
                return 0.5 - 0.5 * outBounce(1 - time * 2);
            }
            return outBounce((time - 0.5) * 2) * 0.5 + 0.5;
        default:
            return time;
    }
}

const COMMAND_PARAM_COUNTS = {
    F: 1,
    S: 1,
    V: 2,
    M: 2,
    MX: 1,
    MY: 1,
    R: 1,
    C: 3,
};

const COMMAND_DEFAULTS = {
    F: 1,
    S: 1,
    V: 1,
    C: 255,
};

function commandValue(command, time) {
    const params = command.params || [];

    // P (flip / additive) takes a single non-numeric flag, never interpolate it.
    if (command.type === "P") {
        return params.map((value) => String(value).toUpperCase());
    }

    const count = COMMAND_PARAM_COUNTS[command.type] || 1;
    const fallback = COMMAND_DEFAULTS[command.type] ?? 0;
    const start = Array.from({ length: count }, (_, index) =>
        parseNumber(params[index], fallback),
    );

    if (command.end <= command.start) {
        return start;
    }

    const end = Array.from({ length: count }, (_, index) =>
        parseNumber(
            params.length >= count * 2 ? params[count + index] : params[index],
            start[index],
        ),
    );
    const progress = ease(
        command.easing,
        (time - command.start) / (command.end - command.start),
    );

    return start.map((value, index) => {
        const next = value + (end[index] - value) * progress;
        return command.type === "C" ? Math.round(next) : next;
    });
}

function collectCandidates(
    commands: StoryboardCommand[],
    time: number,
    offset: number,
    orderRef: OrderReference,
    output: CommandCandidate[],
): void {
    for (const command of commands) {
        if (command.type === "T") continue;

        if (command.type === "L") {
            const nested = command.commands;
            if (!nested.length) continue;

            let duration = 0;
            for (const child of nested) {
                if (child.type !== "L" && child.type !== "T") {
                    duration = Math.max(duration, child.end, child.start);
                }
            }

            if (duration <= 0) {
                collectCandidates(
                    nested,
                    time,
                    offset + command.start,
                    orderRef,
                    output,
                );
                continue;
            }

            const loopStart = offset + command.start;
            if (time < loopStart) continue;

            const elapsed = time - loopStart;
            const iterations = Math.max(1, Math.round(command.count));
            const iteration = Math.min(
                iterations - 1,
                Math.floor(elapsed / duration),
            );
            const nestedOffset = loopStart + iteration * duration;

            collectCandidates(nested, time, nestedOffset, orderRef, output);
            continue;
        }

        const start = offset + command.start;
        if (time < start) continue;

        orderRef.value += 1;
        output.push({
            command,
            start,
            end: offset + Math.max(command.start, command.end),
            offset,
            order: orderRef.value,
        });
    }
}

function resolveParameterFlag(
    candidates: CommandCandidate[],
    time: number,
    flag: string,
    initialValue = false,
): boolean {
    let best = null;

    for (const candidate of candidates) {
        if (candidate.command.type !== "P") continue;
        const params = candidate.command.params || [];
        if (!params.some((value) => String(value).toUpperCase() === flag)) {
            continue;
        }
        if (time < candidate.start) continue;
        if (
            !best ||
            candidate.start > best.start ||
            (candidate.start === best.start && candidate.order > best.order)
        ) {
            best = candidate;
        }
    }

    if (!best) return initialValue;

    // A zero-duration parameter command remains active until another command
    // of the same type overrides it (matching the legacy decoder).
    if (best.start === best.end) return true;
    return time < best.end;
}

function adjustAnchor(anchor, flipped, vectorScale) {
    // osu! keeps the transformed sprite visually anchored when a flip
    // parameter and a negative vector scale are applied independently.
    if (flipped === vectorScale < 0) return anchor;
    if (anchor === 0) return 1;
    if (anchor === 1) return 0;
    return anchor;
}

function latestCandidate(
    candidates: CommandCandidate[],
    types: readonly string[],
): CommandCandidate | null {
    let best = null;
    for (const candidate of candidates) {
        if (!types.includes(candidate.command.type)) continue;
        if (
            !best ||
            candidate.start > best.start ||
            (candidate.start === best.start && candidate.order > best.order)
        ) {
            best = candidate;
        }
    }
    return best;
}

// osu! extends the beatmap only to the end of the first playback of each
// loop (repeated loops may continue far beyond the map and must not stall it).
function commandEndTime(command) {
    if (command.type === "T") return 0;

    if (command.type === "L") {
        return command.start + groupEndTime(command.commands);
    }

    return Math.max(command.start, command.end);
}

function groupEndTime(commands) {
    let end = 0;
    for (const command of commands) {
        end = Math.max(end, commandEndTime(command));
    }
    return end;
}

function commandDisplayEndTime(command) {
    if (command.type === "T") return 0;

    if (command.type === "L") {
        const duration = groupDisplayEndTime(command.commands);
        const iterations = Math.max(1, Math.round(command.count));
        return command.start + duration * iterations;
    }

    return Math.max(command.start, command.end);
}

function groupDisplayEndTime(commands) {
    let end = 0;
    for (const command of commands) {
        end = Math.max(end, commandDisplayEndTime(command));
    }
    return end;
}

export function getStoryboardRange(data: StoryboardData): {
    start: number;
    end: number;
} {
    let start = Infinity;
    let end = 0;

    for (const sprite of data?.sprites || []) {
        const first = firstCommandTime(sprite.commands);
        if (Number.isFinite(first)) {
            start = Math.min(start, first);
        }
        end = Math.max(end, groupEndTime(sprite.commands));
    }

    for (const sample of data?.samples || []) {
        if (!Number.isFinite(sample.time)) continue;
        start = Math.min(start, sample.time);
        end = Math.max(end, sample.time);
    }

    return {
        start: Number.isFinite(start) ? start : 0,
        end,
    };
}

function computeInitialValues(spriteData) {
    const timeline = [];

    const collect = (commands, offset) => {
        for (const command of commands) {
            if (command.type === "T") continue;
            if (command.type === "L") {
                collect(command.commands, offset + command.start);
                continue;
            }
            timeline.push({ command, start: offset + command.start });
        }
    };
    collect(spriteData.commands, 0);
    timeline.sort((a, b) => a.start - b.start);

    const initial = {
        alpha: 1,
        x: spriteData.x,
        y: spriteData.y,
        scale: 1,
        vectorX: 1,
        vectorY: 1,
        rotation: 0,
        tint: 0xffffff,
        flipH: false,
        flipV: false,
        additive: false,
    };
    const seen = new Set();

    for (const { command } of timeline) {
        const params = command.params || [];

        switch (command.type) {
            case "F":
                if (!seen.has("alpha")) {
                    initial.alpha = parseNumber(params[0], 1);
                    seen.add("alpha");
                }
                break;
            case "S":
                if (!seen.has("scale")) {
                    initial.scale = parseNumber(params[0], 1);
                    seen.add("scale");
                }
                break;
            case "V":
                if (!seen.has("vector")) {
                    initial.vectorX = parseNumber(params[0], 1);
                    initial.vectorY = parseNumber(params[1], initial.vectorX);
                    seen.add("vector");
                }
                break;
            case "M":
                if (!seen.has("x")) {
                    initial.x = parseNumber(params[0], initial.x);
                    seen.add("x");
                }
                if (!seen.has("y")) {
                    initial.y = parseNumber(params[1], initial.y);
                    seen.add("y");
                }
                break;
            case "MX":
                if (!seen.has("x")) {
                    initial.x = parseNumber(params[0], initial.x);
                    seen.add("x");
                }
                break;
            case "MY":
                if (!seen.has("y")) {
                    initial.y = parseNumber(params[0], initial.y);
                    seen.add("y");
                }
                break;
            case "R":
                if (!seen.has("rotation")) {
                    initial.rotation = parseNumber(params[0], 0);
                    seen.add("rotation");
                }
                break;
            case "C": {
                if (!seen.has("tint")) {
                    const red = parseNumber(params[0], 255);
                    const green = parseNumber(params[1], 255);
                    const blue = parseNumber(params[2], 255);
                    initial.tint = (red << 16) | (green << 8) | blue;
                    seen.add("tint");
                }
                break;
            }
            case "P": {
                const flags = String(params[0] || "").toUpperCase();
                const zeroDuration = command.start === command.end;

                for (const flag of ["A", "H", "V"]) {
                    if (!flags.includes(flag) || seen.has(`P${flag}`)) {
                        continue;
                    }
                    seen.add(`P${flag}`);
                    if (!zeroDuration) continue;

                    if (flag === "A") initial.additive = true;
                    if (flag === "H") initial.flipH = true;
                    if (flag === "V") initial.flipV = true;
                }
                break;
            }
            default:
                break;
        }
    }

    return initial;
}

function firstCommandTime(commands, offset = 0) {
    let first = Infinity;

    for (const command of commands) {
        if (command.type === "T") continue;
        if (command.type === "L") {
            const nestedFirst = firstCommandTime(command.commands, 0);
            if (nestedFirst !== Infinity) {
                first = Math.min(first, offset + command.start + nestedFirst);
            }
            continue;
        }
        first = Math.min(first, offset + command.start);
    }

    return first;
}

export class StoryboardPlayer {
    readonly width: number;
    readonly height: number;
    readonly fileUrls: Map<string, string>;
    readonly backgroundFile: string;
    readonly worldScale: number;
    readonly offsetX: number;
    readonly backgroundContainer: PIXI.Container;
    readonly failContainer: PIXI.Container;
    readonly passContainer: PIXI.Container;
    readonly foregroundContainer: PIXI.Container;
    readonly overlayContainer: PIXI.Container;
    readonly sprites: SpriteRecord[];
    readonly triggerBindings: TriggerBinding[];
    readonly textures: Map<string, PIXI.Texture>;
    readonly loadingUrls: Set<string>;
    destroyed: boolean;
    lastUpdateTime = 0;

    constructor(data: StoryboardData, options: StoryboardPlayerOptions = {}) {
        this.width = options.width || window.gameWidth || 1280;
        this.height = options.height || window.gameHeight || 720;
        this.fileUrls = options.fileUrls || new Map();
        this.backgroundFile = normalizeStoryboardPath(options.backgroundFile);
        this.worldScale = this.height / STORYBOARD_HEIGHT;

        // Storyboard coordinates always use a 640x480 space whose centre is
        // (320, 240). Widescreen storyboards simply allow coordinates outside
        // 0..640, so the centre must never be shifted.
        this.offsetX = this.width / 2 - 320 * this.worldScale;

        this.backgroundContainer = new PIXI.Container();
        this.failContainer = new PIXI.Container();
        this.passContainer = new PIXI.Container();
        this.foregroundContainer = new PIXI.Container();
        this.overlayContainer = new PIXI.Container();
        this.sprites = [];
        this.triggerBindings = [];
        this.textures = new Map();
        this.loadingUrls = new Set();
        this.destroyed = false;

        for (const spriteData of data?.sprites || []) {
            const framePaths = [];
            if (spriteData.animation) {
                for (
                    let frame = 0;
                    frame < spriteData.animation.frameCount;
                    frame += 1
                ) {
                    const framePath = getAnimationFramePaths(
                        spriteData.file,
                        frame,
                    )
                        .map((path) => normalizeStoryboardPath(path))
                        .find((path) => this.fileUrls.has(path));
                    if (framePath) {
                        framePaths.push(framePath);
                    }
                }
            } else {
                const normalized = normalizeStoryboardPath(spriteData.file);
                if (this.fileUrls.has(normalized)) {
                    framePaths.push(normalized);
                }
            }

            if (!framePaths.length) continue;

            const sprite = new PIXI.Sprite(PIXI.Texture.EMPTY);
            const [anchorX, anchorY] =
                ORIGIN_ANCHORS[spriteData.origin] || ORIGIN_ANCHORS.Centre;
            sprite.anchor.set(anchorX, anchorY);
            sprite.visible = false;

            const firstCommand = firstCommandTime(spriteData.commands);
            const record = {
                sprite,
                data: spriteData,
                anchorX,
                anchorY,
                firstCommand: Number.isFinite(firstCommand)
                    ? firstCommand
                    : Infinity,
                displayEndTime:
                    spriteData.commands.length > 0
                        ? groupDisplayEndTime(spriteData.commands)
                        : -Infinity,
                initial: computeInitialValues(spriteData),
                framePaths,
                candidates: [],
                activeTriggers: [],
            };
            this.sprites.push(record);

            if (spriteData.layerIndex === 0) {
                this.backgroundContainer.addChild(sprite);
            } else if (spriteData.layerIndex === 1) {
                this.failContainer.addChild(sprite);
            } else if (spriteData.layerIndex === 2) {
                this.passContainer.addChild(sprite);
            } else if (spriteData.layerIndex === 3) {
                this.foregroundContainer.addChild(sprite);
            } else {
                this.overlayContainer.addChild(sprite);
            }

            for (const framePath of framePaths) {
                this.loadTexture(
                    framePath,
                    this.fileUrls.get(framePath),
                    sprite,
                );
            }
        }

        this.buildTriggerBindings();
    }

    loadTexture(
        normalized: string,
        url: string | undefined,
        sprite: PIXI.Sprite,
    ): void {
        if (!url) return;
        const existing = this.textures.get(normalized);
        if (existing) {
            if (sprite.texture === PIXI.Texture.EMPTY) {
                sprite.texture = existing;
            }
            return;
        }
        if (this.loadingUrls.has(normalized)) return;

        this.loadingUrls.add(normalized);
        const image = new Image();
        image.decoding = "async";
        image.onload = () => {
            if (this.destroyed) return;
            const texture = PIXI.Texture.from(image);
            this.textures.set(normalized, texture);
            for (const record of this.sprites) {
                if (record.framePaths.includes(normalized)) {
                    this.applyRecordTexture(record);
                }
            }
        };
        image.onerror = () => {
            if (this.destroyed) return;
            console.warn(`Storyboard image failed to load: ${normalized}`);
        };
        image.src = url;
    }

    applyRecordTexture(record: SpriteRecord): void {
        const frames = record.framePaths;
        if (frames.length <= 1) {
            record.sprite.texture =
                this.textures.get(frames[0]) || PIXI.Texture.EMPTY;
            return;
        }

        const animation = record.data.animation;
        const delay = animation?.frameDelay || 0;
        const elapsed = Math.max(
            0,
            (this.lastUpdateTime || 0) - record.firstCommand,
        );
        let frame = delay > 0 ? Math.floor(elapsed / delay) : 0;

        if (animation?.loopType === "LoopOnce") {
            frame = Math.min(frame, frames.length - 1);
        } else {
            frame %= frames.length;
        }

        record.sprite.texture =
            this.textures.get(frames[frame]) ||
            this.textures.get(frames[0]) ||
            PIXI.Texture.EMPTY;
    }

    buildTriggerBindings(): void {
        this.triggerBindings.length = 0;

        for (const record of this.sprites) {
            for (const group of record.data.triggers || []) {
                if (String(group.trigger).toLowerCase() !== "hitsound") {
                    continue;
                }
                this.triggerBindings.push({ record, group });
            }
        }
    }

    trigger(time: number): void {
        if (this.destroyed) return;

        for (const { record, group } of this.triggerBindings) {
            if (time < group.start || time > group.end) continue;

            const duration = groupDisplayEndTime(group.commands);
            if (duration <= 0) continue;

            // Restart the same trigger group on each new hit instead of
            // stacking conflicting alpha/scale command instances.
            for (let i = record.activeTriggers.length - 1; i >= 0; i -= 1) {
                if (record.activeTriggers[i].group === group) {
                    record.activeTriggers.splice(i, 1);
                }
            }

            record.activeTriggers.push({
                group,
                commands: group.commands,
                start: time,
                end: time + duration,
            });
        }
    }

    resetTriggers(): void {
        for (const record of this.sprites) {
            record.activeTriggers.length = 0;
        }
    }

    update(time: number): void {
        this.lastUpdateTime = time;

        for (const record of this.sprites) {
            const { sprite, data } = record;

            if (time < record.firstCommand || time > record.displayEndTime) {
                sprite.visible = false;
                continue;
            }

            record.candidates.length = 0;
            const orderRef = { value: 0 };
            collectCandidates(
                data.commands,
                time,
                0,
                orderRef,
                record.candidates,
            );

            for (let i = record.activeTriggers.length - 1; i >= 0; i -= 1) {
                const active = record.activeTriggers[i];
                if (time > active.end + 1) {
                    record.activeTriggers.splice(i, 1);
                    continue;
                }
                collectCandidates(
                    active.commands,
                    time,
                    active.start,
                    orderRef,
                    record.candidates,
                );
            }

            const fade = latestCandidate(record.candidates, ["F"]);
            let alpha = record.initial.alpha;
            if (fade) {
                const values = commandValue(fade.command, time - fade.offset);
                alpha = clamp(parseNumber(values[0], 1), 0, 1);
            }

            // M affects both axes, MX only X, MY only Y. Resolve each axis
            // independently so later loop channels can override each other.
            const moveX = latestCandidate(record.candidates, ["M", "MX"]);
            const moveY = latestCandidate(record.candidates, ["M", "MY"]);
            let x = record.initial.x;
            let y = record.initial.y;

            if (moveX) {
                const values = commandValue(moveX.command, time - moveX.offset);
                x = values[0] ?? x;
            }
            if (moveY) {
                const values = commandValue(moveY.command, time - moveY.offset);
                y = (moveY.command.type === "M" ? values[1] : values[0]) ?? y;
            }

            // Scale (S) and vector scale (V) are independent timelines and
            // multiply together, matching osu!'s DrawScale * VectorScale.
            const scalarScale = latestCandidate(record.candidates, ["S"]);
            const vectorScale = latestCandidate(record.candidates, ["V"]);
            let scalar = record.initial.scale;
            let vectorX = record.initial.vectorX;
            let vectorY = record.initial.vectorY;

            if (scalarScale) {
                const values = commandValue(
                    scalarScale.command,
                    time - scalarScale.offset,
                );
                scalar = values[0] ?? scalar;
            }
            if (vectorScale) {
                const values = commandValue(
                    vectorScale.command,
                    time - vectorScale.offset,
                );
                vectorX = values[0] ?? vectorX;
                vectorY = values[1] ?? vectorX;
            }
            const scaleX = scalar * vectorX;
            const scaleY = scalar * vectorY;

            const rotate = latestCandidate(record.candidates, ["R"]);
            let rotation = record.initial.rotation;
            if (rotate) {
                const values = commandValue(
                    rotate.command,
                    time - rotate.offset,
                );
                rotation = values[0] ?? rotation;
            }

            const color = latestCandidate(record.candidates, ["C"]);
            let tint = record.initial.tint;
            if (color) {
                const [r, g, b] = commandValue(
                    color.command,
                    time - color.offset,
                );
                tint = (r << 16) | (g << 8) | b;
            }

            const additive = resolveParameterFlag(
                record.candidates,
                time,
                "A",
                record.initial.additive,
            );
            const flipX = resolveParameterFlag(
                record.candidates,
                time,
                "H",
                record.initial.flipH,
            );
            const flipY = resolveParameterFlag(
                record.candidates,
                time,
                "V",
                record.initial.flipV,
            );

            sprite.x = this.offsetX + x * this.worldScale;
            sprite.y = y * this.worldScale;
            sprite.anchor.set(
                adjustAnchor(record.anchorX, flipX, vectorX),
                adjustAnchor(record.anchorY, flipY, vectorY),
            );
            this.applyRecordTexture(record);
            sprite.scale.set(
                scaleX * this.worldScale * (flipX ? -1 : 1),
                scaleY * this.worldScale * (flipY ? -1 : 1),
            );
            sprite.rotation = rotation;
            sprite.alpha = alpha;
            sprite.tint = tint;
            sprite.blendMode = additive ? "add" : "normal";
            sprite.visible =
                sprite.texture !== PIXI.Texture.EMPTY &&
                alpha > 0.001 &&
                Math.abs(scaleX) > 0.0001 &&
                Math.abs(scaleY) > 0.0001;
        }
    }

    destroy(): void {
        this.destroyed = true;
        for (const texture of this.textures.values()) {
            texture.destroy(true);
        }
        this.textures.clear();

        this.backgroundContainer.destroy({ children: true });
        this.failContainer.destroy({ children: true });
        this.passContainer.destroy({ children: true });
        this.foregroundContainer.destroy({ children: true });
        this.overlayContainer.destroy({ children: true });
        this.sprites.length = 0;
    }
}
