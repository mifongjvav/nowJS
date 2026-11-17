import type {
    GeneratorAnalysis,
    GeneratorOptions,
    GeneratorObjectCounts,
} from "./generatorTypes.ts";
import { getGeneratorDifficulty } from "./generatorDifficulty.ts";
import type { GeneratorNote } from "./generatorPatterns.ts";
import { createGeneratorCatchPath } from "./generatorCatchPath.ts";

type BaseObject = GeneratorNote;
export type GeneratedObject =
    | (BaseObject & { kind: "circle" })
    | (BaseObject & { kind: "hold"; endTime: number })
    | (BaseObject & {
          kind: "slider";
          endTime: number;
          slides: number;
          length: number;
          endX?: number;
      })
    | (BaseObject & { kind: "bananaShower"; endTime: number });

export const getGeneratorSliderLength = (
    bpm: number,
    options?: Partial<GeneratorOptions>,
) =>
    Math.round(
        Math.min(
            432,
            (60000 / bpm) *
                (options
                    ? Math.min(
                          0.5,
                          getGeneratorDifficulty(options).spacing * 0.8,
                      )
                    : 0.25),
        ) * 1000,
    ) / 1000;

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
    notes: readonly GeneratorNote[],
): GeneratedObject[] {
    const beat = 60000 / analysis.bpm,
        read = spanReader(analysis);
    const profile = getGeneratorDifficulty(options);
    const sliderBeatLength = getGeneratorSliderLength(analysis.bpm, options);
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
            if (time < previousEnd + Math.max(beat * 32, showerDuration * 3))
                continue;
            const endTime = Math.round(time + showerDuration);
            const span = read(time, endTime);
            if (
                span.audible >= 0.9 &&
                span.variation <= 0.35 &&
                span.novelty <= 0.07 &&
                span.accents <= Math.floor(showerBeats * 0.6)
            ) {
                showers.push({ kind: "bananaShower", x: 256, time, endTime });
                previousEnd = endTime;
            }
        }
    }
    const longDuration = 2 * beat;
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
        lastLongEnd = -Infinity;
    let blockedUntil = -Infinity;
    const laneEnds = [0, 0, 0, 0];
    const objects: GeneratedObject[] = [];
    // Leave time to return to center, and let the final bonus bananas finish
    // before the next compulsory fruit/stream begins.
    const postShowerGap = Math.max(beat, 500);
    for (let noteIndex = 0; noteIndex < notes.length; noteIndex++) {
        const note = notes[noteIndex];
        const lane = Math.max(0, Math.min(3, Math.floor(note.x / 128)));
        if (
            (options.mode === "catch"
                ? note.time <= blockedUntil
                : note.time <= laneEnds[lane] + 50) ||
            showers.some(
                (s) =>
                    note.time >= s.time &&
                    note.time < s.endTime + postShowerGap,
            )
        )
            continue;
        // Fit the sound's endpoint to half/whole beats, the next accent, and
        // the next compulsory object. No fixed two-beat blanket over music.
        const next = notes[noteIndex + 1];
        const gap = next ? next.time - note.time : 2 * beat;
        const maximum =
            options.mode === "catch"
                ? Math.min(2, Math.floor((216 / sliderBeatLength) * 2) / 2)
                : 4;
        let lengthBeats = Math.min(
            maximum,
            Math.max(0.5, Math.floor((gap / beat) * 2) / 2),
        );
        // A weak next transient inside a stable sustain may become a slider
        // tick instead; strong accents remain independently playable.
        if (next && (next.strength ?? 1) < 0.3)
            lengthBeats = Math.min(maximum, 2);
        for (let j = noteIndex + 1; j < notes.length; j++) {
            const accent = notes[j];
            if (accent.time >= note.time + lengthBeats * beat - 1) break;
            if (
                (accent.strength ?? 1) >=
                Math.max(0.3, (note.strength ?? 1) * 0.75)
            ) {
                lengthBeats =
                    Math.floor(((accent.time - note.time) / beat + 0.002) * 2) /
                    2;
                break;
            }
        }
        let endTime = Math.round(note.time + lengthBeats * beat);
        // End at the first silence or strong spectral change, on a valid snap.
        while (lengthBeats >= 0.5) {
            const section = read(note.time, endTime);
            if (
                section.audible >= 0.85 &&
                section.variation <= 0.85 &&
                section.novelty <= 0.16
            )
                break;
            lengthBeats -= 0.5;
            endTime = Math.round(note.time + lengthBeats * beat);
        }
        const nextShower = showers.find((s) => s.time > note.time);
        const span = read(note.time, endTime);
        if (
            lengthBeats >= 0.5 &&
            endTime - note.time >= 180 &&
            note.time >= lastLongEnd + beat * (profile.level < 2 ? 0.5 : 1) &&
            covered + endTime - note.time <= budget &&
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
                          slides: 1,
                          length:
                              Math.round(
                                  sliderBeatLength * lengthBeats * 1000,
                              ) / 1000,
                      },
            );
            covered += endTime - note.time;
            if (options.mode === "catch") blockedUntil = endTime + 50;
            else laneEnds[lane] = endTime;
            lastLongEnd = endTime;
        } else objects.push({ ...note, kind: "circle" });
        // Chords mark strong musical accents rather than every n-th note.
        if (
            options.mode === "mania" &&
            profile.level >= 3 &&
            (note.strength ?? 0) >= 0.65 &&
            Math.abs(
                (note.time - analysis.offsetMs) / beat -
                    Math.round((note.time - analysis.offsetMs) / beat),
            ) < 0.02
        ) {
            const other = (lane + 2) % 4;
            if (note.time > laneEnds[other] + Math.max(80, beat / 2)) {
                objects.push({
                    kind: "circle",
                    x: 64 + other * 128,
                    time: note.time,
                });
                laneEnds[other] = note.time;
            }
        }
        laneEnds[lane] = Math.max(laneEnds[lane], note.time);
    }
    objects.push(...showers);
    objects.sort((a, b) => a.time - b.time);
    if (options.mode === "catch") {
        const path = createGeneratorCatchPath(analysis, options);
        let returnToCenter = false;
        for (const object of objects) {
            if (object.kind === "bananaShower") {
                path.afterShower(object.endTime);
                returnToCenter = true;
                continue;
            }
            object.x = returnToCenter ? 256 : path.place(object.time);
            if (returnToCenter) path.afterShower(object.time);
            returnToCenter = false;
            if (object.kind === "slider")
                object.endX = path.extend(object.length, object.endTime);
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
                object.endX ??
                    object.x + (object.x > 256 ? -1 : 1) * object.length,
            );
            const sounds = Array(object.slides + 1)
                .fill("0")
                .join("|");
            const sets = Array(object.slides + 1)
                .fill("0:0")
                .join("|");
            const dx = endX - object.x;
            const height =
                Math.sqrt(Math.max(0, object.length ** 2 - dx ** 2)) / 2;
            const middle = `${((object.x + endX) / 2).toFixed(3)}:${(192 + height).toFixed(3)}`;
            return `${prefix},${2 | combo},0,L|${middle}|${endX}:192,${object.slides},${object.length},${sounds},${sets},0:0:0:0:`;
        }
        return `${prefix},${1 | combo},0,0:0:0:0:`;
    });
}
