import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOsu, compileChart } from "../osuParser.ts";

function beatmap(mode = 0, warning, end = 3000) {
    return `osu file format v14\n[General]\nMode:${mode}\n${warning === undefined ? "" : `EpilepsyWarning:${warning}\n`}[Difficulty]\nCircleSize:4\n[HitObjects]\n256,192,1000,8,0,${end},0:0:0:0:\n`;
}
test("EpilepsyWarning is enabled only when explicitly authored", () => {
    assert.equal(parseOsu(beatmap(0, 1)).general.epilepsyWarning, true);
    assert.equal(parseOsu(beatmap(0, 0)).general.epilepsyWarning, false);
    assert.equal(parseOsu(beatmap()).general.epilepsyWarning, false);
});
test("spinners convert into one 4K hold with their original duration", () => {
    for (const mode of [0, 2, 3]) {
        const chart = compileChart(parseOsu(beatmap(mode)), "mania");
        assert.equal(chart.notes.length, 1);
        assert.equal(chart.notes[0].time, 1000);
        assert.equal(chart.notes[0].holdEndTime, 3000);
        assert.equal(chart.notes[0].lane, 2);
        assert.equal(chart.lastNoteTime, 3000);
    }
});
test("zero-length spinner stays a tap and catch banana showers are unchanged", () => {
    const zero = compileChart(parseOsu(beatmap(0, undefined, 1000)), "mania");
    assert.equal(zero.notes.length, 1);
    assert.equal(zero.notes[0].holdEndTime, undefined);
    const caught = compileChart(parseOsu(beatmap()), "catch");
    assert.ok(caught.notes.length > 1);
    assert.ok(caught.notes.every((note) => note.type === "banana"));
});
