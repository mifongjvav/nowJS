import assert from "node:assert/strict";
import { test } from "node:test";
import { ManiaBarLineTimeline } from "../maniaTiming.ts";
import { parseOsu, compileChart } from "../osuParser.ts";

const point = (time = 0, beatLength = 500, meter = 4, extra = {}) => ({
    time,
    beatLength,
    meter,
    uninherited: true,
    sliderVelocity: 1,
    sampleSet: 0,
    sampleIndex: 0,
    volume: 100,
    ...extra,
});
const times = (lines) => lines.map((line) => line.time);

test("4/4 generates a measure line every four beats, not per note or per beat", () => {
    const timeline = new ManiaBarLineTimeline([point()], 1000, 9000);
    assert.deepEqual(timeline.between(0, 5000), [
        { time: 0, major: true },
        { time: 2000, major: false },
        { time: 4000, major: false },
    ]);
    assert.equal(timeline.between(8000, 8000)[0].major, true);
});

test("3/4 measures and tempo changes retain each timing point's own offset", () => {
    const timeline = new ManiaBarLineTimeline(
        [
            point(),
            point(1000, -50, 4, { uninherited: false }),
            point(3000, 400, 3),
        ],
        1000,
        8000,
    );
    assert.deepEqual(
        times(timeline.between(0, 6000)),
        [0, 2000, 3000, 4200, 5400],
    );
});

test("negative offsets align the first generated line instead of inventing t=0", () => {
    const timeline = new ManiaBarLineTimeline([point(-500)], 1000, 6000);
    assert.deepEqual(times(timeline.between(0, 5500)), [1500, 3500, 5500]);
    const early = new ManiaBarLineTimeline([point(-500)], -1000, 6000);
    assert.deepEqual(times(early.between(-1000, 2000)), [-500, 1500]);
});

test("omit-first-barline timing effects survive parsing, compilation and generation", () => {
    const parsed = parseOsu(`osu file format v14
[General]
Mode:3
[Difficulty]
CircleSize:4
[TimingPoints]
0,500,4,1,0,100,1,8
1000,-50,4,1,0,100,0,0
[HitObjects]
64,192,1000,1,0
448,192,5000,1,0
`);
    assert.equal(parsed.timingPoints[0].omitFirstBarLine, true);
    for (const mode of ["mania", "catch"]) {
        const chart = compileChart(parsed, mode);
        assert.equal(chart.timingPoints, parsed.timingPoints);
        const timeline = new ManiaBarLineTimeline(
            chart.timingPoints,
            chart.firstNoteTime,
            chart.lastNoteTime,
        );
        assert.deepEqual(times(timeline.between(0, 4000)), [2000, 4000]);
    }
});

test("seek queries are independent of earlier frames and do not scan the whole song", () => {
    const timeline = new ManiaBarLineTimeline([point()], 1000, 3_000_000);
    assert.deepEqual(
        times(timeline.between(2_000_000, 2_001_000)),
        [2_000_000],
    );
    assert.deepEqual(times(timeline.between(0, 2000)), [0, 2000]);
    assert.deepEqual(
        times(timeline.between(2_000_000, 2_001_000)),
        [2_000_000],
    );
});

test("a new timing point at a measure boundary replaces rather than duplicates the line", () => {
    const timeline = new ManiaBarLineTimeline(
        [point(), point(2000, 400, 3)],
        0,
        8000,
    );
    assert.deepEqual(times(timeline.between(0, 4400)), [0, 2000, 3200, 4400]);
    const duplicate = new ManiaBarLineTimeline(
        [point(), point(0, 400, 3)],
        0,
        8000,
    );
    assert.deepEqual(times(duplicate.between(0, 2400)), [0, 1200, 2400]);
});

test("long-note tails are covered, with only one extra measure after the last note", () => {
    const timeline = new ManiaBarLineTimeline([point()], 1000, 8000);
    assert.deepEqual(times(timeline.between(8000, 20000)), [8000, 10000]);
});

test("missing timing uses 120 BPM while invalid points, meters and ranges are safe", () => {
    assert.deepEqual(
        times(new ManiaBarLineTimeline([], 1000, 8000).between(0, 2000)),
        [0, 2000],
    );
    const timeline = new ManiaBarLineTimeline(
        [point(0, 500, 0), point(NaN)],
        0,
        8000,
    );
    assert.deepEqual(times(timeline.between(0, 2000)), [0, 2000]);
    assert.deepEqual(timeline.between(NaN, 1000), []);
    assert.deepEqual(timeline.between(2000, 1000), []);
    assert.deepEqual(
        new ManiaBarLineTimeline(
            [point(0, Number.MAX_VALUE, 32)],
            0,
            8000,
        ).between(0, 2000),
        [],
    );
});

test("pathological BPM and long visible windows have a bounded decoration count", () => {
    const timeline = new ManiaBarLineTimeline([point(0, 0.001, 1)], 0, 8000);
    assert.equal(timeline.between(0, 8000).length, 256);
    assert.equal(timeline.between(0, 8000, 8).length, 8);
});
