import { removeColorScheme, setColorScheme } from "./vendor/mdui.js";
import { resetRuntimeThemeColors, setRuntimeThemeColors } from "./theme.ts";
import { getSettings, onSettingsChange } from "./settings.ts";

const DEFAULT_THEME_COLOR = "#0b1416";
const SAMPLE_SIZE = 64;
const HUE_BINS = 12;

let requestId = 0;
let activeBackground: string | null = null;
let requestedBackground: string | null = null;
let requestedImage: HTMLImageElement | null = null;
let sampleCanvas: HTMLCanvasElement | null = null;
let sampleContext: CanvasRenderingContext2D | null = null;

function clampChannel(value: number): number {
    return Math.max(0, Math.min(255, Math.round(value)));
}

function toHex(red: number, green: number, blue: number): string {
    return `#${((1 << 24) | (red << 16) | (green << 8) | blue)
        .toString(16)
        .slice(1)}`;
}

function getSampleContext(): CanvasRenderingContext2D | null {
    if (sampleContext) return sampleContext;
    if (typeof document === "undefined") return null;

    sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = SAMPLE_SIZE;
    sampleCanvas.height = SAMPLE_SIZE;
    sampleContext = sampleCanvas.getContext("2d", {
        willReadFrequently: true,
    });
    return sampleContext;
}

function getHue(red: number, green: number, blue: number): number {
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const delta = max - min;
    if (delta === 0) return 0;

    let hue;
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;

    hue *= 60;
    return hue < 0 ? hue + 360 : hue;
}

function extractDominantColor(image: HTMLImageElement): string {
    const context = getSampleContext();
    if (!context) return DEFAULT_THEME_COLOR;

    context.clearRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

    const data = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
    const bins = Array.from({ length: HUE_BINS }, () => ({
        weight: 0,
        red: 0,
        green: 0,
        blue: 0,
    }));
    let fallbackRed = 0;
    let fallbackGreen = 0;
    let fallbackBlue = 0;
    let fallbackWeight = 0;

    for (let index = 0; index < data.length; index += 4) {
        const alpha = data[index + 3];
        if (alpha < 128) continue;

        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        const max = Math.max(red, green, blue);
        const min = Math.min(red, green, blue);
        const lightness = (max + min) / 510;

        // Ignore transparent, near-black, near-white and washed-out pixels.
        if (lightness < 0.08 || lightness > 0.95) continue;

        const delta = (max - min) / 255;
        const saturation =
            delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
        const fallbackPixelWeight = 0.5 + (1 - Math.abs(lightness - 0.55));

        fallbackWeight += fallbackPixelWeight;
        fallbackRed += red * fallbackPixelWeight;
        fallbackGreen += green * fallbackPixelWeight;
        fallbackBlue += blue * fallbackPixelWeight;

        if (saturation < 0.12) continue;

        // Prefer mid-tone, colourful pixels while still accounting for area.
        const weight =
            saturation * (0.75 + 0.25 * (1 - Math.abs(lightness - 0.55)));
        const hue = getHue(red, green, blue);
        const binIndex = Math.floor(hue / (360 / HUE_BINS)) % HUE_BINS;
        const bin = bins[binIndex];

        bin.weight += weight;
        bin.red += red * weight;
        bin.green += green * weight;
        bin.blue += blue * weight;
    }

    let selected = null;
    for (const bin of bins) {
        if (!selected || bin.weight > selected.weight) selected = bin;
    }

    if (!selected || selected.weight <= 0.001) {
        if (fallbackWeight <= 0.001) return DEFAULT_THEME_COLOR;
        return toHex(
            clampChannel(fallbackRed / fallbackWeight),
            clampChannel(fallbackGreen / fallbackWeight),
            clampChannel(fallbackBlue / fallbackWeight),
        );
    }

    const averageRed = selected.red / selected.weight;
    const averageGreen = selected.green / selected.weight;
    const averageBlue = selected.blue / selected.weight;
    const gray =
        averageRed * 0.299 + averageGreen * 0.587 + averageBlue * 0.114;
    const saturationBoost = 1.2;

    return toHex(
        clampChannel(gray + (averageRed - gray) * saturationBoost),
        clampChannel(gray + (averageGreen - gray) * saturationBoost),
        clampChannel(gray + (averageBlue - gray) * saturationBoost),
    );
}

