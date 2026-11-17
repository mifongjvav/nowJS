const WINDOW_MS = 1000;
const FAST_DISTANCE = 2600;
const SLOW_DISTANCE = 700;
const SHOCK_MS = 650;
const RECOVER_MS = 450;
const JUMP_MS = 360;

interface Sample {
    x: number;
    y: number;
    time: number;
}

// Presentation only: this never changes the actual combo or judgements.
export class ComboReaction {
    private sample: Sample | null = null;
    private stopped: { x: number; y: number } | null = null;
    private age = 0;
    private slowTime = 0;
    private scale = 1;
    private center: { x: number; y: number };
    private travel: { start: number; end: number; distance: number }[] = [];

    constructor(centerX: number, centerY: number) {
        this.center = { x: centerX, y: centerY };
    }

    get shocked() {
        return this.stopped !== null && this.age < SHOCK_MS;
    }

    reset() {
        this.sample = null;
        this.stopped = null;
        this.age = 0;
        this.slowTime = 0;
        this.travel = [];
    }

    pause(x: number, y: number, time: number) {
        // Rebase velocity without advancing the reaction while paused.
        this.sample = { x, y, time };
        this.travel = [];
        this.slowTime = 0;
        return this.position(x, y);
    }

    update(x: number, y: number, time: number, scale = 1) {
        this.scale = Math.max(0.01, scale);
        const previous = this.sample;
        this.sample = { x, y, time };
        if (!previous || time <= previous.time) return this.position(x, y);
        const elapsed = time - previous.time;
        this.travel.push({
            start: previous.time,
            end: time,
            distance: Math.abs(x - previous.x) / this.scale,
        });
        const cutoff = time - WINDOW_MS;
        this.travel = this.travel.filter((segment) => segment.end > cutoff);
        // Sum absolute travel (including backtracking), clipping the oldest
        // segment to the sliding window rather than resetting once a second.
        const distance = this.travel.reduce(
            (sum, segment) =>
                sum +
                segment.distance *
                    ((segment.end - Math.max(segment.start, cutoff)) /
                        (segment.end - segment.start)),
            0,
        );
        if (!this.stopped && distance >= FAST_DISTANCE) {
            this.stopped = { ...this.center };
            this.age = 0;
            this.slowTime = 0;
        } else if (this.stopped) {
            this.age += elapsed;
            this.slowTime =
                distance <= SLOW_DISTANCE ? this.slowTime + elapsed : 0;
            if (this.age >= SHOCK_MS && this.slowTime >= RECOVER_MS) {
                this.stopped = null;
            }
        }
        return this.position(x, y);
    }

    private position(x: number, y: number) {
        const jump = this.shocked
            ? Math.sin(Math.PI * Math.min(1, this.age / JUMP_MS)) * 32
            : 0;
        // The jump height scales with the canvas just like the text itself.
        return {
            x: this.stopped?.x ?? x,
            y: (this.stopped?.y ?? y) - jump * this.scale,
            frozen: this.stopped !== null,
            shocked: this.shocked,
        };
    }
}
