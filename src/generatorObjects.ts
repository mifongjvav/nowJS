import type {
    GeneratorAnalysis,
    GeneratorOptions,
    GeneratorObjectCounts,
} from "./generatorTypes.ts";

type BaseObject = { x: number; time: number };
export type GeneratedObject =
    | (BaseObject & { kind: "circle" })
    | (BaseObject & { kind: "hold"; endTime: number })
    | (BaseObject & {
          kind: "slider";
          endTime: number;
          slides: number;
          length: number;
      })
    | (BaseObject & { kind: "bananaShower"; endTime: number });

export const getGeneratorSliderLength = (bpm: number) =>
    Math.round(Math.min(140, (60000 / bpm) * 0.25) * 1000) / 1000;

function lowerBound(values: readonly number[], time: number) {
    let low = 0,
        high = values.length;
    while (low < high) {
        const mid = (low + high) >>> 1;
        if (values[mid] < time) low = mid + 1;
        else high = mid;
    }
    return low;
}

function spanReader(analysis: GeneratorAnalysis) {
    const times = analysis.frames.map((f) => f.timeMs);
    const active = [0],
        energy = [0],
        squared = [0],
        novelty = [0];
    for (const frame of analysis.frames) {
        active.push(active.at(-1)! + Number(frame.rms >= 0.08));
        energy.push(energy.at(-1)! + frame.rms);
        squared.push(squared.at(-1)! + frame.rms * frame.rms);
        novelty.push(novelty.at(-1)! + frame.novelty);
    }
    const accents = analysis.onsets
        .filter((o) => o.strength >= 0.25)
        .map((o) => o.timeMs);
    return (start: number, end: number) => {
        const a = lowerBound(times, start),
            b = lowerBound(times, end),
            count = b - a;
        if (count < 4)
            return {
                audible: 0,
                variation: Infinity,
                novelty: Infinity,
                accents: 0,
            };
        const mean = (energy[b] - energy[a]) / count;
        return {
            audible: (active[b] - active[a]) / count,
            variation:
                Math.sqrt(
                    Math.max(
                        0,
                        (squared[b] - squared[a]) / count - mean * mean,
                    ),
                ) / Math.max(0.001, mean),
            novelty: (novelty[b] - novelty[a]) / count,
            accents: lowerBound(accents, end) - lowerBound(accents, start),
        };
    };
}

