import type { NormalInput } from "./simulation.ts";
export type RawInput =
    | { kind: "key"; code: string; down: boolean; stamp: number }
    | {
          kind: "pointer";
          clientX: number;
          left: number;
          cssWidth: number;
          width: number;
          playerWidth: number;
          fieldLeft?: number;
          fieldWidth?: number;
          stamp: number;
      };
const KEYS: Record<string, number> = { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3 };
export function normalizeInput(raw: RawInput): NormalInput | null {
    if (raw.kind === "key") {
        const lane = KEYS[raw.code];
        return lane === undefined
            ? null
            : { kind: "lane", lane, down: raw.down, stamp: raw.stamp };
    }
    if (!(raw.cssWidth > 0)) return null;
    const fieldLeft = raw.fieldLeft ?? 0;
    const fieldWidth = raw.fieldWidth ?? raw.width;
    return {
        kind: "pointer",
        stamp: raw.stamp,
        x: Math.max(
            fieldLeft,
            Math.min(
                fieldLeft + fieldWidth - raw.playerWidth,
                ((raw.clientX - raw.left) * raw.width) / raw.cssWidth -
                    raw.playerWidth / 2,
            ),
        ),
    };
}
