import { strFromU8, unzipSync } from "./vendor/fflate.js";
import type {
    ArchiveFile,
    ArchivedBeatmap,
    CatchHitSample,
    CatchNote,
    CompiledCatchChart,
    OsuArchive,
    OsuEvents,
    OsuHitObject,
    ParsedBeatmap,
    PlayMode,
    TimingPoint,
} from "./domain.ts";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function splitSections(text: string): {
    header: string;
    sections: Record<string, string[]>;
} {
    const sections: Record<string, string[]> = {};
    let current = null;
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
    const header = lines[0] || "";

    for (let i = 1; i < lines.length; i++) {
        const raw = lines[i];
        const line = raw.trim();
        if (!line || line.startsWith("//")) continue;

        const match = line.match(/^\[(.+)\]$/);
        if (match) {
            current = match[1];
            if (!sections[current]) sections[current] = [];
            continue;
        }

        if (current) sections[current].push(raw);
    }

    return { header, sections };
}

function parseKeyValues(lines: string[] = []): Record<string, string> {
    const values: Record<string, string> = {};
    for (const raw of lines) {
        const line = raw.trim();
        const index = line.indexOf(":");
        if (index === -1) continue;
        const key = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim();
        if (key) values[key] = value;
    }
    return values;
}

function parseNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function splitCsv(line) {
    const parts = [];
    let current = "";
    let quoted = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            quoted = !quoted;
            continue;
        }
        if (char === "," && !quoted) {
            parts.push(current.trim());
            current = "";
        } else {
            current += char;
        }
    }
    parts.push(current.trim());
    return parts;
}

function parseEvents(lines: string[] = []): OsuEvents {
    const events: OsuEvents = {
        background: null,
        video: null,
        videoOffset: 0,
        breaks: [],
        samples: [],
    };

    for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith("//")) continue;
        const parts = splitCsv(line);
        const type = (parts[0] || "").toLowerCase();

        if (type === "0" || type === "background") {
            if (parts[2]) events.background = parts[2].replace(/^"|"$/g, "");
        } else if (type === "1" || type === "video") {
            if (parts[2]) events.video = parts[2].replace(/^"|"$/g, "");
            events.videoOffset = parseNumber(parts[1], 0);
        } else if (type === "2" || type === "break") {
            const start = parseNumber(parts[1]);
            const end = parseNumber(parts[2]);
            if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
                events.breaks.push({ start, end });
            }
        } else if (type === "sample") {
            const time = parseNumber(parts[1], Number.NaN);
            const file = parts[3] || "";
            if (Number.isFinite(time) && file) {
                events.samples.push({
                    time,
                    file,
                    volume: parseNumber(parts[4], 100),
                });
            }
        }
    }

    return events;
}

function parseTimingPoints(lines: string[] = []): TimingPoint[] {
    const timingPoints = [];

    for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith("//")) continue;
        const parts = line.split(",");
        if (parts.length < 2) continue;

        const time = parseNumber(parts[0], Number.NaN);
        const beatLength = parseNumber(parts[1], Number.NaN);
        if (
            !Number.isFinite(time) ||
            !Number.isFinite(beatLength) ||
            beatLength === 0
        ) {
            continue;
        }

        const uninherited =
            parts[6] !== undefined ? Number(parts[6]) === 1 : beatLength > 0;

        timingPoints.push({
            time,
            beatLength,
            uninherited,
            sliderVelocity: uninherited ? 1 : -100 / beatLength,
            meter: parseNumber(parts[2], 4),
            sampleSet: parseNumber(parts[3], 0) | 0,
            sampleIndex: Math.max(0, parseNumber(parts[4], 0) | 0),
            volume: parseNumber(parts[5], 100),
        });
    }

    return timingPoints.sort((a, b) => a.time - b.time);
}

const SAMPLE_SET_NAMES: Record<number, string> = {
    1: "normal",
    2: "soft",
    3: "drum",
};

function normalizeSampleSet(value: unknown): string {
    const name = String(value ?? "")
        .trim()
        .toLowerCase();
    return name === "soft" || name === "drum" || name === "normal"
        ? name
        : "normal";
}

function parseHitSample(value) {
    const parts = String(value || "").split(":");
    return {
        normalSet: parseNumber(parts[0], 0) | 0,
        additionSet: parseNumber(parts[1], 0) | 0,
        index: Math.max(0, parseNumber(parts[2], 0) | 0),
        volume: Math.max(0, parseNumber(parts[3], 0)),
        filename: parts[4] || "",
    };
}

