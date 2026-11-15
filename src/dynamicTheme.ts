import {
    getColorFromImage,
    removeColorScheme,
    setColorScheme,
} from "./vendor/mdui.js";

const DEFAULT_THEME_COLOR = "#0b1416";

let requestId = 0;
let activeBackground: string | null = null;

function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.decoding = "async";
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("background image load failed"));
        image.src = url;
    });
}

function updateThemeMeta(color: string | null): void {
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", color || DEFAULT_THEME_COLOR);
}

export async function applyThemeFromBackground(
    backgroundUrl: string | null | undefined,
): Promise<void> {
    const url = backgroundUrl || null;
    if (url === activeBackground) return;

    const token = ++requestId;
    activeBackground = url;

    if (!url) {
        removeColorScheme();
        updateThemeMeta(null);
        return;
    }

    try {
        const image = await loadImage(url);
        if (token !== requestId) return;

        const color = await getColorFromImage(image);
        if (token !== requestId) return;

        setColorScheme(color);
        updateThemeMeta(color);
    } catch (error) {
        if (token !== requestId) return;
        console.warn("无法从谱面背景提取主题色", error);
        removeColorScheme();
        updateThemeMeta(null);
    }
}

export function resetThemeFromBackground(): void {
    requestId += 1;
    activeBackground = null;
    removeColorScheme();
    updateThemeMeta(null);
}
