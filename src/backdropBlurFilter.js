// Selective, environment-neutral imports: this module also runs in the worker.
import { Filter } from "../node_modules/pixi.js/lib/filters/Filter.mjs";
import { BlurFilter } from "../node_modules/pixi.js/lib/filters/defaults/blur/BlurFilter.mjs";
import { GlProgram } from "../node_modules/pixi.js/lib/rendering/renderers/gl/shader/GlProgram.mjs";
import { GpuProgram } from "../node_modules/pixi.js/lib/rendering/renderers/gpu/shader/GpuProgram.mjs";
import { Texture } from "../node_modules/pixi.js/lib/rendering/renderers/shared/texture/Texture.mjs";
import { TexturePool } from "../node_modules/pixi.js/lib/rendering/renderers/shared/texture/TexturePool.mjs";
import vertex from "../node_modules/pixi.js/lib/filters/defaults/defaultFilter.vert.mjs";
import passthrough from "../node_modules/pixi.js/lib/filters/defaults/passthrough/passthrough.wgsl.mjs";

const fragment = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uBackground;
void main() {
    vec4 front = texture(uTexture, vTextureCoord);
    if (front.a == 0.0) discard;
    vec4 back = texture(uBackground, vTextureCoord);
    finalColor = front + back * (1.0 - front.a);
}`;
// Pixi's binding reflector expects var<uniform>, without a separating space.
const wgsl = `${passthrough.slice(0, passthrough.indexOf("@fragment")).replace("var <uniform>", "var<uniform>")}
@group(1) @binding(0) var uBackground: texture_2d<f32>;
@fragment
fn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    let front = textureSample(uTexture, uSampler, uv);
    if (front.a == 0.0) { discard; }
    let back = textureSample(uBackground, uSampler, uv);
    return front + back * (1.0 - front.a);
}`;

// Blur only the captured pixels BEHIND the object. Its geometry, head/tail
// highlights and text are composited at the original renderer resolution.
export class BackdropBlurFilter extends Filter {
    constructor(strength = 6) {
        super({
            glProgram: GlProgram.from({
                vertex,
                fragment,
                name: "nowjs-backdrop-blur",
            }),
            gpuProgram: GpuProgram.from({
                vertex: { source: wgsl, entryPoint: "mainVertex" },
                fragment: { source: wgsl, entryPoint: "mainFragment" },
            }),
            resources: { uBackground: Texture.WHITE.source },
            blendRequired: true,
            resolution: "inherit",
            padding: Math.ceil(strength * 3),
        });
        this.backdropBlur = true;
        this.strength = strength;
        this.blurPass = new BlurFilter({
            strength,
            quality: 2,
            kernelSize: 9,
            resolution: "inherit",
        });
        this.blurPass.repeatEdgePixels = true;
    }

    apply(filterSystem, input, output, clearMode) {
        const background = filterSystem.activeBackTexture;
        const blurred = TexturePool.getSameSizeTexture(background);
        try {
            this.blurPass.apply(filterSystem, background, blurred, true);
            this.resources.uBackground = blurred.source;
            filterSystem.applyFilter(this, input, output, clearMode);
        } finally {
            this.resources.uBackground = Texture.WHITE.source;
            TexturePool.returnTexture(blurred);
        }
    }

    destroy() {
        this.blurPass.destroy();
        super.destroy();
    }
}
