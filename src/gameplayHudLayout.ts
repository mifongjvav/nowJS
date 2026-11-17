// All HUD coordinates are in logical canvas pixels, not the narrower Catch
// playfield or browser viewport. CSS letterboxing therefore needs no offsets.
export function getGameplayHudLayout(width: number, height: number) {
    const scale = height / 720;
    const inset = 16 * scale;
    return {
        scale,
        inset,
        right: width - inset,
        bottom: height - inset,
        metadataWidth: Math.min(width * 0.6, 640 * scale),
        progress: {
            x: inset,
            y: 6 * scale,
            width: width - inset * 2,
            height: 6 * scale,
            hitHeight: 26 * scale,
        },
    };
}

export function hudProgressAtPoint(
    clientX: number,
    clientY: number,
    rect: { left: number; top: number; width: number; height: number },
    width: number,
    height: number,
) {
    if (!(rect.width > 0 && rect.height > 0)) return null;
    const x = ((clientX - rect.left) / rect.width) * width;
    const y = ((clientY - rect.top) / rect.height) * height;
    const bar = getGameplayHudLayout(width, height).progress;
    return {
        progress: Math.max(0, Math.min(1, (x - bar.x) / bar.width)),
        inside:
            x >= bar.x &&
            x <= bar.x + bar.width &&
            y >= 0 &&
            y <= bar.hitHeight,
    };
}
