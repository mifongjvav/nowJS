import type { GeneratorAnalysis } from "./generatorTypes.ts";

export interface GeneratorPhrase {
    start: number;
    end: number;
    section: number;
    energy: number;
    change: number;
    brightnessChange: number;
    signature: string;
    events: { time: number; offset: number; accent: boolean }[];
}

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const quantile = (values: number[], fraction: number) => {
    const sorted = values.sort((a, b) => a - b);
    return sorted[Math.floor((sorted.length - 1) * fraction)] ?? 0;
};

// These are rhythm/energy/timbre heuristics, NOT source separation or a vocal
// transcription. A bar is a unit for recognising repeated material, not an
// instruction to change region or reverse direction every four/eight beats.
// Design references (musical consistency, not a pattern catalogue to cycle):
// https://osu.ppy.sh/wiki/en/Music_theory/Layer
// https://osu.ppy.sh/wiki/en/Beatmapping/Mapping_techniques/Flow
// https://osu.ppy.sh/community/forums/topics/195803 (Drafura's H-spacing notes)
export function planGeneratorPhrases(
    analysis: GeneratorAnalysis,
): GeneratorPhrase[] {
    const beat = 60000 / analysis.bpm;
    const bar = beat * 4;
    const reference = Math.max(
        0.015,
        quantile(
            analysis.frames.filter((f) => f.rms > 0.015).map((f) => f.rms),
            0.85,
        ),
    );
    const accentReference = quantile(
        analysis.onsets.map((o) => o.strength),
        0.85,
    );
    const cells = new Map<
        number,
        { rms: number; brightness: number; count: number }
    >();
    for (const frame of analysis.frames) {
        const index = Math.floor((frame.timeMs - analysis.offsetMs) / bar);
        let cell = cells.get(index);
        if (!cell) {
            cell = { rms: 0, brightness: 0, count: 0 };
            cells.set(index, cell);
        }
        cell.rms += frame.rms;
        cell.brightness += frame.brightness;
        cell.count++;
    }
    for (const cell of cells.values()) {
        cell.rms /= Math.max(1, cell.count);
        cell.brightness /= Math.max(1, cell.count);
    }
    const sections = new Map<
        number,
        {
            section: number;
            energy: number;
            change: number;
            brightnessChange: number;
        }
    >();
    let section = 0,
        lastBoundary = -Infinity;
    let previous: { rms: number; brightness: number } | null = null;
    for (const [index, cell] of cells) {
        const energyChange = previous
            ? Math.abs(cell.rms - previous.rms) / reference
            : 0;
        const brightnessChange = previous
            ? cell.brightness - previous.brightness
            : 0;
        const change = Math.max(energyChange, Math.abs(brightnessChange) * 2);
        const boundary =
            previous !== null && change >= 0.22 && index - lastBoundary >= 2;
        if (boundary) {
            section++;
            lastBoundary = index;
        }
        sections.set(index, {
            section,
            energy: clamp(cell.rms / reference, 0, 1),
            change: boundary ? clamp(change, 0, 1) : 0,
            brightnessChange: boundary ? brightnessChange : 0,
        });
        previous = cell;
    }
    const snapped = new Map<number, GeneratorAnalysis["onsets"][number]>();
    for (const onset of analysis.onsets) {
        const timeMs =
            analysis.offsetMs +
            (Math.round(((onset.timeMs - analysis.offsetMs) / beat) * 4) / 4) *
                beat;
        if (
            !snapped.has(timeMs) ||
            onset.strength > snapped.get(timeMs)!.strength
        )
            snapped.set(timeMs, { ...onset, timeMs });
    }
    const groups: GeneratorAnalysis["onsets"][] = [];
    let previousBar = -Infinity;
    for (const onset of [...snapped.values()].sort(
        (a, b) => a.timeMs - b.timeMs,
    )) {
        const index = Math.floor((onset.timeMs - analysis.offsetMs + 1) / bar);
        const last = groups.at(-1);
        if (
            !last ||
            index !== previousBar ||
            onset.timeMs - last.at(-1)!.timeMs > beat * 1.25
        )
            groups.push([]);
        groups.at(-1)!.push(onset);
        previousBar = index;
    }
    const vocabulary = new Map<string, { offset: number; accent: boolean }[]>();
    return groups.map((group) => {
        const first = group[0];
        const index = Math.floor((first.timeMs - analysis.offsetMs + 1) / bar);
        const context = sections.get(index) ?? {
            section: 0,
            energy: 0.5,
            change: 0,
            brightnessChange: 0,
        };
        const mean =
            group.reduce((sum, o) => sum + o.strength, 0) / group.length;
        const accents = group.map(
            (o) => o.strength >= accentReference && o.strength > mean * 1.45,
        );
        const times = group.map((o) => o.timeMs);
        const signature = group
            .map(
                (o, i) =>
                    `${Math.round(((times[i] - times[0]) / beat) * 4)}:${Number(accents[i])}`,
            )
            .join(",");
        let motif = vocabulary.get(signature);
        if (!motif) {
            motif = group.map((o, i) => {
                const metric = Math.round(
                    ((times[i] - analysis.offsetMs) / beat) * 4,
                );
                const wholeBeat = metric % 4 === 0;
                const beatDirection = Math.floor(metric / 4) % 2 === 0 ? 1 : -1;
                return {
                    offset: wholeBeat ? beatDirection * 0.32 : 0,
                    accent: accents[i],
                };
            });
            // Short fast runs form one local gesture, with a clear entrance
            // and release, instead of pushing toward the screen edge forever.
            for (let start = 0; start < group.length;) {
                let end = start;
                while (
                    end + 1 < group.length &&
                    times[end + 1] - times[end] <= beat * 0.36
                )
                    end++;
                if (end - start >= 2) {
                    for (let i = start; i <= end; i++)
                        motif[i].offset =
                            -0.45 + ((i - start) / (end - start)) * 0.9;
                }
                start = end + 1;
            }
            for (let i = 0; i < motif.length; i++)
                if (accents[i]) motif[i].offset = 1;
            vocabulary.set(signature, motif);
        }
        return {
            start: times[0],
            end: times.at(-1)!,
            ...context,
            signature,
            events: motif.map((event, i) => ({ time: times[i], ...event })),
        };
    });
}
