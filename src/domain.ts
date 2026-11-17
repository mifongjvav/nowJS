export interface Point {
    x: number;
    y: number;
}

export interface TimingPoint {
    time: number;
    beatLength: number;
    uninherited: boolean;
    sliderVelocity: number;
    meter: number;
    sampleSet: number;
    sampleIndex: number;
    volume: number;
}

export interface CatchHitSample {
    bank: string;
    name: string;
    volume: number;
    index?: number;
    filename?: string;
    url?: string;
}

export interface OsuHitObject extends Point {
    time: number;
    type: number;
    hitSound: number;
    sampleSet: string;
    additionSet: string;
    sampleIndex: number;
    sampleFilename: string;
    volume: number;
    samples: CatchHitSample[];
    nodeSamples?: CatchHitSample[][];
    edgeSounds?: number[];
    edgeSets?: Array<{ normalSet: number; additionSet: number }>;
    curveType?: string;
    curvePoints?: Point[];
    slides?: number;
    length?: number;
    endTime?: number;
}

export interface OsuGeneral {
    audioFilename: string;
    previewTime: number;
    mode: number;
    sampleSet: string;
    widescreenStoryboard: boolean;
    epilepsyWarning: boolean;
}

export interface OsuMetadata {
    title: string;
    titleUnicode: string;
    artist: string;
    artistUnicode: string;
    creator: string;
    version: string;
    source: string;
    tags: string;
}

export interface OsuDifficulty {
    hp: number;
    circleSize: number;
    overallDifficulty: number;
    approachRate: number;
    sliderMultiplier: number;
    sliderTickRate: number;
}

export interface OsuSampleEvent {
    time: number;
    file: string;
    volume: number;
    /** 0 = background, 1 = fail, 2 = pass, 3 = foreground, 4 = overlay. */
    layer?: number;
}

export interface OsuEvents {
    background: string | null;
    video: string | null;
    videoOffset: number;
    breaks: Array<{ start: number; end: number }>;
    samples: OsuSampleEvent[];
}

export interface ParsedBeatmap {
    formatVersion: number;
    general: OsuGeneral;
    metadata: OsuMetadata;
    difficulty: OsuDifficulty;
    events: OsuEvents;
    eventsRaw: string[];
    variablesRaw: string[];
    timingPoints: TimingPoint[];
    hitObjects: OsuHitObject[];
    /** Custom combo colours from [Colours], as 0xRRGGBB values. */
    colours: number[];
}

export type CatchNoteType = "fruit" | "droplet" | "banana";

export interface CatchNote {
    time: number;
    x: number;
    type: CatchNoteType;
    scale: number;
    samples: CatchHitSample[];
    /** 0-based mania lane after conversion to 4K. */
    lane?: number;
    /** End time of an osu!mania hold note, if this object is a hold. */
    holdEndTime?: number;
    /** Beatmap-defined combo/lane colour as 0xRRGGBB. */
    color?: number;
    /** Automatically generated hyperfruit destination, in osu! coordinates. */
    hyperDashTarget?: { x: number; time: number };
}

export interface ManiaChartInfo {
    sourceKeys: number;
    laneCount: number;
    keyLabels: string[];
}

export type PlayMode = "catch" | "mania";

export interface CompiledCatchChart {
    notes: CatchNote[];
    firstNoteTime: number;
    lastNoteTime: number;
    bpm: number;
    preemptMs: number;
    objectCount: number;
    lengthMs: number;
    metadata: OsuMetadata;
    difficulty: OsuDifficulty;
    mode: number;
    playMode: PlayMode;
    mania: ManiaChartInfo | null;
    sourceKeys: number | null;
}

export interface ArchiveFile {
    name: string;
    data: Uint8Array;
}

export interface ArchivedBeatmap {
    name: string;
    text: string;
}

export interface OsuArchive {
    files: Record<string, Uint8Array>;
    beatmaps: ArchivedBeatmap[];
}

export interface StoryboardSprite {
    layer: string;
    layerIndex: number;
    origin: string;
    file: string;
    x: number;
    y: number;
    commands: StoryboardCommand[];
    triggers: StoryboardTrigger[];
    animation: {
        frameCount: number;
        frameDelay: number;
        loopType: "LoopOnce" | "LoopForever";
    } | null;
}

export type StoryboardCommand =
    | {
          type: "L";
          start: number;
          count: number;
          commands: StoryboardCommand[];
      }
    | {
          type: "T";
          trigger: string;
          start: number;
          end: number;
      }
    | {
          type: "F" | "S" | "V" | "M" | "MX" | "MY" | "R" | "C" | "P";
          easing: number;
          start: number;
          end: number;
          params: string[];
      };

export interface StoryboardTrigger {
    trigger: string;
    start: number;
    end: number;
    commands: StoryboardCommand[];
}

export interface StoryboardData {
    sprites: StoryboardSprite[];
    samples: OsuSampleEvent[];
}

export interface StoryboardBundle {
    data: StoryboardData;
    fileUrls: Map<string, string>;
}

export interface PresetChart {
    file: string;
    label: string;
}

export interface DifficultySummary {
    metadata: OsuMetadata;
    bpm: number;
    objectCount: number;
    mode?: number;
    maniaSourceKeys?: number;
}

export interface GameResults {
    accuracy: number;
    total: number;
    maxCombo: number;
    hitCount: number;
    missCount: number;
}

export type ChartSource = "osz" | "osu";
export type GameState = "menu" | "warning" | "playing" | "ended";

export interface GameChart extends CompiledCatchChart {
    source: ChartSource;
    fileName: string;
    fallSpeed: number;
    endTime: number;
    audioUrl: string | null;
    audioDurationMs: number;
    backgroundUrl: string | null;
    backgroundFile: string | null;
    videoUrl: string | null;
    videoOffset: number;
    storyboard: StoryboardBundle | null;
    samples: Array<{
        time: number;
        url: string;
        volume: number;
        layer?: number;
    }>;
    breaks: Array<{ start: number; end: number }>;
    replacesBackground: boolean;
    storyboardStartTime: number;
    storyboardEndTime: number;
    widescreenStoryboard: boolean;
    hasVideo: boolean;
    hasStoryboard: boolean;
    epilepsyWarning: boolean;
}

export interface Resolution {
    width: number;
    height: number;
}
