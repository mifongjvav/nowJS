import type { TimingPoint } from "./domain.ts";

export interface ManiaBarLine {
    time: number;
    major: boolean;
}
interface Segment {
    start: number;
    first: number;
    end: number;
    barLength: number;
    meter: number;
}

// Measure timing follows osu!lazer's BarLineGenerator, not note placement:
// https://github.com/ppy/osu/blob/master/osu.Game/Rulesets/Objects/BarLineGenerator.cs
// Query only the visible time range so seeking and extreme BPM maps do not
// allocate an entire song's worth of decorative objects.
export class ManiaBarLineTimeline {
    private segments: Segment[];

    constructor(
        points: readonly TimingPoint[],
        firstNote: number,
        lastNote: number,
    ) {
        const valid = points.filter(
            (p) =>
                p.uninherited &&
                Number.isFinite(p.time) &&
                Number.isFinite(p.beatLength) &&
                p.beatLength > 0,
        );
        const unique = new Map<number, TimingPoint>();
        for (const point of valid) unique.set(point.time, point);
        const timing = [...unique.values()].sort((a, b) => a.time - b.time);
        if (!timing.length) {
            timing.push({
                time: 0,
                beatLength: 500,
                meter: 4,
                uninherited: true,
                sliderVelocity: 1,
                sampleSet: 0,
                sampleIndex: 0,
                volume: 100,
            });
        }
        const generationStart = Math.min(0, firstNote);
        this.segments = timing
            .map((point, index) => {
                const meter =
                    Number.isFinite(point.meter) && point.meter > 0
                        ? Math.max(1, Math.min(32, Math.round(point.meter)))
                        : 4;
                const barLength = point.beatLength * meter;
                const first =
                    point.time +
                    Math.max(
                        0,
                        Math.ceil((generationStart - point.time) / barLength),
                    ) *
                        barLength +
                    (point.omitFirstBarLine ? barLength : 0);
                return {
                    start: point.time,
                    first,
                    barLength,
                    meter,
                    end: timing[index + 1]?.time ?? lastNote + 1 + barLength,
                };
            })
            .filter(
                (segment) =>
                    Number.isFinite(segment.first) &&
                    Number.isFinite(segment.barLength) &&
                    segment.barLength > 0,
            );
    }

    between(from: number, to: number, limit = 256): ManiaBarLine[] {
        if (!Number.isFinite(from) || !Number.isFinite(to) || to < from)
            return [];
        const lines: ManiaBarLine[] = [];
        let low = 0,
            high = this.segments.length;
        while (low < high) {
            const mid = (low + high) >>> 1;
            if (this.segments[mid].start <= from) low = mid + 1;
            else high = mid;
        }
        for (
            let index = Math.max(0, low - 1);
            index < this.segments.length;
            index++
        ) {
            const segment = this.segments[index];
            if (segment.first > to && segment.start > to) break;
            const firstIndex = Math.max(
                0,
                Math.ceil((from - segment.first) / segment.barLength - 1e-9),
            );
            for (let n = firstIndex; lines.length < Math.min(limit, 256); n++) {
                const time = segment.first + n * segment.barLength;
                if (time >= segment.end - 1e-7 || time > to + 1e-7) break;
                lines.push({ time, major: n % segment.meter === 0 });
            }
            if (lines.length >= Math.min(limit, 256)) break;
        }
        return lines;
    }
}
