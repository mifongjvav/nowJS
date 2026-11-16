export const OSU_PLAYFIELD_WIDTH = 512;

export interface Playfield {
    left: number;
    width: number;
    right: number;
    center: number;
}

export function getPlayfield(): Playfield {
    const scale = window.gameScale || 1;
    const width = OSU_PLAYFIELD_WIDTH * scale;
    const left = ((window.gameWidth || 1280) - width) / 2;
    return {
        left,
        width,
        right: left + width,
        center: (window.gameWidth || 1280) / 2,
    };
}

// osu!catch uses the 512x384 playfield inside the same 4:3 area as the
// storyboard (640x480). Scaling only by gameScale made the catch field half as
// wide as the storyboard and broke both the coordinate mapping and boundaries.
export function getCatchPlayfield(): Playfield {
    const gameWidth = window.gameWidth || 1280;
    const gameHeight = window.gameHeight || 720;
    const width = gameHeight * (4 / 3);
    const left = (gameWidth - width) / 2;
    return {
        left,
        width,
        right: left + width,
        center: gameWidth / 2,
    };
}

export function osuXToScreen(x: number): number {
    const field = getPlayfield();
    const clamped = Math.min(OSU_PLAYFIELD_WIDTH, Math.max(0, x));
    return field.left + (clamped / OSU_PLAYFIELD_WIDTH) * field.width;
}
