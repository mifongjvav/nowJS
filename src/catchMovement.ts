import { CATCH_WINDOW_MS } from "./judgement.ts";

// osu!lazer Catcher / CatchBeatmapProcessor (ppy/osu, MIT):
// 512-wide coordinates, 0.5 px/ms walk, 1 px/ms dash, and stable's
// direction/excess-distance carry for automatically generated hyperfruits.
// https://osu.ppy.sh/wiki/en/Game_mode/osu!catch
// https://github.com/ppy/osu/blob/master/osu.Game.Rulesets.Catch/UI/Catcher.cs
// https://github.com/ppy/osu/blob/master/osu.Game.Rulesets.Catch/Beatmaps/CatchBeatmapProcessor.cs
export const CATCH_WALK_SPEED = 0.5;
export const CATCH_DASH_SPEED = 1;
export const CATCH_HYPER_COLOR = 0xff4058;
export const CATCH_PLAYER_OSU_WIDTH = (100 / 960) * 512;
export type CatchAction = "left" | "right" | "dash";
export interface HyperTarget {
    x: number;
    time: number;
}
export interface CatchMovementNote {
    x: number;
    time: number;
    type: string;
    hyperDashTarget?: HyperTarget;
}
export interface CatchMovementState {
    left: boolean;
    right: boolean;
    dash: boolean;
    hyper: (HyperTarget & { multiplier: number }) | null;
}

export function assignHyperDashTargets<T extends CatchMovementNote>(
    notes: T[],
    catcherWidth = CATCH_PLAYER_OSU_WIDTH,
) {
    const palpable = notes.filter((note) => note.type !== "banana");
    let lastDirection = 0;
    const halfWidth = catcherWidth / 2;
    let lastExcess = halfWidth;
    for (const note of notes) delete note.hyperDashTarget;
    for (let index = 0; index < palpable.length - 1; index++) {
        const current = palpable[index];
        const next = palpable[index + 1];
        const direction = next.x > current.x ? 1 : -1;
        const time =
            Math.trunc(next.time) - Math.trunc(current.time) - 1000 / 60 / 4;
        const distance =
            Math.abs(next.x - current.x) -
            (lastDirection === direction ? lastExcess : halfWidth);
        const excess = time * CATCH_DASH_SPEED - distance;
        if (excess < 0) {
            current.hyperDashTarget = { x: next.x, time: next.time };
            lastExcess = halfWidth;
        } else lastExcess = Math.max(0, Math.min(halfWidth, excess));
        lastDirection = direction;
    }
}

export class CatchMovement {
    state: CatchMovementState = {
        left: false,
        right: false,
        dash: false,
        hyper: null,
    };

    clearKeys() {
        this.state.left = this.state.right = this.state.dash = false;
    }

    reset() {
        this.clearKeys();
        this.state.hyper = null;
    }

    snapshot(): CatchMovementState {
        return {
            ...this.state,
            hyper: this.state.hyper ? { ...this.state.hyper } : null,
        };
    }

    restore(state?: CatchMovementState) {
        this.reset();
        if (state)
            this.state = {
                ...state,
                hyper: state.hyper ? { ...state.hyper } : null,
            };
    }

    judge(note: CatchMovementNote, hit: boolean, playerOsuX: number) {
        if (note.type === "banana") return;
        // A late miss from an older object (or a simultaneous stacked object)
        // must not cancel the boost belonging to the upcoming target.
        if (this.state.hyper && note.time < this.state.hyper.time) return;
        this.state.hyper = null;
        const target = hit ? note.hyperDashTarget : null;
        if (!target) return;
        const multiplier =
            Math.abs(target.x - playerOsuX) /
            Math.max(1, target.time - note.time - 1000 / 60) /
            CATCH_DASH_SPEED;
        if (multiplier > 1) this.state.hyper = { ...target, multiplier };
    }

    move(
        playerX: number,
        deltaMs: number,
        time: number,
        fieldLeft: number,
        fieldWidth: number,
        playerWidth: number,
        keyboard = true,
    ) {
        const state = this.state;
        if (state.hyper && time > state.hyper.time + CATCH_WINDOW_MS)
            state.hyper = null;
        if (!keyboard) return playerX;
        const direction = Number(state.right) - Number(state.left);
        const speed = state.dash ? CATCH_DASH_SPEED : CATCH_WALK_SPEED;
        let next =
            playerX +
            direction *
                speed *
                (state.hyper?.multiplier ?? 1) *
                deltaMs *
                (fieldWidth / 512);
        if (state.hyper) {
            const target =
                fieldLeft +
                (state.hyper.x / 512) * fieldWidth -
                playerWidth / 2;
            if (
                (playerX < target && next >= target) ||
                (playerX > target && next <= target)
            ) {
                next = target;
                state.hyper = null;
            }
        }
        return Math.max(
            fieldLeft - playerWidth / 2,
            Math.min(fieldLeft + fieldWidth - playerWidth / 2, next),
        );
    }
}
