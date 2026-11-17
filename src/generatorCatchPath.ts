import { getGeneratorDifficulty } from "./generatorDifficulty.ts";
import { planGeneratorPhrases } from "./generatorPhrases.ts";
import {
    createLearnedCatchPath,
    validateMovementOptions,
} from "./generatorLearnedMovement.ts";
import type { GeneratorAnalysis, GeneratorOptions } from "./generatorTypes.ts";

const LEFT = 32;
const RIGHT = 480;
const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));

export function createGeneratorCatchPath(
    analysis: GeneratorAnalysis,
    options: Partial<GeneratorOptions>,
) {
    validateMovementOptions(options);
    if (options.movementModel === "learned")
        return createLearnedCatchPath(analysis, options);
    const profile = getGeneratorDifficulty(options);
    const beat = 60000 / analysis.bpm;
    const growth = Math.log2(profile.level);
    const phrases = planGeneratorPhrases(analysis);
    let center = 256,
        previousSection = 0;
    const plans = phrases.map((phrase) => {
        if (phrase.section !== previousSection) {
            // Region changes need a detected musical contrast. Their size is
            // not a global playfield-coverage quota or a periodic destination.
            const shift =
                Math.min(110, 40 + growth * 12) * (0.4 + phrase.change * 0.6);
            let sign = phrase.brightnessChange >= 0 ? 1 : -1;
            if (center + sign * shift < 120 || center + sign * shift > 392)
                sign *= -1;
            center = clamp(center + sign * shift, 120, 392);
            previousSection = phrase.section;
        }
        return {
            ...phrase,
            center,
            radius:
                Math.min(210, 26 + growth * 26) * (0.35 + phrase.energy * 0.65),
        };
    });
    const sample = (at: number) => {
        let low = 0,
            high = plans.length;
        while (low < high) {
            const mid = (low + high) >>> 1;
            if (plans[mid].start <= at + beat * 0.12) low = mid + 1;
            else high = mid;
        }
        const phrase = plans[Math.max(0, low - 1)];
        if (!phrase) return { x: 256, accent: false };
        const events = phrase.events;
        let i = 0;
        // Phrase size is bounded by one bar; this isn't a whole-song scan.
        while (i + 1 < events.length && events[i + 1].time <= at) i++;
        const event = events[i],
            next = events[i + 1];
        let offset = event.offset;
        if (next && at > event.time) {
            const fraction = clamp(
                (at - event.time) / Math.max(1, next.time - event.time),
                0,
                1,
            );
            offset += (next.offset - offset) * fraction;
        } else if (!next && at - event.time > beat * 0.2) {
            offset *= Math.max(0, 1 - (at - event.time - beat * 0.2) / beat);
        }
        return {
            x: clamp(
                phrase.center + offset * phrase.radius,
                LEFT + 8,
                RIGHT - 8,
            ),
            accent: event.accent && Math.abs(at - event.time) < beat * 0.18,
        };
    };
    let x = 256,
        time = -Infinity,
        fast = false;
    return {
        place(nextTime: number) {
            const target = sample(nextTime);
            const elapsed = Math.max(0, nextTime - time);
            const reach =
                elapsed * profile.spacing * (fast && !target.accent ? 0.7 : 1);
            const next = Math.round(x + clamp(target.x - x, -reach, reach));
            fast =
                Number.isFinite(time) &&
                Math.abs(next - x) / Math.max(1, elapsed) > 0.65;
            x = next;
            time = nextTime;
            return x;
        },
        extend(length: number, endTime: number) {
            const target = sample(endTime).x;
            // Slider duration and horizontal travel are different decisions.
            // A vertical/bent path can sustain a voice without sweeping the
            // catcher across the entire field for the duration of the sound.
            const reach = Math.min(
                length,
                Math.max(0, endTime - time) * profile.spacing,
            );
            x = clamp(
                Math.round(target),
                Math.max(LEFT, Math.ceil(x - reach)),
                Math.min(RIGHT, Math.floor(x + reach)),
            );
            time = endTime;
            fast = false;
            return x;
        },
        afterShower(endTime: number) {
            x = 256;
            time = endTime;
            fast = false;
        },
    };
}
