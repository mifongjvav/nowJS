export const RENDERER_OPTIONS = [
    "auto",
    "webgpu",
    "webgl2",
    "webgl1",
    "canvas",
] as const;

export type RendererSetting = (typeof RENDERER_OPTIONS)[number];
export type RendererKind = "webgpu" | "webgl" | "canvas";

export interface RendererAttempt {
    kind: RendererKind;
    preferWebGLVersion?: 1 | 2;
    requireWebGLVersion?: 1 | 2;
}

export function isRendererSetting(value: unknown): value is RendererSetting {
    return (
        typeof value === "string" &&
        (RENDERER_OPTIONS as readonly string[]).includes(value)
    );
}

// Explicit choices get a best-effort fallback chain; "auto" keeps the old
// preferred-WebGL2→WebGL1→Canvas behavior. Version-specific attempts verify
// the actual context version because Pixi's WebGL renderer can silently fall
// back from WebGL2 to WebGL1.
export function getRendererAttempts(
    setting: RendererSetting,
): RendererAttempt[] {
    switch (setting) {
        case "canvas":
            return [{ kind: "canvas" }];
        case "webgl1":
            return [
                {
                    kind: "webgl",
                    preferWebGLVersion: 1,
                    requireWebGLVersion: 1,
                },
                { kind: "canvas" },
            ];
        case "webgl2":
            return [
                {
                    kind: "webgl",
                    preferWebGLVersion: 2,
                    requireWebGLVersion: 2,
                },
                {
                    kind: "webgl",
                    preferWebGLVersion: 1,
                    requireWebGLVersion: 1,
                },
                { kind: "canvas" },
            ];
        case "webgpu":
            return [
                { kind: "webgpu" },
                { kind: "webgl", preferWebGLVersion: 2 },
                { kind: "canvas" },
            ];
        default:
            return [
                { kind: "webgl", preferWebGLVersion: 2 },
                { kind: "canvas" },
            ];
    }
}

interface RendererLike {
    name?: string;
    context?: { webGLVersion?: number };
}

export function getActiveRendererLabel(
    renderer: RendererLike | null | undefined,
): string {
    if (!renderer) return "—";
    if (renderer.name === "webgl") {
        return renderer.context?.webGLVersion === 1 ? "WebGL 1" : "WebGL 2";
    }
    if (renderer.name === "webgpu") return "WebGPU";
    if (renderer.name === "canvas") return "Canvas";
    return renderer.name || "—";
}
