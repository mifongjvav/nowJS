// This renderer consumes Graphics/Text and already-decoded ImageBitmaps from
// the main thread, not XML/SVG source. Pixi's generic WebWorkerAdapter imports
// the CommonJS @xmldom/xmldom package, which Vite's dev worker graph may serve
// as native ESM without its named DOMParser export. Keep this adapter ESM-only.
export function createRenderWorkerAdapter(scope = globalThis) {
    return {
        createCanvas: (width = 0, height = 0) =>
            new scope.OffscreenCanvas(width, height),
        createImage: () => {
            if (typeof scope.Image !== "function")
                throw new Error(
                    "Decode images on the main thread and transfer an ImageBitmap to the render worker",
                );
            return new scope.Image();
        },
        getCanvasRenderingContext2D: () =>
            scope.OffscreenCanvasRenderingContext2D,
        getWebGLRenderingContext: () => scope.WebGLRenderingContext,
        getNavigator: () => scope.navigator,
        getBaseUrl: () => scope.location.href,
        getFontFaceSet: () => scope.fonts ?? null,
        fetch: (url, options) => scope.fetch(url, options),
        parseXML: (xml) => {
            if (typeof scope.DOMParser !== "function")
                throw new Error(
                    "Parse XML/SVG on the main thread before transferring decoded assets to the render worker",
                );
            return new scope.DOMParser().parseFromString(xml, "text/xml");
        },
    };
}

export const WebWorkerAdapter = createRenderWorkerAdapter();
