import { CATCH_WINDOW_MS as WINDOW } from "../judgement.ts";
import { CatchMovement } from "../catchMovement.ts";
import type { CatchMovementState, HyperTarget } from "../catchMovement.ts";
import {
    AUTOPLAY_BANANA_MAX_SPEED,
    AUTOPLAY_BANANA_OMEGA,
    AUTOPLAY_BANANA_ZETA,
    AUTOPLAY_FRUIT_MAX_SPEED,
    AUTOPLAY_FRUIT_OMEGA,
    AUTOPLAY_FRUIT_ZETA,
    AUTOPLAY_TELEPORT_DISTANCE_RATIO,
    AUTOPLAY_TELEPORT_URGENT_MS,
} from "../autoplayTuning.ts";
export interface SimNote {
    time: number;
    x: number;
    type: string;
    lane?: number;
    holdEndTime?: number;
    hyperDashTarget?: HyperTarget;
}
export interface SimConfig {
    notes: SimNote[];
    preemptMs: number;
    mania: boolean;
    tails: boolean;
    auto: boolean;
    width: number;
    playerWidth: number;
    fieldLeft: number;
    fieldWidth: number;
    scale: number;
    catchKeyboard?: boolean;
    catchState?: CatchMovementState;
}
export type SimEvent = {
    kind: "spawn" | "hit" | "miss" | "tail" | "release";
    id: number;
};
export type NormalInput = (
    | { kind: "lane"; lane: number; down: boolean; stamp: number }
    | { kind: "pointer"; x: number; stamp: number }
    | {
          kind: "catch";
          left: boolean;
          right: boolean;
          dash: boolean;
          stamp: number;
      }
) & { direct?: boolean; session?: number };
const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, v));

