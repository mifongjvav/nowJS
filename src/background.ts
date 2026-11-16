import * as PIXI from "./vendor/pixi.js";
import { BlurFilter } from "./vendor/pixi.js";
import { MD3_COLORS } from "./theme.ts";
import { i18n } from "./i18n/index.ts";
import { StoryboardPlayer } from "./storyboard.ts";
import { getSettings, onSettingsChange } from "./settings.ts";
import { effectiveBackgroundDim } from "./warningPolicy.ts";

const WIDTH = window.gameWidth;
const HEIGHT = window.gameHeight;

const VIDEO_SEEK_THRESHOLD = 1;
const VIDEO_SEEK_INTERVAL_MS = 2000;

let sprite = null;
let dimmer = null;
let videoSprite = null;
let videoElement = null;
let videoTexture = null;
let videoOffset = 0;
let videoFailed = false;
let videoErrorHandler = null;
let lastPlayAttempt = 0;
let videoNeedsSync = true;
let lastVideoSeek = -Infinity;
let storyboardPlayer = null;
let storyboardData = null;
let storyboardReplacesBackground = false;
let storyboardPassing = true;
let storyboardWidescreen = true;
let letterbox = null;
let currentUrl = null;
let currentImage = null;
let currentBlur = true;
let currentBlurStrength = -1;
let epilepsyWarningChart = false;
let requestedVideo = null;
let requestedStoryboard = null;
let loadToken = 0;
let mediaStarted = false;
let mediaPaused = true;
let mediaSamples = [];
let nextSampleIndex = 0;
let lastMediaTime = 0;
const activeSampleAudio = new Set();

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function getEffectiveDim(): number {
    const settings = getSettings();
    return (
        effectiveBackgroundDim(
            settings.backgroundDim,
            settings.photosensitive,
            epilepsyWarningChart,
        ) / 100
    );
}

export function setEpilepsyWarningChart(value: boolean): void {
    const next = Boolean(value);
    if (next === epilepsyWarningChart) return;
    epilepsyWarningChart = next;
    updateDimmer();
}

function ensureLayers() {
    if (sprite) return;

    const layer = window.bgLayer;
    layer.sortableChildren = true;

    sprite = new PIXI.Sprite(PIXI.Texture.EMPTY);
    sprite.anchor.set(0.5);
    sprite.position.set(WIDTH / 2, HEIGHT / 2);
    sprite.visible = false;
    sprite.zIndex = 0;

    videoSprite = new PIXI.Sprite(PIXI.Texture.EMPTY);
    videoSprite.anchor.set(0.5);
    videoSprite.position.set(WIDTH / 2, HEIGHT / 2);
    videoSprite.visible = false;
    videoSprite.zIndex = 2;

    dimmer = new PIXI.Graphics();
    dimmer
        .rect(0, 0, WIDTH, HEIGHT)
        .fill({ color: MD3_COLORS.scrim, alpha: 1 });
    dimmer.alpha = getEffectiveDim();
    dimmer.visible = false;
    // Above images, video (2) and all background/foreground storyboard layers
    // (3..4), but still below the separate gameplay layer.
    dimmer.zIndex = 5;

    layer.addChild(sprite);
    layer.addChild(videoSprite);
    layer.addChild(dimmer);

    const overlayLayer = window.storyboardLayer || window.gameplayLayer;
    overlayLayer.sortableChildren = true;
    letterbox = new PIXI.Graphics();
    letterbox.zIndex = 100;
    letterbox.visible = false;
    overlayLayer.addChild(letterbox);
}

function updateDimmer() {
    if (!dimmer) return;
    const dim = getEffectiveDim();
    dimmer.alpha = dim;
    dimmer.visible = Boolean(
        sprite?.visible ||
        videoSprite?.visible ||
        (mediaStarted && storyboardPlayer),
    );
    // Authored Overlay sprites are above gameplay. Fade that container rather
    // than covering the note field/UI with a second black full-screen mask.
    if (storyboardPlayer) storyboardPlayer.overlayContainer.alpha = 1 - dim;
}

