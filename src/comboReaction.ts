const FAST_SPEED = 2600;
const SLOW_SPEED = 700;
const SHOCK_MS = 650;
const RECOVER_MS = 450;

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

    get shocked() {
        return this.stopped !== null && this.age < SHOCK_MS;
    }

    reset() {
        this.sample = null;
        this.stopped = null;
        this.age = 0;
        this.slowTime = 0;
    }

    pause(x: number, y: number, time: number) {
        // Rebase velocity without advancing the reaction while paused.
        this.sample = { x, y, time };
        return this.position(x, y);
    }

    update(x: number, y: number, time: number, scale = 1) {
        const previous = this.sample;
        this.sample = { x, y, time };
        if (!previous || time <= previous.time) return this.position(x, y);
        const elapsed = time - previous.time;
        const speed =
            (Math.abs(x - previous.x) * 1000) / elapsed / Math.max(0.01, scale);
        if (!this.stopped && speed >= FAST_SPEED) {
            // Stop at the last followed position, not the plate's destination.
            this.stopped = { x: previous.x, y: previous.y };
            this.age = 0;
            this.slowTime = 0;
        } else if (this.stopped) {
            this.age += elapsed;
            this.slowTime = speed <= SLOW_SPEED ? this.slowTime + elapsed : 0;
            if (this.age >= SHOCK_MS && this.slowTime >= RECOVER_MS) {
                this.stopped = null;
            }
        }
        return this.position(x, y);
    }

    private position(x: number, y: number) {
        return {
            x: this.stopped?.x ?? x,
            y: this.stopped?.y ?? y,
            frozen: this.stopped !== null,
            shocked: this.shocked,
        };
    }
}