// No DOM, Pixi, sound, or window state: this is the authoritative worker-side
// judgement/movement model. Presentation consumes its ordered event stream.
export class Simulation {
    time = 0;
    next = 0;
    playerX = 0;
    velocity = 0;
    active = new Map<number, boolean>();
    events: SimEvent[] = [];
    config: SimConfig;
    catchMovement = new CatchMovement();
    constructor(config: SimConfig) {
        this.config = config;
        this.playerX = (config.width - config.playerWidth) / 2;
    }
    reset(
        time: number,
        next = 0,
        playerX = this.playerX,
        active: [number, boolean][] = [],
    ): void {
        this.time = time;
        this.next = next;
        this.playerX = playerX;
        this.active = new Map(active);
        this.events = [];
        this.velocity = 0;
        this.catchMovement.restore(this.config.catchState);
    }
    private event(kind: SimEvent["kind"], id: number): void {
        this.events.push({ kind, id });
    }
    private hit(id: number): void {
        const note = this.config.notes[id];
        if (!this.config.mania && !this.config.auto) {
            this.catchMovement.judge(
                note,
                true,
                ((this.playerX +
                    this.config.playerWidth / 2 -
                    this.config.fieldLeft) /
                    this.config.fieldWidth) *
                    512,
            );
        }
        this.event("hit", id);
        if (
            this.config.mania &&
            this.config.tails &&
            (note.holdEndTime ?? note.time) > note.time
        )
            this.active.set(id, true);
        else this.active.delete(id);
    }
    input(input: NormalInput, time: number): void {
        if (input.kind === "catch") {
            if (!this.config.mania && !this.config.auto) {
                const state = this.catchMovement.state;
                state.left = input.left;
                state.right = input.right;
                state.dash = input.dash;
            }
            return;
        }
        if (input.kind === "pointer") {
            if (
                !this.config.auto &&
                !this.config.mania &&
                !this.config.catchKeyboard
            ) {
                const minX =
                    this.config.fieldLeft - this.config.playerWidth / 2;
                const maxX =
                    this.config.fieldLeft +
                    this.config.fieldWidth -
                    this.config.playerWidth / 2;
                this.playerX = clamp(input.x, minX, maxX);
            }
            return;
        }
        if (!this.config.mania || this.config.auto) return;
        if (input.down) {
            let target = -1,
                best = Infinity;
            for (const [id, holding] of this.active) {
                const note = this.config.notes[id],
                    delta = Math.abs(time - note.time);
                if (
                    !holding &&
                    note.lane === input.lane &&
                    delta <= WINDOW &&
                    delta < best
                ) {
                    target = id;
                    best = delta;
                }
            }
            if (target !== -1) this.hit(target);
        } else {
            for (const [id, holding] of this.active) {
                const note = this.config.notes[id];
                if (!holding || note.lane !== input.lane) continue;
                this.event(
                    Math.abs(time - (note.holdEndTime ?? note.time)) <= WINDOW
                        ? "tail"
                        : "miss",
                    id,
                );
                this.active.delete(id);
            }
        }
    }
    private moveAuto(deltaMs: number): void {
        const config = this.config;
        const fruit: number[] = [],
            bananas: number[] = [];
        let firstFruit = Infinity,
            firstBanana = Infinity;
        for (const id of this.active.keys()) {
            const note = config.notes[id];
            if (note.time - this.time < -WINDOW) continue;
            if (note.type === "banana") {
                bananas.push(id);
                firstBanana = Math.min(firstBanana, note.time);
            } else {
                fruit.push(id);
                firstFruit = Math.min(firstFruit, note.time);
            }
        }
        const useBananas =
            bananas.length && !(fruit.length && firstFruit - this.time <= 450);
        const candidates = useBananas
            ? bananas
            : fruit.length
              ? fruit
              : bananas;
        const first = useBananas
            ? firstBanana
            : fruit.length
              ? firstFruit
              : firstBanana;
        const cluster = candidates.filter(
            (id) => config.notes[id].time - first <= 30,
        );
        const xFor = (id: number) =>
            config.fieldLeft + (config.notes[id].x / 512) * config.fieldWidth;
        let targetX = (config.width - config.playerWidth) / 2;
        if (cluster.length) {
            let min = Infinity,
                max = -Infinity,
                nearest = cluster[0],
                distance = Infinity;
            for (const id of cluster) {
                const x = xFor(id);
                min = Math.min(min, x);
                max = Math.max(max, x);
                const d = Math.abs(x - this.playerX - config.playerWidth / 2);
                if (d < distance) {
                    distance = d;
                    nearest = id;
                }
            }
            targetX =
                (max - min <= config.playerWidth * 0.8
                    ? (min + max) / 2
                    : xFor(nearest)) -
                config.playerWidth / 2;
        }
        const minX = config.fieldLeft - config.playerWidth / 2;
        const maxX =
            config.fieldLeft + config.fieldWidth - config.playerWidth / 2;
        targetX = clamp(targetX, minX, maxX);
        const distance = Math.abs(targetX - this.playerX);
        const timeUntilCatch = first - this.time;
        const catchHalfWidth = (config.playerWidth * 0.9) / 2;
        if (
            cluster.length > 0 &&
            (distance > config.playerWidth * AUTOPLAY_TELEPORT_DISTANCE_RATIO ||
                (timeUntilCatch <= AUTOPLAY_TELEPORT_URGENT_MS &&
                    distance > catchHalfWidth))
        ) {
            this.playerX = targetX;
            this.velocity = 0;
            return;
        }
        const chasingBanana = useBananas && candidates.length > 0;
        const omega = chasingBanana
            ? AUTOPLAY_BANANA_OMEGA
            : AUTOPLAY_FRUIT_OMEGA;
        const zeta = chasingBanana ? AUTOPLAY_BANANA_ZETA : AUTOPLAY_FRUIT_ZETA;
        const damping = 2 * zeta * omega;
        const maxSpeed =
            (chasingBanana
                ? AUTOPLAY_BANANA_MAX_SPEED
                : AUTOPLAY_FRUIT_MAX_SPEED) * config.scale;
        const seconds = deltaMs / 1000;
        this.velocity +=
            (omega * omega * (targetX - this.playerX) -
                damping * this.velocity) *
            seconds;
        this.velocity = clamp(this.velocity, -maxSpeed, maxSpeed);
        const next = this.playerX + this.velocity * seconds;
        this.playerX = clamp(next, minX, maxX);
        if (next !== this.playerX)
            this.velocity =
                next < minX
                    ? Math.max(0, this.velocity)
                    : Math.min(0, this.velocity);
    }
    step(deltaMs: number): void {
        this.time += deltaMs;
        const c = this.config;
        while (
            this.next < c.notes.length &&
            c.notes[this.next].time - this.time <= c.preemptMs
        ) {
            this.active.set(this.next, false);
            this.event("spawn", this.next++);
        }
        if (c.auto && !c.mania) this.moveAuto(deltaMs);
        else if (!c.mania) {
            this.playerX = this.catchMovement.move(
                this.playerX,
                deltaMs,
                this.time,
                c.fieldLeft,
                c.fieldWidth,
                c.playerWidth,
                Boolean(c.catchKeyboard),
            );
        }
        for (const [id, holding] of this.active) {
            const note = c.notes[id],
                delta = this.time - note.time;
            if (holding) {
                if (c.auto && this.time >= (note.holdEndTime ?? note.time)) {
                    this.event("tail", id);
                    this.active.delete(id);
                } else if (
                    this.time >
                    (note.holdEndTime ?? note.time) + WINDOW
                ) {
                    this.event("miss", id);
                    this.active.delete(id);
                }
            } else if (
                c.mania
                    ? c.auto && delta >= 0
                    : delta >= (c.auto ? -WINDOW : 0) &&
                      delta <= WINDOW &&
                      Math.abs(
                          c.fieldLeft +
                              (note.x / 512) * c.fieldWidth -
                              this.playerX -
                              c.playerWidth / 2,
                      ) <=
                          (c.playerWidth * 0.9) / 2
            ) {
                this.hit(id);
            } else if (delta > WINDOW) {
                if (!c.mania && !c.auto)
                    this.catchMovement.judge(note, false, 0);
                this.event(note.type === "banana" ? "release" : "miss", id);
                this.active.delete(id);
            }
        }
    }
}