function updateBackgroundVisibility() {
    if (!sprite) return;
    // Once a video frame takes over, buffering/seeking must not reveal the
    // static image again. Restore it only on stop, before the offset or error.
    sprite.visible =
        Boolean(currentUrl) &&
        !(
            mediaStarted &&
            (storyboardReplacesBackground || videoSprite.visible)
        );
    updateDimmer();
}

function updateLetterbox() {
    if (!letterbox) return;

    const enabled =
        mediaStarted && Boolean(storyboardPlayer) && !storyboardWidescreen;
    const scale = HEIGHT / 480;
    const areaWidth = 640 * scale;
    const areaX = (WIDTH - areaWidth) / 2;
    const barWidth = Math.max(0, areaX);

    letterbox.clear();
    letterbox.visible = enabled && barWidth > 0;
    if (!letterbox.visible) return;

    letterbox.rect(0, 0, barWidth, HEIGHT).fill(0x000000);
    letterbox.rect(WIDTH - barWidth, 0, barWidth, HEIGHT).fill(0x000000);
}

function loadTexture(url) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.decoding = "async";
        image.onload = () =>
            resolve({ texture: PIXI.Texture.from(image), image });
        image.onerror = () => reject(new Error(i18n.error.backgroundLoad));
        image.src = url;
    });
}

function createBlurredBackgroundTexture(texture) {
    const renderer = window.app?.renderer;
    if (!renderer) return null;

    const coverScale = Math.max(WIDTH / texture.width, HEIGHT / texture.height);
    const temporarySprite = new PIXI.Sprite(texture);
    temporarySprite.anchor.set(0.5);
    temporarySprite.position.set(WIDTH / 2, HEIGHT / 2);
    temporarySprite.scale.set(coverScale);

    const blurFilter = new BlurFilter({
        strength: getSettings().backgroundBlur * (window.gameScale || 1),
        quality: 6,
        kernelSize: 13,
    });
    blurFilter.repeatEdgePixels = true;
    temporarySprite.filters = [blurFilter];

    const temporaryContainer = new PIXI.Container();
    temporaryContainer.addChild(temporarySprite);

    const blurredTexture = renderer.generateTexture({
        target: temporaryContainer,
        frame: new PIXI.Rectangle(0, 0, WIDTH, HEIGHT),
        resolution: 1,
        antialias: false,
        textureSourceOptions: { scaleMode: "linear" },
    });

    temporarySprite.filters = null;
    temporaryContainer.removeChildren();
    temporarySprite.destroy({ texture: false, textureSource: false });
    temporaryContainer.destroy();
    blurFilter.blurXFilter?.destroy();
    blurFilter.blurYFilter?.destroy();
    blurFilter.destroy();

    return blurredTexture;
}

function setVideoSpriteSize() {
    if (!videoSprite || !videoElement) return;

    const videoWidth = videoElement.videoWidth || WIDTH;
    const videoHeight = videoElement.videoHeight || HEIGHT;
    if (videoWidth <= 0 || videoHeight <= 0) return;

    const scale = Math.max(WIDTH / videoWidth, HEIGHT / videoHeight);
    videoSprite.scale.set(scale);
    videoSprite.position.set(WIDTH / 2, HEIGHT / 2);
}

