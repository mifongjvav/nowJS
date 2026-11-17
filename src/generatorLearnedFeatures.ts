// Shared by corpus extraction and browser inference. All distances are in the
// 512px osu! field, not viewport pixels. No audio timbre is claimed as input.
export const MOVEMENT_BINS = [
    -1, -0.7, -0.45, -0.25, -0.12, 0, 0.12, 0.25, 0.45, 0.7, 1,
];
export interface MovementHistory {
    dx: number;
    beats: number;
}
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export function movementFeatures(
    x: number,
    beats: number,
    nextBeats: number,
    phase: number,
    strain: number,
    history: MovementHistory[],
): number[] {
    const features = [
        (x - 256) / 256,
        Math.log2(1 + clamp(beats, 0, 8)) / 3,
        Math.log2(1 + clamp(nextBeats, 0, 8)) / 3,
        Math.sin(phase * Math.PI * 2),
        Math.cos(phase * Math.PI * 2),
        clamp(strain, 0, 2) / 2,
    ];
    for (let i = 4; i > 0; i--) {
        const previous = history.at(-i);
        features.push(
            previous ? clamp(previous.dx / 256, -2, 2) : 0,
            previous ? Math.log2(1 + clamp(previous.beats, 0, 8)) / 3 : 0,
        );
    }
    return features;
}
export function movementClass(dx: number) {
    let result = 0;
    for (let i = 1; i < MOVEMENT_BINS.length; i++)
        if (
            Math.abs(dx / 256 - MOVEMENT_BINS[i]) <
            Math.abs(dx / 256 - MOVEMENT_BINS[result])
        )
            result = i;
    return result;
}
