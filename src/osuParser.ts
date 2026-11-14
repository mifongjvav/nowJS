import { strFromU8, unzipSync } from "./vendor/fflate.js";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function splitSections(text) {
    const sections = {};
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

function parseKeyValues(lines = []) {
    const values = {};
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

function parseEvents(lines = []) {
    const events = {
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

function parseTimingPoints(lines = []) {
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
            volume: parseNumber(parts[5], 100),
        });
    }

    return timingPoints.sort((a, b) => a.time - b.time);
}

const SAMPLE_SET_NAMES = {
    1: "normal",
    2: "soft",
    3: "drum",
};

function parseHitSample(value) {
    const parts = String(value || "").split(":");
    return {
        normalSet: parseNumber(parts[0], 0) | 0,
        additionSet: parseNumber(parts[1], 0) | 0,
        index: parseNumber(parts[2], 0) | 0,
        volume: parseNumber(parts[3], 0),
        filename: parts[4] || "",
    };
}

function getTimingSampleInfo(timingPoints, time) {
    let sampleSet = 0;
    let volume = 100;

    for (const point of timingPoints) {
        if (point.time > time) break;
        if (point.sampleSet >= 1 && point.sampleSet <= 3) {
            sampleSet = point.sampleSet;
        }
        if (point.volume > 0) {
            volume = point.volume;
        }
    }

    return {
        sampleSet: SAMPLE_SET_NAMES[sampleSet] || "normal",
        volume,
    };
}

function parseHitObjects(lines = [], timingPoints = []) {
    const hitObjects = [];

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
                : type & 8
                  ? parts[6] || ""
                  : parts[5] || "";
        const hitSample = parseHitSample(hitSampleValue);
        const timingSample = getTimingSampleInfo(timingPoints, time);
        const object = {
            x,
            y,
            time,
            type,
            hitSound,
            sampleSet:
                SAMPLE_SET_NAMES[hitSample.normalSet] || timingSample.sampleSet,
            volume:
                hitSample.volume > 0 ? hitSample.volume : timingSample.volume,
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
        } else if (type & 8) {
            object.endTime = Math.max(time, parseNumber(parts[5], time));
        }

        hitObjects.push(object);
    }

    return hitObjects.sort((a, b) => a.time - b.time);
}

export function parseOsu(text) {
    const { header, sections } = splitSections(text);
    const general = parseKeyValues(sections.General);
    const metadata = parseKeyValues(sections.Metadata);
    const difficulty = parseKeyValues(sections.Difficulty);
    const timingPoints = parseTimingPoints(sections.TimingPoints);
    const hitObjects = parseHitObjects(sections.HitObjects, timingPoints);
    const versionMatch = header.match(/osu file format v(\d+)/i);

    return {
        formatVersion: versionMatch ? Number(versionMatch[1]) : 14,
        general: {
            audioFilename: general.AudioFilename || "",
            previewTime: parseNumber(general.PreviewTime, -1),
            mode: parseNumber(general.Mode, 0),
            sampleSet: general.SampleSet || "Normal",
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
        notes.push({ time, x, type: "banana", scale: 1.15 });
    }
}

function addSliderNotes(object, beatmap, notes) {
    const { beatLength, sliderVelocity } = getTimingAt(
        beatmap.timingPoints,
        object.time,
    );
    const sliderMultiplier = beatmap.difficulty.sliderMultiplier || 1.4;
    const pixelsPerBeat = 100 * sliderMultiplier * sliderVelocity;
    const length = object.length;
    const fruitSample = {
        sampleSet: object.sampleSet || "normal",
        hitSound: object.hitSound || 0,
        volume: object.volume ?? 100,
    };
    const dropletSample = {
        sampleSet: fruitSample.sampleSet,
        hitSound: 0,
        volume: Math.round(fruitSample.volume * 0.65),
    };

    if (length <= 1 || pixelsPerBeat <= 0 || beatLength <= 0) {
        notes.push({
            time: object.time,
            x: object.x,
            type: "fruit",
            scale: 1,
            ...fruitSample,
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
            ...fruitSample,
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
        ...fruitSample,
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
                ...dropletSample,
            });
        }

        notes.push({
            time: segmentStart + slideDuration,
            x: forward ? endPoint.x : object.x,
            type: "fruit",
            scale: 0.92,
            ...fruitSample,
        });
    }
}

export function compileCatchChart(beatmap) {
    const notes = [];
    const bananaRandom = createSeededRandom(1337);

    for (const object of beatmap.hitObjects) {
        if (object.type & 1) {
            notes.push({
                time: object.time,
                x: object.x,
                type: "fruit",
                scale: 1,
                sampleSet: object.sampleSet || "normal",
                hitSound: object.hitSound || 0,
                volume: object.volume ?? 100,
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
            sampleSet: note.sampleSet || "normal",
            hitSound: note.hitSound || 0,
            volume: note.volume ?? 100,
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
    };
}

function normalizePath(path) {
    return path
        .replace(/\\/g, "/")
        .replace(/^\.?\//, "")
        .toLowerCase();
}

export function extractArchive(arrayBuffer) {
    const files = unzipSync(new Uint8Array(arrayBuffer));
    const beatmaps = [];

    for (const [name, data] of Object.entries(files)) {
        if (!name.toLowerCase().endsWith(".osu")) continue;
        try {
            beatmaps.push({ name, text: strFromU8(data) });
        } catch (error) {
            console.warn("无法读取谱面文件", name, error);
        }
    }

    return { files, beatmaps };
}

export function findArchiveFile(files, wantedPath) {
    if (!wantedPath) return null;
    const wanted = normalizePath(wantedPath);

    for (const [name, data] of Object.entries(files)) {
        if (normalizePath(name) === wanted) return { name, data };
    }

    const wantedBase = wanted.split("/").pop();
    for (const [name, data] of Object.entries(files)) {
        const base = normalizePath(name).split("/").pop();
        if (base === wantedBase) return { name, data };
    }

    return null;
}

export function findArchiveFileByExtension(files, extensions) {
    const wanted = extensions.map((extension) => extension.toLowerCase());
    for (const [name, data] of Object.entries(files)) {
        const lower = name.toLowerCase();
        if (wanted.some((extension) => lower.endsWith(extension))) {
            return { name, data };
        }
    }
    return null;
}

export function decodeArchiveText(entry) {
    if (!entry) return "";
    try {
        return strFromU8(entry.data);
    } catch (error) {
        console.warn("无法读取压缩包文本", entry.name, error);
        return "";
    }
}

export function getMimeType(fileName) {
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