function getTimingSampleInfo(timingPoints, time, defaultSampleSet = "normal") {
    let sampleSet = 0;
    let sampleIndex = 0;
    let volume = 100;

    for (const point of timingPoints) {
        if (point.time > time) break;
        sampleSet = point.sampleSet;
        sampleIndex = point.sampleIndex || 0;
        volume = point.volume;
    }

    return {
        sampleSet: SAMPLE_SET_NAMES[sampleSet] || defaultSampleSet,
        sampleIndex,
        volume,
    };
}

const ADDITION_SOUNDS = [
    { bit: 8, name: "hitclap" },
    { bit: 2, name: "hitwhistle" },
    { bit: 4, name: "hitfinish" },
];

function buildHitSamples(
    hitSound: number,
    normalSet: string,
    additionSet: string,
    sampleIndex: number,
    volume: number,
    filename = "",
): CatchHitSample[] {
    // A custom filename replaces every layer of the object's hitsound.
    if (filename) {
        return [
            {
                bank: "normal",
                name: "hitnormal",
                volume,
                index: sampleIndex > 0 ? sampleIndex : undefined,
                filename,
            },
        ];
    }

    const index = sampleIndex > 0 ? sampleIndex : undefined;
    const samples: CatchHitSample[] = [
        {
            bank: normalSet,
            name: "hitnormal",
            volume,
            index,
        },
    ];

    for (const addition of ADDITION_SOUNDS) {
        if (!(hitSound & addition.bit)) continue;
        samples.push({
            bank: additionSet,
            name: addition.name,
            volume,
            index,
        });
    }

    return samples;
}

function parseEdgeSet(value) {
    const parts = String(value || "").split(":");
    return {
        normalSet: parseNumber(parts[0], 0) | 0,
        additionSet: parseNumber(parts[1], 0) | 0,
    };
}

function buildSliderNodeSamples(
    object: OsuHitObject,
    timingSample: ReturnType<typeof getTimingSampleInfo>,
    nodeIndex: number,
): CatchHitSample[] {
    const edgeSound = object.edgeSounds?.[nodeIndex];
    const edgeSet = object.edgeSets?.[nodeIndex];
    const hitSound = edgeSound ?? object.hitSound;
    const normalSet = edgeSet
        ? SAMPLE_SET_NAMES[edgeSet.normalSet] || timingSample.sampleSet
        : object.sampleSet;
    const additionSet = edgeSet
        ? SAMPLE_SET_NAMES[edgeSet.additionSet] || normalSet
        : object.additionSet;
    const sampleIndex = object.sampleIndex || timingSample.sampleIndex || 0;

    return buildHitSamples(
        hitSound,
        normalSet,
        additionSet,
        sampleIndex,
        object.volume,
        object.sampleFilename,
    );
}

function parseHitObjects(
    lines: string[] = [],
    timingPoints: TimingPoint[] = [],
    defaultSampleSet = "normal",
): OsuHitObject[] {
    const hitObjects: OsuHitObject[] = [];

    for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith("//")) continue;
        const parts = line.split(",");
        if (parts.length < 4) continue;

        const x = parseNumber(parts[0], Number.NaN);
        const y = parseNumber(parts[1], Number.NaN);
        const time = parseNumber(parts[2], Number.NaN);
        const type = parseNumber(parts[3], 0) | 0;
        if (
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            !Number.isFinite(time)
        ) {
            continue;
        }

        const hitSound = parseNumber(parts[4], 0) | 0;
        const hitSampleValue =
            type & 2
                ? parts[10] || ""
                : type & 8 || type & 128
                  ? parts[6] || ""
                  : parts[5] || "";
        const hitSample = parseHitSample(hitSampleValue);
        const timingSample = getTimingSampleInfo(
            timingPoints,
            time,
            defaultSampleSet,
        );
        const sampleSet =
            SAMPLE_SET_NAMES[hitSample.normalSet] || timingSample.sampleSet;
        const additionSet =
            SAMPLE_SET_NAMES[hitSample.additionSet] || sampleSet;
        const sampleIndex = hitSample.index || timingSample.sampleIndex || 0;
        const volume =
            hitSample.volume > 0 ? hitSample.volume : timingSample.volume;
        const object: OsuHitObject = {
            x,
            y,
            time,
            type,
            hitSound,
            sampleSet,
            additionSet,
            sampleIndex,
            sampleFilename: hitSample.filename,
            volume,
            samples: buildHitSamples(
                hitSound,
                sampleSet,
                additionSet,
                sampleIndex,
                volume,
                hitSample.filename,
            ),
        };

        if (type & 2) {
            const curve = parts[5] || "L";
            const curveParts = curve.split("|");
            object.curveType = (curveParts[0] || "L").toUpperCase();
            object.curvePoints = curveParts
                .slice(1)
                .map((point) => {
                    const [px, py] = point.split(":").map(Number);
                    return { x: px, y: py };
                })
                .filter(
                    (point) =>
                        Number.isFinite(point.x) && Number.isFinite(point.y),
                );
            object.slides = clamp(Math.round(parseNumber(parts[6], 1)), 1, 16);
            object.length = Math.max(0, parseNumber(parts[7], 0));
            object.edgeSounds = (parts[8] || "")
                .split("|")
                .filter((value) => value !== "")
                .map((value) => parseNumber(value, object.hitSound) | 0);
            object.edgeSets = (parts[9] || "")
                .split("|")
                .filter((value) => value !== "")
                .map(parseEdgeSet);
            object.nodeSamples = Array.from(
                { length: object.slides + 1 },
                (_, nodeIndex) =>
                    buildSliderNodeSamples(object, timingSample, nodeIndex),
            );
        } else if (type & 8) {
            object.endTime = Math.max(time, parseNumber(parts[5], time));
        } else if (type & 128) {
            // osu!mania hold note: x,y,time,type,hitSound,endTime,hitSample
            object.endTime = Math.max(time, parseNumber(parts[5], time));
        }

        hitObjects.push(object);
    }

    return hitObjects.sort((a, b) => a.time - b.time);
}

