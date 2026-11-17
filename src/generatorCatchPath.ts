import { getGeneratorDifficulty } from "./generatorDifficulty.ts";
import type { GeneratorAnalysis, GeneratorOptions } from "./generatorTypes.ts";

// Alternating, translated phrase destinations. Unlike a closed +/- motif,
// these do not return to x=256 every eight notes. Quiet passages can explore
// the whole field slowly; difficult passages traverse it in fewer accents.
const anchors = [64, 448, 144, 464, 80, 400, 48, 352];
const LEFT = 32;
const RIGHT = 480;
const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));

export function createGeneratorCatchPath(
    analysis: Pick<GeneratorAnalysis, "bpm" | "offsetMs">,
    options: Partial<GeneratorOptions>,
) {
    const profile = getGeneratorDifficulty(options);
    const beat = 60000 / analysis.bpm;
    const growth = Math.log2(profile.level);
    let x = 256,
        time = -Infinity,
        goalIndex = 0,
        direction = 1,
        lastPhrase = -Infinity,
        index = 0;

    return {
        place(nextTime: number, strength = 0.5, brightness = 0.1) {
            const phrase = Math.floor(
                (nextTime - analysis.offsetMs) / (8 * beat),
            );
            if (!Number.isFinite(time)) {
                goalIndex = Math.max(0, phrase) % anchors.length;
                x = anchors[goalIndex];
                goalIndex++;
            }
            if (phrase !== lastPhrase) {
                goalIndex = Math.max(goalIndex, Math.max(0, phrase));
                lastPhrase = phrase;
            }
            const reach = Math.min(
                RIGHT - LEFT,
                Math.max(0, nextTime - time) * profile.spacing,
            );
            const emphasis = 0.85 + clamp(strength, 0, 1) * 0.3;
            const stride = Math.min(reach, profile.travel * emphasis);
            let target = anchors[goalIndex % anchors.length];
            if (Math.abs(target - x) < 12) {
                goalIndex++;
                target = anchors[goalIndex % anchors.length];
            }
            // Deliberate accent changes, not independent random fruit. More
            // demanding settings add wide counterflow/dash patterns while
            // long runs still travel across translated phrase anchors.
            const counterflow =
                growth >= 2 &&
                index % Math.max(2, Math.round(7 - Math.min(4, growth))) ===
                    0 &&
                strength >= 0.45;
            if (counterflow) {
                const margin = 52 + clamp(brightness, 0, 1) * 24;
                target = x < 256 ? 512 - margin : margin;
            }
            const dx = target - x;
            direction = Math.sign(dx) || direction;
            x = Math.round(
                clamp(
                    x + direction * Math.min(stride, Math.abs(dx)),
                    LEFT,
                    RIGHT,
                ),
            );
            time = nextTime;
            index++;
            return x;
        },

        // Preserve the authored flow through sliders. A tail can continue
        // toward either edge; reverse only when it would leave the field.
        extend(length: number, endTime: number) {
            if (x + direction * length < LEFT || x + direction * length > RIGHT)
                direction *= -1;
            x = Math.round(clamp(x + direction * length, LEFT, RIGHT));
            time = endTime;
            return x;
        },

        afterShower(endTime: number) {
            x = 256;
            time = endTime;
        },
    };
}