function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.decoding = "async";
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("background image load failed"));
        image.src = url;
    });
}

function parseCssColor(value: string): number | null {
    const parts = value
        .trim()
        .split(/\s*,\s*/)
        .map((part) => Number(part));
    if (parts.length < 3 || !parts.slice(0, 3).every(Number.isFinite)) {
        return null;
    }

    const red = clampChannel(parts[0]);
    const green = clampChannel(parts[1]);
    const blue = clampChannel(parts[2]);
    return (red << 16) | (green << 8) | blue;
}

function applyMduiPaletteToPixi(): void {
    const style = getComputedStyle(document.documentElement);
    const read = (name: string): number | null =>
        parseCssColor(style.getPropertyValue(`--mdui-color-${name}`)) ??
        parseCssColor(style.getPropertyValue(`--mdui-color-${name}-dark`));

    const colors: Record<string, number> = {};
    for (const name of [
        "primary",
        "on-primary",
        "primary-container",
        "on-primary-container",
        "secondary",
        "on-secondary",
        "secondary-container",
        "on-secondary-container",
        "tertiary",
        "error",
        "surface",
        "on-surface",
        "on-surface-variant",
        "outline-variant",
    ]) {
        const color = read(name);
        if (color === null) continue;
        const key = name.replace(/-([a-z])/g, (_, letter) =>
            letter.toUpperCase(),
        );
        colors[key] = color;
    }

    if (Object.keys(colors).length > 0) {
        setRuntimeThemeColors(colors);
    }
}

function updateThemeMeta(color: string | null): void {
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", color || DEFAULT_THEME_COLOR);
}

export async function applyThemeFromBackground(
    backgroundUrl: string | null | undefined,
    image?: HTMLImageElement | null,
): Promise<void> {
    requestedBackground = backgroundUrl || null;
    requestedImage = image || null;
    if (!getSettings().dynamicColors) {
        clearTheme();
        return;
    }
    const url = backgroundUrl || null;
    if (url === activeBackground) return;

    const token = ++requestId;
    activeBackground = url;

    if (!url) {
        removeColorScheme();
        resetRuntimeThemeColors();
        updateThemeMeta(null);
        return;
    }

    try {
        let source = image;
        if (!source || !source.complete || !source.naturalWidth) {
            source = await loadImage(url);
            if (token !== requestId) return;
        }

        const color = extractDominantColor(source);
        if (token !== requestId) return;

        setColorScheme(color);
        applyMduiPaletteToPixi();
        updateThemeMeta(color);
    } catch (error) {
        if (token !== requestId) return;
        activeBackground = null;
        console.warn("无法从谱面背景提取主题色", error);
        removeColorScheme();
        resetRuntimeThemeColors();
        updateThemeMeta(null);
    }
}

export function resetThemeFromBackground(): void {
    requestedBackground = null;
    requestedImage = null;
    clearTheme();
}

function clearTheme(): void {
    requestId += 1;
    activeBackground = null;
    removeColorScheme();
    resetRuntimeThemeColors();
    updateThemeMeta(null);
}

let dynamicColorsEnabled = getSettings().dynamicColors;
onSettingsChange((settings) => {
    if (dynamicColorsEnabled === settings.dynamicColors) return;
    dynamicColorsEnabled = settings.dynamicColors;
    if (!dynamicColorsEnabled) clearTheme();
    else void applyThemeFromBackground(requestedBackground, requestedImage);
});