export function parseOsu(text: string): ParsedBeatmap {
    const { header, sections } = splitSections(text);
    const general = parseKeyValues(sections.General);
    const metadata = parseKeyValues(sections.Metadata);
    const difficulty = parseKeyValues(sections.Difficulty);
    const defaultSampleSet = normalizeSampleSet(general.SampleSet);
    const timingPoints = parseTimingPoints(sections.TimingPoints);
    const hitObjects = parseHitObjects(
        sections.HitObjects,
        timingPoints,
        defaultSampleSet,
    );
    const versionMatch = header.match(/osu file format v(\d+)/i);

    return {
        formatVersion: versionMatch ? Number(versionMatch[1]) : 14,
        general: {
            audioFilename: general.AudioFilename || "",
            previewTime: parseNumber(general.PreviewTime, -1),
            mode: parseNumber(general.Mode, 0),
            sampleSet: defaultSampleSet,
            widescreenStoryboard: general.WidescreenStoryboard === "1",
        },
        metadata: {
            title: metadata.Title || "",
            titleUnicode: metadata.TitleUnicode || metadata.Title || "",
            artist: metadata.Artist || "",
            artistUnicode: metadata.ArtistUnicode || metadata.Artist || "",
            creator: metadata.Creator || "",
            version: metadata.Version || "",
            source: metadata.Source || "",
            tags: metadata.Tags || "",
        },
        difficulty: {
            hp: parseNumber(difficulty.HPDrainRate, 5),
            circleSize: parseNumber(difficulty.CircleSize, 4),
            overallDifficulty: parseNumber(difficulty.OverallDifficulty, 8),
            approachRate: parseNumber(
                difficulty.ApproachRate,
                parseNumber(difficulty.OverallDifficulty, 8),
            ),
            sliderMultiplier: parseNumber(difficulty.SliderMultiplier, 1.4),
            sliderTickRate: parseNumber(difficulty.SliderTickRate, 1),
        },
        events: parseEvents(sections.Events),
        eventsRaw: sections.Events || [],
        variablesRaw: sections.Variables || [],
        timingPoints,
        hitObjects,
    };
}

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function samePoint(a, b) {
    return Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
}

function deCasteljau(points, t) {
    let current = points.map((point) => ({ x: point.x, y: point.y }));
    while (current.length > 1) {
        const next = [];
        for (let i = 0; i < current.length - 1; i++) {
            next.push({
                x: current[i].x + (current[i + 1].x - current[i].x) * t,
                y: current[i].y + (current[i + 1].y - current[i].y) * t,
            });
        }
        current = next;
    }
    return current[0];
}