export async function setBackground(url) {
    ensureLayers();

    const settings = getSettings();
    const blur = settings.blur && settings.backgroundBlur > 0;
    const blurStrength = settings.backgroundBlur;
    const token = ++loadToken;

    if (!url) {
        currentUrl = null;
        currentImage = null;
        sprite.visible = false;
        updateDimmer();
        return;
    }

    if (
        url === currentUrl &&
        blur === currentBlur &&
        blurStrength === currentBlurStrength
    ) {
        return;
    }

    try {
        const { texture: sourceTexture, image } = await loadTexture(url);
        if (token !== loadToken) {
            sourceTexture.destroy(true);
            return;
        }

        currentImage = image;
        let displayTexture = sourceTexture;
        let baked = false;

        if (blur) {
            try {
                const blurredTexture =
                    createBlurredBackgroundTexture(sourceTexture);
                if (blurredTexture) {
                    sourceTexture.destroy(true);
                    displayTexture = blurredTexture;
                    baked = true;
                }
            } catch (error) {
                console.warn("背景模糊失败", error);
            }
        }

        if (sprite.texture && sprite.texture !== PIXI.Texture.EMPTY) {
            sprite.texture.destroy(true);
        }

        sprite.texture = displayTexture;
        if (baked) {
            sprite.anchor.set(0, 0);
            sprite.position.set(0, 0);
            sprite.scale.set(1);
        } else {
            sprite.anchor.set(0.5);
            sprite.position.set(WIDTH / 2, HEIGHT / 2);
            const scale = Math.max(
                WIDTH / displayTexture.width,
                HEIGHT / displayTexture.height,
            );
            sprite.scale.set(scale);
        }
        currentUrl = url;
        currentBlur = blur;
        currentBlurStrength = blurStrength;
        updateBackgroundVisibility();
    } catch (error) {
        if (token !== loadToken) return;
        console.warn(error.message);
        currentUrl = null;
        currentImage = null;
        sprite.visible = false;
        updateDimmer();
    }
}

export function getBackgroundImage(): HTMLImageElement | null {
    return currentImage;
}

export function clearVideo() {
    requestedVideo = null;
    ensureLayers();

    const video = videoElement;
    if (video) {
        if (videoErrorHandler) {
            video.removeEventListener("error", videoErrorHandler);
            videoErrorHandler = null;
        }
        video.pause();
    }

    // Destroy the texture (and its VideoSource) before clearing the source so
    // that its internal error listener does not treat the clear as a failure.
    if (videoTexture) {
        videoTexture.destroy(true);
        videoTexture = null;
    }

    if (video) {
        video.removeAttribute("src");
        video.load();
        videoElement = null;
    }

    videoSprite.texture = PIXI.Texture.EMPTY;
    videoSprite.visible = false;
    videoOffset = 0;
    videoFailed = false;
    lastPlayAttempt = 0;
    videoNeedsSync = true;
    lastVideoSeek = -Infinity;
    updateBackgroundVisibility();
}

export function setVideo(url, offset = 0) {
    ensureLayers();

    if (!url) {
        clearVideo();
        return;
    }

    if (
        getSettings().video &&
        videoElement &&
        videoElement.dataset.url === url
    ) {
        videoOffset = offset || 0;
        requestedVideo = { url, offset };
        return;
    }

    clearVideo();
    requestedVideo = { url, offset };
    if (!getSettings().video) return;

    const video = document.createElement("video");
    video.dataset.url = url;
    video.src = url;
    video.muted = true;
    video.loop = false;
    video.playsInline = true;
    video.preload = "auto";
    videoElement = video;
    videoOffset = offset || 0;
    videoFailed = false;
    lastPlayAttempt = 0;

    video.addEventListener("loadedmetadata", setVideoSpriteSize);
    videoErrorHandler = () => {
        if (videoElement !== video) return;
        if (videoFailed) return;
        videoFailed = true;
        videoSprite.visible = false;
        console.warn(`视频加载失败: ${url}`);
        updateBackgroundVisibility();
    };
    video.addEventListener("error", videoErrorHandler);

    const source = new PIXI.VideoSource({
        resource: video,
        autoLoad: false,
        autoPlay: false,
        // Use decoded-frame callbacks where supported, rather than a second
        // 60Hz ticker uploading frames independently of video decoding.
        updateFPS: 0,
        loop: false,
        muted: true,
        crossorigin: false,
    });
    videoTexture = new PIXI.Texture({ source });
    videoSprite.texture = videoTexture;
    videoSprite.visible = false;
    source.load().catch(() => {
        if (videoElement === video) videoErrorHandler?.();
    });
    setVideoSpriteSize();
    updateDimmer();
}

