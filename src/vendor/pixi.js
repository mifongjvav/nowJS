// Centralised dependency entry point.
// Import only the symbols this work uses. Importing pixi.js/lib/index.mjs
// would pull in the browser/webworker extensions, whose dynamic imports make
// Vite emit a MOSS-incompatible preload helper.
import "../../node_modules/pixi.js/lib/environment-browser/browserAll.mjs";
// Despite its name, this official compatibility module REPLACES generated
// Function/eval-based shader sync code with interpreters for strict CSP.
import "../../node_modules/pixi.js/lib/unsafe-eval/init.mjs";

export { Container } from "../../node_modules/pixi.js/lib/scene/container/Container.mjs";
export { Graphics } from "../../node_modules/pixi.js/lib/scene/graphics/shared/Graphics.mjs";
export { Sprite } from "../../node_modules/pixi.js/lib/scene/sprite/Sprite.mjs";
export { Text } from "../../node_modules/pixi.js/lib/scene/text/Text.mjs";
export { Texture } from "../../node_modules/pixi.js/lib/rendering/renderers/shared/texture/Texture.mjs";
export { VideoSource } from "../../node_modules/pixi.js/lib/rendering/renderers/shared/texture/sources/VideoSource.mjs";
export { Rectangle } from "../../node_modules/pixi.js/lib/maths/shapes/Rectangle.mjs";
export { BlurFilter } from "../../node_modules/pixi.js/lib/filters/defaults/blur/BlurFilter.mjs";
export { WebGLRenderer } from "../../node_modules/pixi.js/lib/rendering/renderers/gl/WebGLRenderer.mjs";
export { WebGPURenderer } from "../../node_modules/pixi.js/lib/rendering/renderers/gpu/WebGPURenderer.mjs";
export { CanvasRenderer } from "../../node_modules/pixi.js/lib/rendering/renderers/canvas/CanvasRenderer.mjs";
export { Ticker } from "../../node_modules/pixi.js/lib/ticker/Ticker.mjs";
export { UPDATE_PRIORITY } from "../../node_modules/pixi.js/lib/ticker/const.mjs";
export { isWebGLSupported } from "../../node_modules/pixi.js/lib/utils/browser/isWebGLSupported.mjs";

// Symbols used by @pixi/sound. Exporting them here lets the Vite alias below
// resolve its `pixi.js` imports without loading the full pixi.js entrypoint.
export {
    ExtensionType,
    extensions,
} from "../../node_modules/pixi.js/lib/extensions/Extensions.mjs";
export { LoaderParserPriority } from "../../node_modules/pixi.js/lib/assets/loader/parsers/LoaderParser.mjs";
export { path } from "../../node_modules/pixi.js/lib/utils/path.mjs";
export { default as EventEmitter } from "eventemitter3";
export { CanvasSource } from "../../node_modules/pixi.js/lib/rendering/renderers/shared/texture/sources/CanvasSource.mjs";
export { DOMAdapter } from "../../node_modules/pixi.js/lib/environment/adapter.mjs";
