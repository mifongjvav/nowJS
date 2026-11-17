import type { GeneratorAnalysis } from "./generatorTypes.ts";

// Layout and .osu colour flags must agree on exactly which heads start combos.
// Sliders keep their head's colour, even when their tail crosses a bar.
export function getGeneratorComboStarts(
    objects: readonly { kind: string; time: number }[],
    analysis: Pick<GeneratorAnalysis, "bpm" | "offsetMs">,
): boolean[] {
    const barLength = (60000 / analysis.bpm) * 4;
    let previousBar: number | null = null,
        afterSpinner = false;
    return objects.map((object) => {
        if (object.kind === "bananaShower") {
            afterSpinner = true;
            return false;
        }
        const bar = Math.floor(
            (object.time - analysis.offsetMs + 0.5) / barLength,
        );
        const starts = previousBar !== bar || afterSpinner;
        previousBar = bar;
        afterSpinner = false;
        return starts;
    });
}
