import { fileURLToPath, URL } from "node:url";

export default {
    base: "./",
    resolve: {
        alias: [
            {
                // @pixi/sound imports the full pixi.js entrypoint, which pulls
                // in dynamic environment imports and Vite's preload helper.
                // Point it at the selective vendor entry instead.
                find: /^pixi\.js$/,
                replacement: fileURLToPath(
                    new URL("./src/vendor/pixi.js", import.meta.url),
                ),
            },
            {
                // Drop PixiJS's console banner and its remote-looking URL.
                find: /utils\/sayHello\.mjs$/,
                replacement: fileURLToPath(
                    new URL("./src/vendor/pixi-say-hello.js", import.meta.url),
                ),
            },
            {
                // MDUI's icon component pulls in XHR for remote icon URLs.
                // MOSS has no XHR; the work only uses local/slotted SVG icons.
                find: /^@mdui\/jq\/functions\/ajax\.js$/,
                replacement: fileURLToPath(
                    new URL("./src/vendor/mdui-ajax.js", import.meta.url),
                ),
            },
        ],
    },
    build: {
        outDir: "dist",
        target: "es2022",
        // MOSS resolves package files itself, so the Vite preload helper's
        // computed new URL()/import.meta.resolve does not belong in the ZIP.
        modulePreload: false,
        rolldownOptions: {
            output: {
                codeSplitting: false,
            },
        },
    },
};
