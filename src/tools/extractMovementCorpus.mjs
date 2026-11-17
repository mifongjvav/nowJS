// node --experimental-strip-types src/tools/extractMovementCorpus.mjs <out.json> <directories...>
import process from "node:process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { unzipSync, strFromU8 } from "../vendor/fflate.js";
import { parseOsu, compileChart } from "../osuParser.ts";
import {
    movementFeatures,
    movementClass,
    MOVEMENT_BINS,
} from "../generatorLearnedFeatures.ts";
const [output, ...directories] = process.argv.slice(2);
if (!output || !directories.length)
    throw Error("Specify output JSON and corpus directories");
const digest = (text) => createHash("sha256").update(text).digest("hex");
const seen = new Set(),
    songs = new Map();
const excluded = { generated: 0, mode: 0, duplicate: 0, short: 0 };
let nativeCatch = 0,
    convertedStandard = 0;
for (const directory of directories) {
    for (const file of (await readdir(directory)).sort()) {
        if (!file.toLowerCase().endsWith(".osz")) continue;
        const archive = unzipSync(
            new Uint8Array(await readFile(join(directory, file))),
        );
        for (const name of Object.keys(archive).sort()) {
            if (!name.toLowerCase().endsWith(".osu")) continue;
            const text = strFromU8(archive[name]);
            const map = parseOsu(text);
            if (/nowjs generator/i.test(map.metadata.creator)) {
                excluded.generated++;
                continue;
            }
            if (![0, 2].includes(map.general.mode)) {
                excluded.mode++;
                continue;
            }
            const hash = digest(text);
            if (seen.has(hash)) {
                excluded.duplicate++;
                continue;
            }
            seen.add(hash);
            // All difficulties of the same song stay together, even if packed
            // in different archives. No random event/window split leakage.
            const key = `${map.metadata.artist}|${map.metadata.title}`
                .normalize("NFKC")
                .toLowerCase()
                .replace(/\s+/g, " ")
                .trim();
            const group = digest(key).slice(0, 16);
            const notes = compileChart(map, "catch").notes.filter(
                (n) => n.type === "fruit",
            );
            if (notes.length < 30) {
                excluded.short++;
                continue;
            }
            const reds = map.timingPoints.filter(
                (p) => p.uninherited && p.beatLength > 0,
            );
            const speeds = notes
                .slice(1)
                .map(
                    (n, i) =>
                        Math.abs(n.x - notes[i].x) /
                        Math.max(1, n.time - notes[i].time),
                )
                .sort((a, b) => a - b);
            const strain = Math.min(
                2,
                speeds[Math.floor(speeds.length * 0.75)] / 0.8,
            );
            const rows = [];
            let history = [],
                timing = 0;
            for (let i = 1; i < notes.length - 1; i++) {
                const previous = notes[i - 1],
                    note = notes[i],
                    next = notes[i + 1];
                while (
                    timing + 1 < reds.length &&
                    reds[timing + 1].time <= note.time
                )
                    timing++;
                const red = reds[timing];
                if (!red) continue;
                const beat = red.beatLength;
                const beats = (note.time - previous.time) / beat;
                if (beats <= 0.04 || beats > 8) {
                    history = [];
                    continue;
                }
                const dx = note.x - previous.x;
                const phase = (((note.time - red.time) / beat) % 4) / 4;
                const features = movementFeatures(
                    previous.x,
                    beats,
                    (next.time - note.time) / beat,
                    phase,
                    strain,
                    history,
                );
                rows.push([features, movementClass(dx)]);
                // Mirrored examples stay in the same song-level split.
                const mirrored = movementFeatures(
                    512 - previous.x,
                    beats,
                    (next.time - note.time) / beat,
                    phase,
                    strain,
                    history.map((h) => ({ ...h, dx: -h.dx })),
                );
                rows.push([mirrored, movementClass(-dx)]);
                history.push({ dx, beats });
                if (history.length > 4) history.shift();
            }
            if (!songs.has(group))
                songs.set(group, { id: group, song: key, maps: [], rows: [] });
            const song = songs.get(group);
            song.maps.push({
                archive: file,
                name,
                hash,
                mode: map.general.mode,
            });
            song.rows.push(...rows);
            if (map.general.mode === 2) nativeCatch++;
            else convertedStandard++;
        }
    }
}
const corpus = {
    schema: 1,
    bins: MOVEMENT_BINS,
    nativeCatch,
    convertedStandard,
    excluded,
    songs: [...songs.values()].sort((a, b) => a.id.localeCompare(b.id)),
};
await writeFile(output, JSON.stringify(corpus));
console.log(
    JSON.stringify({
        songs: songs.size,
        nativeCatch,
        convertedStandard,
        excluded,
        rows: corpus.songs.reduce((n, s) => n + s.rows.length, 0),
    }),
);