export function clearStoryboard() {
    requestedStoryboard = null;
    if (!storyboardPlayer) {
        storyboardWidescreen = true;
        updateLetterbox();
        return;
    }

    storyboardPlayer.backgroundContainer.removeFromParent();
    storyboardPlayer.failContainer.removeFromParent();
    storyboardPlayer.passContainer.removeFromParent();
    storyboardPlayer.foregroundContainer.removeFromParent();
    storyboardPlayer.overlayContainer.removeFromParent();
    storyboardPlayer.destroy();
    storyboardPlayer = null;
    storyboardData = null;
    storyboardReplacesBackground = false;
    storyboardPassing = true;
    storyboardWidescreen = true;
    updateDimmer();
    updateLetterbox();
}

export function setStoryboard(data, options = {}) {
    if (!data || !data.sprites?.length) {
        clearStoryboard();
        return;
    }

    if (
        getSettings().storyboard &&
        storyboardPlayer &&
        storyboardData === data
    ) {
        requestedStoryboard = { data, options };
        storyboardReplacesBackground = Boolean(options.replacesBackground);
        storyboardWidescreen = Boolean(options.widescreen);
        updateLetterbox();
        return;
    }

    clearStoryboard();
    requestedStoryboard = { data, options };
    if (!getSettings().storyboard) return;

    storyboardData = data;
    storyboardReplacesBackground = Boolean(options.replacesBackground);
    storyboardWidescreen = Boolean(options.widescreen);
    storyboardPlayer = new StoryboardPlayer(data, {
        fileUrls: options.fileUrls,
        backgroundFile: options.backgroundFile,
        widescreen: options.widescreen,
    });

    const bgLayer = window.bgLayer;
    bgLayer.sortableChildren = true;
    storyboardPlayer.backgroundContainer.zIndex = 3;
    storyboardPlayer.backgroundContainer.visible = false;
    bgLayer.addChild(storyboardPlayer.backgroundContainer);

    storyboardPlayer.failContainer.zIndex = 3.1;
    storyboardPlayer.failContainer.visible = false;
    bgLayer.addChild(storyboardPlayer.failContainer);

    storyboardPlayer.passContainer.zIndex = 3.2;
    storyboardPlayer.passContainer.visible = false;
    bgLayer.addChild(storyboardPlayer.passContainer);

    // Foreground is below hit objects and below the shared media dimmer.
    storyboardPlayer.foregroundContainer.zIndex = 4;
    storyboardPlayer.foregroundContainer.visible = false;
    bgLayer.addChild(storyboardPlayer.foregroundContainer);

    // Only the Overlay layer is drawn above hit objects.
    const overlayLayer = window.storyboardLayer || window.gameplayLayer;
    storyboardPlayer.overlayContainer.visible = false;
    overlayLayer.addChild(storyboardPlayer.overlayContainer);

    updateDimmer();
    updateLetterbox();
}

export function setStoryboardPassing(passing: boolean): void {
    storyboardPassing = Boolean(passing);
    if (!storyboardPlayer) return;

    storyboardPlayer.failContainer.visible = mediaStarted && !storyboardPassing;
    storyboardPlayer.passContainer.visible = mediaStarted && storyboardPassing;
}

function lowerBoundSample(time) {
    let low = 0;
    let high = mediaSamples.length;

    while (low < high) {
        const middle = (low + high) >> 1;
        if (mediaSamples[middle].time < time) {
            low = middle + 1;
        } else {
            high = middle;
        }
    }

    return low;
}

function stopActiveSamples() {
    for (const audio of activeSampleAudio) {
        try {
            audio.pause();
            audio.currentTime = 0;
        } catch {
            // Ignore already-disposed audio elements.
        }
    }
    activeSampleAudio.clear();
}

function playSample(sample) {
    if (mediaPaused) return;

    const audio = new Audio(sample.url);
    audio.volume = clamp((sample.volume ?? 100) / 100, 0, 1);
    audio.preload = "auto";

    const cleanup = () => activeSampleAudio.delete(audio);
    audio.addEventListener("ended", cleanup, { once: true });
    audio.addEventListener("error", cleanup, { once: true });

    activeSampleAudio.add(audio);
    const promise = audio.play();
    if (promise && typeof promise.then === "function") {
        promise
            .then(() => {
                // play() is asynchronous. If the game was paused while the
                // sample was loading, stop it as soon as it becomes playable.
                if (mediaPaused) audio.pause();
            })
            .catch(cleanup);
    }
}

