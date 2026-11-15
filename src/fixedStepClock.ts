// Scheduling is deliberately separate from Pixi and the DOM, so the clock can
// be tested independently. A browser timer is not a real-time/thread guarantee.
export class FixedStepClock {
    readonly stepMs: number;
    remainder = 0;
    private lastTime = 0;
    private readonly maxSteps: number;

    constructor(hz = 240, maxSteps = 60) {
        this.stepMs = 1000 / hz;
        this.maxSteps = maxSteps;
    }

    reset(now: number): void {
        this.lastTime = now;
        this.remainder = 0;
    }

    advance(now: number, update: (deltaMs: number) => boolean | void): void {
        this.remainder += Math.max(0, now - this.lastTime);
        this.lastTime = now;
        const steps = Math.floor((this.remainder + 1e-7) / this.stepMs);
        if (!steps) return;
        this.remainder = Math.max(0, this.remainder - steps * this.stepMs);

        // A long main-thread stall cannot be replayed indefinitely. Advance
        // the old portion once, preserving song time, then simulate at most
        // 250ms of fixed steps. Hidden tabs are paused by the game loop.
        const skipped = Math.max(0, steps - this.maxSteps);
        if (skipped && update(skipped * this.stepMs) === false) {
            this.remainder = 0;
            return;
        }
        for (let i = skipped; i < steps; i++) {
            if (update(this.stepMs) === false) {
                // Audio beginning at this real instant rebases the song clock;
                // do not replay the remaining backlog ahead of the new audio.
                this.remainder = 0;
                return;
            }
        }
    }
}
