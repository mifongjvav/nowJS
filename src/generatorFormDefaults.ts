import type { GeneratorOptions } from "./generatorTypes.ts";

// Fresh UI sessions use the new Catch layout. An imported configuration
// without these fields predates it and must keep the old rule-based choice.
// This is a form default, not a silent change to the programmatic API.
export function getGeneratorFormMovement(
    restored?: Pick<GeneratorOptions, "movementModel" | "modelSeed">,
): { movementModel: "phrases" | "learned"; modelSeed: number } {
    return {
        movementModel: restored
            ? (restored.movementModel ?? "phrases")
            : "learned",
        modelSeed: restored?.modelSeed ?? 1,
    };
}