function isSampleAudible(sample) {
    if (sample.layer === 1) return !storyboardPassing;
    if (sample.layer === 2) return storyboardPassing;
    return true;
}

export function setSamples(samples = []) {
    stopActiveSamples();
    mediaSamples = (samples || [])
        .filter(
            (sample) => sample && sample.url && Number.isFinite(sample.time),
        )
        .slice()
        .sort((a, b) => a.time - b.time);
    nextSampleIndex = 0;
}

export function triggerStoryboardHit(time) {
    if (!mediaStarted || mediaPaused || !storyboardPlayer) return;
    storyboardPlayer.trigger(time);
}

export function startMedia(time = 0) {
    ensureLayers();
    mediaStarted = true;
    mediaPaused = false;
    lastPlayAttempt = 0;
    videoNeedsSync = true;
    lastVideoSeek = -Infinity;
    videoSprite.visible = false;
    if (videoElement) {
        videoElement.pause();
        videoElement.playbackRate = 1;
    }
    stopActiveSamples();
    if (storyboardPlayer) {
        storyboardPlayer.resetTriggers();
    }
    nextSampleIndex = lowerBoundSample(time);
    lastMediaTime = time;

    updateBackgroundVisibility();

    if (storyboardPlayer) {
        storyboardPlayer.backgroundContainer.visible = true;
        storyboardPlayer.failContainer.visible = !storyboardPassing;
        storyboardPlayer.passContainer.visible = storyboardPassing;
        storyboardPlayer.foregroundContainer.visible = true;
        storyboardPlayer.overlayContainer.visible = true;
    }

    updateLetterbox();
    updateMedia(time);
}

export function pauseMedia() {
    mediaPaused = true;
    if (videoElement && !videoElement.paused) {
        videoElement.pause();
    }
    for (const audio of activeSampleAudio) {
        if (!audio.paused) audio.pause();
    }
}

export function resumeMedia() {
    mediaPaused = false;
    lastPlayAttempt = 0;
    videoNeedsSync = true;
    for (const audio of activeSampleAudio) {
        if (audio.paused && !audio.ended) {
            const promise = audio.play();
            if (promise && typeof promise.catch === "function") {
                promise.catch(() => {});
            }
        }
    }
}

export function seekMedia(time) {
    if (!mediaStarted) return;

    nextSampleIndex = lowerBoundSample(time);
    lastMediaTime = time;
    videoNeedsSync = true;

    if (storyboardPlayer) {
        storyboardPlayer.resetTriggers();
        storyboardPlayer.update(time);
    }

    const video = videoElement;
    if (!video || !videoSprite || videoFailed) return;

    const target = (time - videoOffset) / 1000;
    if (
        target < 0 ||
        (Number.isFinite(video.duration) && target >= video.duration)
    ) {
        videoSprite.visible = false;
        updateBackgroundVisibility();
        return;
    }

    if (video.readyState >= 1 && !video.seeking) {
        try {
            video.currentTime = Math.max(0, target);
            lastVideoSeek = performance.now();
        } catch {
            // updateMedia will retry synchronization when metadata is ready.
        }
    }

    videoSprite.visible = Boolean(videoTexture?.source?.isReady);
    updateBackgroundVisibility();
}

export function stopMedia() {
    mediaStarted = false;
    mediaPaused = true;
    stopActiveSamples();
    nextSampleIndex = 0;
    lastMediaTime = 0;

    if (videoElement) {
        videoElement.pause();
        try {
            videoElement.currentTime = 0;
        } catch {
            // Ignore seeking before metadata is available.
        }
    }
    if (videoSprite) {
        videoSprite.visible = false;
    }
    if (storyboardPlayer) {
        storyboardPlayer.backgroundContainer.visible = false;
        storyboardPlayer.failContainer.visible = false;
        storyboardPlayer.passContainer.visible = false;
        storyboardPlayer.foregroundContainer.visible = false;
        storyboardPlayer.overlayContainer.visible = false;
        storyboardPlayer.resetTriggers();
    }

    updateLetterbox();
    updateBackgroundVisibility();
}

