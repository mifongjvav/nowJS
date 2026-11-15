// No browser DOM/events/accessibility extensions in the render worker.
import "../../node_modules/pixi.js/lib/environment-webworker/webworkerAll.mjs";
// Workers have their own prototypes/CSP; installing the no-eval compatibility
// implementation in the main document alone cannot fix worker rendering.
import "../../node_modules/pixi.js/lib/unsafe-eval/init.mjs";
export { DOMAdapter } from "../../node_modules/pixi.js/lib/environment/adapter.mjs";
export { WebWorkerAdapter } from "./pixi-worker-adapter.js";
export { Container } from "../../node_modules/pixi.js/lib/scene/container/Container.mjs";
export { Graphics } from "../../node_modules/pixi.js/lib/scene/graphics/shared/Graphics.mjs";
export { Sprite } from "../../node_modules/pixi.js/lib/scene/sprite/Sprite.mjs";
export { Text } from "../../node_modules/pixi.js/lib/scene/text/Text.mjs";
export { Texture } from "../../node_modules/pixi.js/lib/rendering/renderers/shared/texture/Texture.mjs";
export { Matrix } from "../../node_modules/pixi.js/lib/maths/matrix/Matrix.mjs";
export { BlurFilter } from "../../node_modules/pixi.js/lib/filters/defaults/blur/BlurFilter.mjs";
export { WebGLRenderer } from "../../node_modules/pixi.js/lib/rendering/renderers/gl/WebGLRenderer.mjs";
