export const GENERATOR_DEFAULT_COLORS = [
    0x78dce8, 0xffa7c4, 0xffd780, 0xbca7ff,
] as const;

function rgbToHsl(color: number) {
    const r = ((color >> 16) & 255) / 255,
        g = ((color >> 8) & 255) / 255,
        b = (color & 255) / 255;
    const max = Math.max(r, g, b),
        min = Math.min(r, g, b),
        delta = max - min;
    const l = (max + min) / 2;
    const s = delta ? delta / (1 - Math.abs(2 * l - 1)) : 0;
    let h = 0;
    if (delta) {
        if (max === r) h = ((g - b) / delta) % 6;
        else if (max === g) h = (b - r) / delta + 2;
        else h = (r - g) / delta + 4;
        h = (h * 60 + 360) % 360;
    }
    return { h, s, l };
}
function hslToRgb(h: number, s: number, l: number) {
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s,
        x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
        m = l - c / 2;
    const [r, g, b] =
        h < 60
            ? [c, x, 0]
            : h < 120
              ? [x, c, 0]
              : h < 180
                ? [0, c, x]
                : h < 240
                  ? [0, x, c]
                  : h < 300
                    ? [x, 0, c]
                    : [c, 0, x];
    return (
        (Math.round((r + m) * 255) << 16) |
        (Math.round((g + m) * 255) << 8) |
        Math.round((b + m) * 255)
    );
}
const hueDistance = (a: number, b: number) =>
    Math.abs(((a - b + 540) % 360) - 180);

// Input is a small background thumbnail, not full-resolution image data.
// Preserve dominant hues, then lift saturation/lightness for readable notes.
export function extractGeneratorComboColors(
    pixels: ArrayLike<number>,
): number[] {
    const buckets = new Map<
        number,
        { r: number; g: number; b: number; weight: number }
    >();
    for (let i = 0; i + 3 < pixels.length; i += 4) {
        if (pixels[i + 3] < 128) continue;
        const r = pixels[i],
            g = pixels[i + 1],
            b = pixels[i + 2];
        const { h, s, l } = rgbToHsl((r << 16) | (g << 8) | b);
        if (l < 0.05 || s < 0.12 || (l > 0.95 && s < 0.3)) continue;
        const key =
            Math.floor(h / 15) * 16 +
            Math.min(3, Math.floor(s * 4)) * 4 +
            Math.min(3, Math.floor(l * 4));
        const weight = 0.6 + s * 0.4;
        const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, weight: 0 };
        bucket.r += r * weight;
        bucket.g += g * weight;
        bucket.b += b * weight;
        bucket.weight += weight;
        buckets.set(key, bucket);
    }
    const candidates = [...buckets.values()]
        .sort((a, b) => b.weight - a.weight)
        .map((v) =>
            rgbToHsl(
                (Math.round(v.r / v.weight) << 16) |
                    (Math.round(v.g / v.weight) << 8) |
                    Math.round(v.b / v.weight),
            ),
        );
    if (!candidates.length) return [...GENERATOR_DEFAULT_COLORS];
    const chosen: { h: number; s: number; l: number }[] = [];
    for (const color of candidates) {
        if (chosen.every((c) => hueDistance(c.h, color.h) >= 28))
            chosen.push(color);
        if (chosen.length === 4) break;
    }
    const base = candidates[0];
    for (const offset of [30, -30, 160, 210, 90]) {
        if (chosen.length === 4) break;
        const color = { ...base, h: (base.h + offset + 360) % 360 };
        if (chosen.every((c) => hueDistance(c.h, color.h) >= 24))
            chosen.push(color);
    }
    return chosen
        .slice(0, 4)
        .map((c, i) =>
            hslToRgb(
                c.h,
                Math.max(0.55, Math.min(0.9, c.s)),
                Math.max(0.64, Math.min(0.76, c.l + (i % 2) * 0.04)),
            ),
        );
}

export function normalizeGeneratorComboColors(
    colors: readonly number[],
): number[] {
    const valid = [
        ...new Set(
            colors.filter(
                (c) => Number.isInteger(c) && c >= 0 && c <= 0xffffff,
            ),
        ),
    ].slice(0, 4);
    for (const color of GENERATOR_DEFAULT_COLORS) {
        if (valid.length === 4) break;
        if (!valid.includes(color)) valid.push(color);
    }
    return valid;
}