export function updateMediaSamples(time) {
    if (!mediaStarted) return;

    if (time < lastMediaTime - 1) {
        nextSampleIndex = lowerBoundSample(time);
        videoNeedsSync = true;
    }

    while (
        nextSampleIndex < mediaSamples.length &&
        mediaSamples[nextSampleIndex].time <= time
    ) {
        const sample = mediaSamples[nextSampleIndex];
        nextSampleIndex += 1;
        if (
            !mediaPaused &&
            getSettings().storyboard &&
            isSampleAudible(sample)
        ) {
            playSample(sample);
        }
    }
    lastMediaTime = time;
}

export function updateMedia(time) {
    if (!mediaStarted) return;

    if (storyboardPlayer) {
        storyboardPlayer.update(time);
    }

    const video = videoElement;
    if (!video || !videoSprite || videoFailed) return;

    const target = (time - videoOffset) / 1000;

    if (target < 0) {
        if (!video.paused) video.pause();
        videoSprite.visible = false;
        videoNeedsSync = true;
        updateBackgroundVisibility();
        return;
    }

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (duration > 0 && target >= duration) {
        if (!video.paused) video.pause();
        // Retain the last displayed frame instead of repeatedly seeking to EOF.
        video.playbackRate = 1;
        return;
    }

    if (mediaPaused) {
        if (!video.paused) video.pause();
        return;
    }

    const now = performance.now();
    if (video.readyState >= 1 && !video.seeking) {
        const drift = target - video.currentTime;
        const needsSeek = videoNeedsSync
            ? Math.abs(drift) > 0.08
            : Math.abs(drift) > VIDEO_SEEK_THRESHOLD &&
              now - lastVideoSeek >= VIDEO_SEEK_INTERVAL_MS;
        if (needsSeek) {
            try {
                video.currentTime = Math.max(0, target);
                lastVideoSeek = now;
            } catch {
                return;
            }
        }
        videoNeedsSync = false;
        // Small clock differences are corrected without discarding frames.
        video.playbackRate =
            Math.abs(drift) > 0.08 && !needsSeek
                ? clamp(1 + drift * 0.1, 0.97, 1.03)
                : 1;
    }

    if (
        !videoNeedsSync &&
        !video.seeking &&
        video.readyState >= 2 &&
        videoTexture.source.isReady &&
        !videoSprite.visible
    ) {
        videoSprite.visible = true;
        updateBackgroundVisibility();
    }

    if (video.paused && video.readyState >= 2) {
        if (now - lastPlayAttempt > 450) {
            lastPlayAttempt = now;
            const promise = video.play();
            if (promise && typeof promise.catch === "function") {
                promise.catch(() => {
                    // Autoplay may still be blocked until the next gesture.
                });
            }
        }
    }
}

let previousSettings = getSettings();
let blurUpdateTimer: ReturnType<typeof setTimeout> | null = null;
onSettingsChange((settings) => {
    const previous = previousSettings;
    previousSettings = settings;
    if (previous.video !== settings.video && requestedVideo) {
        const { url, offset } = requestedVideo;
        setVideo(url, offset);
    }
    if (previous.storyboard !== settings.storyboard) {
        if (!settings.storyboard) stopActiveSamples();
        if (requestedStoryboard) {
            const { data, options } = requestedStoryboard;
            setStoryboard(data, options);
        }
    }
    if (
        previous.blur !== settings.blur ||
        previous.backgroundBlur !== settings.backgroundBlur
    ) {
        if (blurUpdateTimer !== null) clearTimeout(blurUpdateTimer);
        blurUpdateTimer = setTimeout(() => {
            blurUpdateTimer = null;
            if (currentUrl) void setBackground(currentUrl);
        }, 100);
    }
    updateDimmer();
    updateBackgroundVisibility();
});
