export const OSU_PLAYFIELD_WIDTH = 512;

export function getPlayfield() {
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

export function osuXToScreen(x) {
    const field = getPlayfield();
    const clamped = Math.min(OSU_PLAYFIELD_WIDTH, Math.max(0, x));
    return field.left + (clamped / OSU_PLAYFIELD_WIDTH) * field.width;
}