// Transients remain taps. Only continuously audible, spectrally stable spans
// become long objects; brief drum tails and silence cannot create them.
export function createGeneratorObjects(
    analysis: GeneratorAnalysis,
    options: GeneratorOptions,
    notes: readonly BaseObject[],
): GeneratedObject[] {
    const beat = 60000 / analysis.bpm,
        read = spanReader(analysis);
    const showers: Extract<GeneratedObject, { kind: "bananaShower" }>[] = [];
    const showerBeats = Math.max(4, Math.ceil(1200 / beat));
    const showerDuration = showerBeats * beat;
    if (options.mode === "catch") {
        let previousEnd = -Infinity;
        // Reserve an occasional sustained phrase, not every sustained beat.
        for (
            let barBeat = 8;
            analysis.offsetMs + barBeat * beat + showerDuration <=
            analysis.durationMs - 100;
            barBeat += 4
        ) {
            const time = Math.round(analysis.offsetMs + barBeat * beat);
            if (time < previousEnd + showerDuration * 3) continue;
            const endTime = Math.round(time + showerDuration);
            const span = read(time, endTime);
            if (
                span.audible >= 0.9 &&
                span.variation <= 0.55 &&
                span.novelty <= 0.1 &&
                span.accents <= Math.ceil(showerBeats * 1.25)
            ) {
                showers.push({ kind: "bananaShower", x: 256, time, endTime });
                previousEnd = endTime;
            }
        }
    }
    const minimumBeats = Math.max(1, Math.ceil(600 / beat));
    const longBeats = Math.min(
        Math.max(minimumBeats, 2),
        Math.max(minimumBeats, Math.min(4, Math.floor(2400 / beat))),
    );
    const longDuration = longBeats * beat;
    const rainCoverage = showers.reduce(
        (sum, s) => sum + s.endTime - s.time,
        0,
    );
    const budget = Math.max(
        longDuration,
        Math.min(
            analysis.durationMs * 0.35,
            analysis.durationMs * 0.55 - rainCoverage,
        ),
    );
    let covered = 0,
        blockedUntil = -Infinity,
        lastLongEnd = -Infinity;
    const objects: GeneratedObject[] = [];
    // Leave time to return to center, and let the final bonus bananas finish
    // before the next compulsory fruit/stream begins.
    const postShowerGap = Math.max(beat, 500);
    for (const note of notes) {
        if (
            note.time <= blockedUntil ||
            showers.some(
                (s) =>
                    note.time >= s.time &&
                    note.time < s.endTime + postShowerGap,
            )
        )
            continue;
        const endTime = Math.round(note.time + longDuration);
        const nextShower = showers.find((s) => s.time > note.time);
        const span = read(note.time, endTime);
        if (
            note.time >= lastLongEnd + 4 * beat &&
            covered + longDuration <= budget &&
            endTime <= analysis.durationMs - 100 &&
            (!nextShower || endTime <= nextShower.time - 100) &&
            span.audible >= 0.85 &&
            span.variation <= 0.85 &&
            span.novelty <= 0.16
        ) {
            objects.push(
                options.mode === "mania"
                    ? { ...note, kind: "hold", endTime }
                    : {
                          ...note,
                          kind: "slider",
                          endTime,
                          slides: longBeats,
                          length: getGeneratorSliderLength(analysis.bpm),
                      },
            );
            covered += longDuration;
            blockedUntil = endTime + 50;
            lastLongEnd = endTime;
        } else objects.push({ ...note, kind: "circle" });
    }
    objects.push(...showers);
    objects.sort((a, b) => a.time - b.time);
    if (options.mode === "catch") {
        let lastX = 256,
            lastEnd = -Infinity,
            returnToCenter = false;
        for (const object of objects) {
            if (object.kind === "bananaShower") {
                lastX = 256;
                lastEnd = object.endTime;
                returnToCenter = true;
                continue;
            }
            const reach = Math.min(
                170,
                Math.max(0, object.time - lastEnd) * 0.3,
            );
            object.x = returnToCenter
                ? 256
                : Math.round(
                      lastX +
                          Math.max(-reach, Math.min(reach, object.x - lastX)),
                  );
            object.x = Math.max(32, Math.min(480, object.x));
            returnToCenter = false;
            lastX =
                object.kind === "slider" && object.slides % 2
                    ? object.x + (object.x > 256 ? -1 : 1) * object.length
                    : object.x;
            lastEnd = object.kind === "circle" ? object.time : object.endTime;
        }
    }
    return objects;
}

export function countGeneratorObjects(
    objects: readonly GeneratedObject[],
): GeneratorObjectCounts {
    const counts = { circles: 0, sliders: 0, holds: 0, bananaShowers: 0 };
    for (const object of objects) {
        if (object.kind === "circle") counts.circles++;
        else if (object.kind === "slider") counts.sliders++;
        else if (object.kind === "hold") counts.holds++;
        else counts.bananaShowers++;
    }
    return counts;
}

export function serializeGeneratorObjects(
    objects: readonly GeneratedObject[],
    analysis: GeneratorAnalysis,
): string[] {
    const barLength = (60000 / analysis.bpm) * 4;
    let previousBar: number | null = null,
        afterSpinner = false;
    return objects.map((object) => {
        if (object.kind === "bananaShower") {
            afterSpinner = true;
            return `256,192,${object.time},8,0,${object.endTime},0:0:0:0:`;
        }
        const bar = Math.floor(
            (object.time - analysis.offsetMs + 0.5) / barLength,
        );
        const combo = previousBar !== bar || afterSpinner ? 4 : 0;
        previousBar = bar;
        afterSpinner = false;
        const prefix = `${object.x},192,${object.time}`;
        if (object.kind === "hold")
            return `${prefix},${128 | combo},0,${object.endTime}:0:0:0:0:`;
        if (object.kind === "slider") {
            const endX = Math.round(
                object.x + (object.x > 256 ? -1 : 1) * object.length,
            );
            const sounds = Array(object.slides + 1)
                .fill("0")
                .join("|");
            const sets = Array(object.slides + 1)
                .fill("0:0")
                .join("|");
            return `${prefix},${2 | combo},0,L|${endX}:192,${object.slides},${object.length},${sounds},${sets},0:0:0:0:`;
        }
        return `${prefix},${1 | combo},0,0:0:0:0:`;
    });
}