function bezierPath(anchors) {
    const segments = [];
    let current = [anchors[0]];

    for (let i = 1; i < anchors.length; i++) {
        if (samePoint(anchors[i], anchors[i - 1])) {
            if (current.length > 1) segments.push(current);
            current = [anchors[i]];
        } else {
            current.push(anchors[i]);
        }
    }
    if (current.length > 1) segments.push(current);

    const samples = [];
    for (const segment of segments) {
        const steps = Math.max(14, (segment.length - 1) * 18);
        for (let step = 0; step <= steps; step++) {
            const point = deCasteljau(segment, step / steps);
            if (
                !samples.length ||
                !samePoint(samples[samples.length - 1], point)
            ) {
                samples.push(point);
            }
        }
    }

    return samples.length ? samples : [anchors[0]];
}

function catmullPath(anchors) {
    if (anchors.length < 3) return anchors.slice();

    const samples = [anchors[0]];
    const steps = 18;

    for (let i = 0; i < anchors.length - 1; i++) {
        const p0 = anchors[Math.max(0, i - 1)];
        const p1 = anchors[i];
        const p2 = anchors[i + 1];
        const p3 = anchors[Math.min(anchors.length - 1, i + 2)];

        for (let step = 1; step <= steps; step++) {
            const t = step / steps;
            const t2 = t * t;
            const t3 = t2 * t;
            samples.push({
                x:
                    0.5 *
                    (2 * p1.x +
                        (-p0.x + p2.x) * t +
                        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
                        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
                y:
                    0.5 *
                    (2 * p1.y +
                        (-p0.y + p2.y) * t +
                        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
                        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
            });
        }
    }

    return samples;
}

function normalizeAngle(angle) {
    let value = angle;
    while (value > Math.PI * 2) value -= Math.PI * 2;
    while (value < 0) value += Math.PI * 2;
    return value;
}

function arcPath(anchors) {
    if (anchors.length !== 3) return bezierPath(anchors);

    const [a, b, c] = anchors;
    const determinant =
        2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
    if (Math.abs(determinant) < 1e-6) return bezierPath(anchors);

    const aSq = a.x * a.x + a.y * a.y;
    const bSq = b.x * b.x + b.y * b.y;
    const cSq = c.x * c.x + c.y * c.y;

    const center = {
        x:
            (aSq * (b.y - c.y) + bSq * (c.y - a.y) + cSq * (a.y - b.y)) /
            determinant,
        y:
            (aSq * (c.x - b.x) + bSq * (a.x - c.x) + cSq * (b.x - a.x)) /
            determinant,
    };
    const radius = distance(center, a);

    const start = Math.atan2(a.y - center.y, a.x - center.x);
    const mid = Math.atan2(b.y - center.y, b.x - center.x);
    const end = Math.atan2(c.y - center.y, c.x - center.x);

    const ccwSweep = normalizeAngle(end - start);
    const midSweep = normalizeAngle(mid - start);
    const sweep = midSweep <= ccwSweep ? ccwSweep : ccwSweep - Math.PI * 2;

    const steps = Math.max(
        18,
        Math.ceil((Math.abs(sweep) / (Math.PI * 2)) * 56),
    );
    const samples = [];
    for (let step = 0; step <= steps; step++) {
        const angle = start + (sweep * step) / steps;
        samples.push({
            x: center.x + Math.cos(angle) * radius,
            y: center.y + Math.sin(angle) * radius,
        });
    }
    return samples;
}

function withLengths(points) {
    if (!points.length) return { points: [], total: 0 };

    const result = [{ ...points[0], len: 0 }];
    let total = 0;

    for (let i = 1; i < points.length; i++) {
        const segmentLength = distance(points[i - 1], points[i]);
        if (segmentLength < 1e-5) continue;
        total += segmentLength;
        result.push({ ...points[i], len: total });
    }

    return { points: result, total };
}

function buildSliderPath(start, curveType, controlPoints) {
    const anchors = [start, ...(controlPoints || [])];
    let samples;

    if (anchors.length === 1) {
        samples = [start];
    } else if (curveType === "L") {
        samples = anchors.slice();
    } else if (curveType === "P") {
        samples = arcPath(anchors);
    } else if (curveType === "C") {
        samples = catmullPath(anchors);
    } else {
        samples = bezierPath(anchors);
    }

    if (!samples.length) samples = [start];
    return withLengths(samples);
}

function pointAtLength(path, length) {
    const points = path.points;
    if (!points.length) return { x: 0, y: 0 };
    if (points.length === 1) return { x: points[0].x, y: points[0].y };

    if (length <= 0) {
        const first = points[0];
        const second = points[1];
        const segmentLength = distance(first, second) || 1;
        return {
            x: first.x + ((first.x - second.x) / segmentLength) * -length,
            y: first.y + ((first.y - second.y) / segmentLength) * -length,
        };
    }

    if (length >= path.total) {
        const last = points[points.length - 1];
        const before = points[points.length - 2];
        const segmentLength = distance(before, last) || 1;
        return {
            x:
                last.x +
                ((last.x - before.x) / segmentLength) * (length - path.total),
            y:
                last.y +
                ((last.y - before.y) / segmentLength) * (length - path.total),
        };
    }

    let low = 0;
    let high = points.length - 1;
    while (low + 1 < high) {
        const middle = (low + high) >> 1;
        if (points[middle].len <= length) low = middle;
        else high = middle;
    }

    const first = points[low];
    const second = points[high];
    const segmentLength = second.len - first.len || 1;
    const t = (length - first.len) / segmentLength;
    return {
        x: first.x + (second.x - first.x) * t,
        y: first.y + (second.y - first.y) * t,
    };
}

function getTimingAt(timingPoints, time) {
    let beatLength = 500;
    let sliderVelocity = 1;

    for (const point of timingPoints) {
        if (point.time > time) break;
        if (point.uninherited) {
            beatLength = point.beatLength;
            sliderVelocity = 1;
        } else {
            sliderVelocity = point.sliderVelocity;
        }
    }

    return { beatLength, sliderVelocity };
}

function getBpm(timingPoints) {
    const first = timingPoints.find(
        (point) => point.uninherited && point.beatLength > 0,
    );
    if (!first) return 0;
    return 60000 / first.beatLength;
}

function createSeededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

function addBananaNotes(object, notes, random) {
    const startTime = Math.trunc(object.time);
    const endTime = Math.trunc(object.endTime ?? object.time);
    let spacing = endTime - startTime;

    // Match osu!'s banana shower spacing: halve the duration until it is <= 100ms.
    while (spacing > 100) {
        spacing /= 2;
    }

    if (spacing <= 0) return;

    for (let time = startTime; time <= endTime; time += spacing) {
        const x = random() * 512;
        // osu!stable also consumes random values for type, rotation and colour.
        random();
        random();
        random();
        notes.push({ time, x, type: "banana", scale: 1.15, samples: [] });
    }
}

function getDropletSamples(samples: CatchHitSample[]): CatchHitSample[] {
    const base = samples.find((sample) => sample.name === "hitnormal");
    if (!base) return [];
    return [
        {
            ...base,
            name: "slidertick",
            volume: Math.round(base.volume * 0.65),
        },
    ];
}

function addSliderNotes(object, beatmap, notes) {
    const { beatLength, sliderVelocity } = getTimingAt(
        beatmap.timingPoints,
        object.time,
    );
    const sliderMultiplier = beatmap.difficulty.sliderMultiplier || 1.4;
    const pixelsPerBeat = 100 * sliderMultiplier * sliderVelocity;
    const length = object.length;
    const nodeSamples = object.nodeSamples?.length
        ? object.nodeSamples
        : [object.samples];
    const dropletSamples = getDropletSamples(nodeSamples[0] || []);

    if (length <= 1 || pixelsPerBeat <= 0 || beatLength <= 0) {
        notes.push({
            time: object.time,
            x: object.x,
            type: "fruit",
            scale: 1,
            samples: nodeSamples[0] || [],
        });
        return;
    }

    const slideDuration = (length / pixelsPerBeat) * beatLength;
    if (!Number.isFinite(slideDuration) || slideDuration <= 0) {
        notes.push({
            time: object.time,
            x: object.x,
            type: "fruit",
            scale: 1,
            samples: nodeSamples[0] || [],
        });
        return;
    }

    const path = buildSliderPath(
        { x: object.x, y: object.y },
        object.curveType,
        object.curvePoints,
    );
    const endPoint = pointAtLength(path, length);

    notes.push({
        time: object.time,
        x: object.x,
        type: "fruit",
        scale: 1,
        samples: nodeSamples[0] || [],
    });

    for (let slide = 0; slide < object.slides; slide++) {
        const forward = slide % 2 === 0;
        const segmentStart = object.time + slide * slideDuration;
        const tickCount = clamp(Math.round(slideDuration / 110), 1, 10);

        for (let tick = 1; tick <= tickCount; tick++) {
            const fraction = tick / (tickCount + 1);
            const distanceAlong = forward
                ? fraction * length
                : (1 - fraction) * length;
            const point = pointAtLength(path, distanceAlong);
            notes.push({
                time: segmentStart + fraction * slideDuration,
                x: point.x,
                type: "droplet",
                scale: 0.58,
                samples: dropletSamples,
            });
        }

        notes.push({
            time: segmentStart + slideDuration,
            x: forward ? endPoint.x : object.x,
            type: "fruit",
            scale: 0.92,
            samples: nodeSamples[slide + 1] || nodeSamples[0] || [],
        });
    }
}

export function compileCatchChart(beatmap: ParsedBeatmap): CompiledCatchChart {
    const notes: CatchNote[] = [];
    const bananaRandom = createSeededRandom(1337);

    for (const object of beatmap.hitObjects) {
        if ((object.type & 1) !== 0 || (object.type & 128) !== 0) {
            notes.push({
                time: object.time,
                x: object.x,
                type: "fruit",
                scale: 1,
                samples: object.samples,
            });
        } else if (object.type & 2) {
            addSliderNotes(object, beatmap, notes);
        } else if (object.type & 8) {
            addBananaNotes(object, notes, bananaRandom);
        }
    }

    notes.sort((a, b) => a.time - b.time || a.x - b.x);

    const unique = [];
    for (const note of notes) {
        if (note.time < 0) continue;
        const previous = unique[unique.length - 1];
        if (
            previous &&
            Math.abs(previous.time - note.time) < 1 &&
            Math.abs(previous.x - note.x) < 1 &&
            previous.type === note.type
        ) {
            continue;
        }
        unique.push({
            time: Math.max(0, note.time),
            x: clamp(note.x, 0, 512),
            type: note.type,
            scale: note.scale,
            samples: note.samples || [],
        });
    }

    const firstNoteTime = unique.length ? unique[0].time : 0;
    const lastNoteTime = unique.length ? unique[unique.length - 1].time : 0;
    const approachRate = beatmap.difficulty.approachRate;
    const preemptMs = clamp(2000 - (approachRate - 5) * 70, 1300, 2150);

    return {
        notes: unique,
        firstNoteTime,
        lastNoteTime,
        bpm: Math.round(getBpm(beatmap.timingPoints)),
        preemptMs,
        objectCount: beatmap.hitObjects.length,
        lengthMs: Math.max(0, lastNoteTime - firstNoteTime),
        metadata: beatmap.metadata,
        difficulty: beatmap.difficulty,
        mode: beatmap.general.mode,
        playMode: "catch",
        mania: null,
        sourceKeys:
            beatmap.general.mode === 3 ? getManiaSourceKeys(beatmap) : null,
    };
}

const MANIA_LANE_COUNT = 4;
const MANIA_KEY_LABELS = ["D", "F", "J", "K"];
const MANIA_CHORD_TOLERANCE_MS = 1;

function getManiaSourceKeys(beatmap: ParsedBeatmap): number {
    // The key count of a mania beatmap is stored in CircleSize.
    return clamp(Math.round(beatmap.difficulty.circleSize) || 4, 1, 18);
}

function mapManiaColumn(column: number, sourceKeys: number): number {
    if (sourceKeys <= MANIA_LANE_COUNT) {
        // Center narrower layouts in the 4K playfield.
        const offset = Math.round((MANIA_LANE_COUNT - sourceKeys) / 2);
        return clamp(column + offset, 0, MANIA_LANE_COUNT - 1);
    }

    // Preserve the horizontal position of each source column and snap it to
    // the nearest 4K lane. This keeps chords and hand balance recognizable.
    const position = ((column + 0.5) / sourceKeys) * MANIA_LANE_COUNT;
    return clamp(Math.round(position - 0.5), 0, MANIA_LANE_COUNT - 1);
}

interface ManiaCandidate {
    note: CatchNote;
    targetLane: number;
}

function resolveManiaChord(candidates: ManiaCandidate[]): CatchNote[] {
    const used = new Set<number>();
    const notes: CatchNote[] = [];

    for (const candidate of candidates) {
        let lane = candidate.targetLane;

        if (used.has(lane)) {
            // A wider key mode can collapse several columns onto one 4K lane.
            // Move the extra note to the nearest free lane so simultaneous
            // chords stay playable. More than four notes at once cannot be
            // represented in 4K; the extra objects are folded away.
            let bestLane = -1;
            let bestDistance = Infinity;
            for (let index = 0; index < MANIA_LANE_COUNT; index++) {
                if (used.has(index)) continue;
                const distance = Math.abs(index - lane);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestLane = index;
                }
            }
            if (bestLane === -1) continue;
            lane = bestLane;
        }

        used.add(lane);
        notes.push({
            ...candidate.note,
            x: (lane + 0.5) * (512 / MANIA_LANE_COUNT),
            lane,
        });
    }

    return notes;
}

function createManiaChordCollector() {
    const notes: CatchNote[] = [];
    let candidates: ManiaCandidate[] = [];
    let chordStart = Number.NaN;

    const flush = () => {
        if (!candidates.length) return;
        notes.push(...resolveManiaChord(candidates));
        candidates = [];
    };

    return {
        push(note: CatchNote, targetLane: number): void {
            if (
                Number.isNaN(chordStart) ||
                note.time - chordStart > MANIA_CHORD_TOLERANCE_MS
            ) {
                flush();
                chordStart = note.time;
            }
            candidates.push({ note, targetLane });
        },
        finish(): CatchNote[] {
            flush();
            return notes;
        },
    };
}

function compileManiaChart(
    beatmap: ParsedBeatmap,
    catchChart?: CompiledCatchChart,
): CompiledCatchChart {
    const sourceKeys =
        beatmap.general.mode === 3 ? getManiaSourceKeys(beatmap) : null;
    const collector = createManiaChordCollector();

    if (sourceKeys !== null) {
        for (const object of beatmap.hitObjects) {
            const isHold = Boolean(object.type & 128);
            const isCircle = Boolean(object.type & 1);
            if (!isHold && !isCircle) continue;

            // osu!mania column formula from the .osu file format
            // documentation: floor(x * keyCount / 512), clamped to the valid
            // column range.
            const column = clamp(
                Math.floor((object.x * sourceKeys) / 512),
                0,
                sourceKeys - 1,
            );
            const note: CatchNote = {
                time: Math.max(0, object.time),
                x: 0,
                type: "fruit",
                scale: 1,
                samples: object.samples || [],
            };

            if (isHold && Number.isFinite(object.endTime)) {
                const endTime = Math.max(note.time, object.endTime);
                if (endTime > note.time) {
                    note.holdEndTime = endTime;
                }
            }

            collector.push(note, mapManiaColumn(column, sourceKeys));
        }
    } else {
        // Mania can also be selected for osu!/osu!catch charts. Reuse the
        // catch compilation so sliders and their droplets keep their rhythm,
        // then fold every playable note onto a 4K lane by horizontal position.
        const sourceChart = catchChart ?? compileCatchChart(beatmap);
        for (const sourceNote of sourceChart.notes) {
            if (sourceNote.type === "banana") continue;

            const lane = clamp(
                Math.floor((sourceNote.x * MANIA_LANE_COUNT) / 512),
                0,
                MANIA_LANE_COUNT - 1,
            );
            collector.push(
                {
                    time: sourceNote.time,
                    x: 0,
                    type: "fruit",
                    scale: 1,
                    samples: sourceNote.samples || [],
                },
                lane,
            );
        }
    }

    const notes = collector.finish();
    const firstNoteTime = notes.length ? notes[0].time : 0;
    let lastNoteTime = 0;
    for (const note of notes) {
        lastNoteTime = Math.max(lastNoteTime, note.holdEndTime ?? note.time);
    }

    const approachRate = beatmap.difficulty.approachRate;
    const preemptMs = clamp(2000 - (approachRate - 5) * 70, 1300, 2150);

    return {
        notes,
        firstNoteTime,
        lastNoteTime,
        bpm: Math.round(getBpm(beatmap.timingPoints)),
        preemptMs,
        objectCount: beatmap.hitObjects.length,
        lengthMs: Math.max(0, lastNoteTime - firstNoteTime),
        metadata: beatmap.metadata,
        difficulty: beatmap.difficulty,
        mode: beatmap.general.mode,
        playMode: "mania",
        mania: {
            sourceKeys: sourceKeys ?? MANIA_LANE_COUNT,
            laneCount: MANIA_LANE_COUNT,
            keyLabels: [...MANIA_KEY_LABELS],
        },
        sourceKeys,
    };
}

export function compileChart(
    beatmap: ParsedBeatmap,
    playMode: PlayMode = beatmap.general.mode === 3 ? "mania" : "catch",
    catchChart?: CompiledCatchChart,
): CompiledCatchChart {
    return playMode === "mania"
        ? compileManiaChart(beatmap, catchChart)
        : (catchChart ?? compileCatchChart(beatmap));
}

function normalizeArchivePath(path: string, relativeTo = ""): string | null {
    const requestedPath = path.replace(/\\/g, "/");
    if (requestedPath.startsWith("/") || /^[a-z]:/i.test(requestedPath)) {
        return null;
    }

    const basePath = relativeTo.replace(/\\/g, "/");
    const segments = [...basePath.split("/"), ...requestedPath.split("/")];
    const normalized: string[] = [];

    for (const segment of segments) {
        if (!segment || segment === ".") continue;
        if (segment === "..") {
            if (!normalized.length) return null;
            normalized.pop();
            continue;
        }
        normalized.push(segment);
    }

    return normalized.join("/");
}

function sanitizeArchiveEntryPath(path: string): string | null {
    const normalizedPath = path.replace(/\\/g, "/");
    const segments = normalizedPath.split("/");
    // Reject unsafe ZIP names; only references inside a map may use `../`.
    if (
        normalizedPath.startsWith("/") ||
        /^[a-z]:/i.test(normalizedPath) ||
        segments.includes("..")
    ) {
        return null;
    }

    const safePath = segments
        .filter((segment) => segment && segment !== ".")
        .join("/");
    return safePath || null;
}

export function resolveArchivePath(
    resourcePath: string,
    relativeTo = "",
): string | null {
    // Resolve map resource references relative to the .osu file, then ensure
    // normalization stays inside the archive root.
    const baseDirectory = relativeTo.replace(/\\/g, "/").split("/");
    if (baseDirectory.length) baseDirectory.pop();
    return (
        normalizeArchivePath(
            resourcePath,
            baseDirectory.join("/"),
        )?.toLowerCase() ?? null
    );
}

export function extractArchive(arrayBuffer: ArrayBuffer): OsuArchive {
    const unzippedFiles = unzipSync(new Uint8Array(arrayBuffer));
    const files = Object.create(null) as Record<string, Uint8Array>;
    const beatmaps: ArchivedBeatmap[] = [];

    for (const [archivePath, data] of Object.entries(unzippedFiles)) {
        const name = sanitizeArchiveEntryPath(archivePath);
        if (!name) {
            console.warn("忽略压缩包中的不安全路径", archivePath);
            continue;
        }
        files[name] = data;
        if (!name.toLowerCase().endsWith(".osu")) continue;
        try {
            beatmaps.push({ name, text: strFromU8(data) });
        } catch (error) {
            console.warn("无法读取谱面文件", name, error);
        }
    }

    return { files, beatmaps };
}

export function findArchiveFile(
    files: Record<string, Uint8Array>,
    wantedPath: string | null | undefined,
    relativeTo = "",
): ArchiveFile | null {
    if (!wantedPath) return null;
    const wanted = resolveArchivePath(wantedPath, relativeTo)?.toLowerCase();
    if (!wanted) return null;

    for (const [name, data] of Object.entries(files)) {
        if (name.toLowerCase() === wanted) return { name, data };
    }

    const wantedBase = wanted.split("/").pop();
    for (const [name, data] of Object.entries(files)) {
        const base = name.toLowerCase().split("/").pop();
        if (base === wantedBase) return { name, data };
    }

    return null;
}

export function findArchiveFileByExtension(
    files: Record<string, Uint8Array>,
    extensions: readonly string[],
): ArchiveFile | null {
    const wanted = extensions.map((extension) => extension.toLowerCase());
    for (const [name, data] of Object.entries(files)) {
        const lower = name.toLowerCase();
        if (wanted.some((extension) => lower.endsWith(extension))) {
            return { name, data };
        }
    }
    return null;
}

export function decodeArchiveText(entry: ArchiveFile | null): string {
    if (!entry) return "";
    try {
        return strFromU8(entry.data);
    } catch (error) {
        console.warn("无法读取压缩包文本", entry.name, error);
        return "";
    }
}

export function getMimeType(fileName: string): string {
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".mp3")) return "audio/mpeg";
    if (lower.endsWith(".ogg") || lower.endsWith(".oga")) return "audio/ogg";
    if (lower.endsWith(".wav")) return "audio/wav";
    if (lower.endsWith(".m4a")) return "audio/mp4";
    if (lower.endsWith(".mp4")) return "video/mp4";
    if (lower.endsWith(".webm")) return "video/webm";
    if (lower.endsWith(".ogv")) return "video/ogg";
    if (lower.endsWith(".mov")) return "video/quicktime";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".gif")) return "image/gif";
    return "application/octet-stream";
}
