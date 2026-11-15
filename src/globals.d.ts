export {};

import type {
    CanvasRenderer,
    Container,
    Graphics,
    Ticker,
    WebGLRenderer,
} from "pixi.js";
import type { CatchNote, GameChart, GameState } from "./domain.ts";

interface NowApplication {
    stage: Container;
    ticker: Ticker;
    renderer: WebGLRenderer | CanvasRenderer;
    readonly canvas: HTMLCanvasElement;
}

declare global {
    interface GameCircle extends Graphics {
        active: boolean;
        hasJudged: boolean;
        note: CatchNote;
        noteTime: number;
        fallSpeed: number;
        displayRadius: number;
    }

    interface CirclePoolController {
        activeCircles: GameCircle[];
        spawnNote(note: CatchNote, chartTime: number): GameCircle;
        releaseAll(): void;
        update(chartTime: number): void;
    }

    interface Window {
        app: NowApplication;
        bgLayer: Container;
        gameplayLayer: Container;
        storyboardLayer: Container;
        statsLayer: Container;
        player: Container;
        playerVisual: Graphics;
        judgeLine: Graphics;
        circlePool: CirclePoolController;
        currentChart: GameChart | null;
        gameState: GameState;
        gameWidth: number;
        gameHeight: number;
        gameScale: number;
        playerWidth: number;
        chartTime: number;
        combo: number;
        maxCombo: number;
        hitCount: number;
        missCount: number;
        bananaCount: number;
        isPaused: boolean;
        autoPlay: boolean;
    }

    interface ImportMetaEnv {
        readonly BASE_URL: string;
        readonly DEV: boolean;
    }

    interface ImportMeta {
        readonly env: ImportMetaEnv;
    }
}
