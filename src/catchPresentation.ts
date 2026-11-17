// Display-only extrapolation. Physics and hit tests must never use this result.
export const CATCH_PRESENTATION_MAX_MS = 100;

export interface HorizontalMotion {
    /** Logical canvas pixels per millisecond. */
    velocity: number;
    minX: number;
    maxX: number;
    stopX?: number;
    wall: number;
    maxMs?: number;
}
export type HorizontalMotionBounds = Omit<HorizontalMotion, "wall" | "maxMs">;

export function projectHorizontalMotion(
    x: number,
    motion: HorizontalMotion,
    wall: number,
): number {
    const elapsed = Math.max(
        0,
        Math.min(motion.maxMs ?? CATCH_PRESENTATION_MAX_MS, wall - motion.wall),
    );
    let next = x + motion.velocity * elapsed;
    if (
        motion.stopX !== undefined &&
        ((motion.velocity > 0 && x <= motion.stopX && next >= motion.stopX) ||
            (motion.velocity < 0 && x >= motion.stopX && next <= motion.stopX))
    ) {
        next = motion.stopX;
    }
    return Math.max(motion.minX, Math.min(motion.maxX, next));
}

export class CatchPresentation {
    private sampleX = 0;
    private sampleWall = -Infinity;
    private inputX = 0;
    private inputWall = -Infinity;

    reset(x: number, wall: number) {
        this.sampleX = this.inputX = x;
        this.sampleWall = this.inputWall = wall;
    }

    sample(x: number, wall: number) {
        if (wall < this.sampleWall) return;
        this.sampleX = x;
        this.sampleWall = wall;
    }

    input(motion: HorizontalMotionBounds, wall: number) {
        // Keep a new press/release responsive even while an older worker
        // snapshot is still in transit. No easing/inertia on direction changes.
        this.inputX = this.frame(motion, wall).x;
        this.inputWall = wall;
    }

    frame(motion: HorizontalMotionBounds, wall: number) {
        const useSample = this.sampleWall >= this.inputWall;
        const baseX = useSample ? this.sampleX : this.inputX;
        const baseWall = useSample ? this.sampleWall : this.inputWall;
        const age = Math.max(
            0,
            Math.min(CATCH_PRESENTATION_MAX_MS, wall - baseWall),
        );
        return {
            x: projectHorizontalMotion(
                baseX,
                { ...motion, wall: baseWall },
                wall,
            ),
            // The render worker may finish the remaining budget, not add a
            // second full prediction window on top of the main thread's.
            remainingMs: CATCH_PRESENTATION_MAX_MS - age,
        };
    }
}
