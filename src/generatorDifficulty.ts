import { GeneratorError } from "./generatorTypes.ts";
import type { GeneratorOptions } from "./generatorTypes.ts";

// A generation control, NOT an osu! star rating. There is no product-level
// ceiling; audio evidence, integer timestamps and the four lanes remain finite.
export function getGeneratorDifficulty(options: Partial<GeneratorOptions>) {
    const level =
        options.difficulty ??
        { easy: 1, normal: 2, hard: 4 }[options.density ?? "easy"];
    if (!Number.isFinite(level) || level < 1)
        throw new GeneratorError("difficulty");
    const growth = Math.log2(level);
    const complexity = 1 - 1 / Math.sqrt(level);
    return {
        level,
        complexity,
        // Keep movement demand growing after AR/CS reach their format limits.
        // Only rhythm resolution is bounded by the finite audio/timestamp grid.
        divisions: 2 ** Math.min(6, Math.floor(growth)),
        spacing: 0.12 + growth * 0.18,
        travel: 42 + growth * 30,
        circleSize: 2.5 + complexity * 3.5,
        approachRate: Math.min(10, 4 + growth * 1.65),
        hp: Math.min(9, 2 + growth * 1.2),
        name:
            level < 2
                ? "Easy"
                : level < 3
                  ? "Normal"
                  : level < 4
                    ? "Hard"
                    : level < 6
                      ? "Insane"
                      : "Expert",
    };
}
