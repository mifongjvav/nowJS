import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldShowEpilepsyWarning } from "../warningPolicy.ts";

const baseChart = {
    epilepsyWarning: true,
    hasStoryboard: false,
    hasVideo: true,
};
const baseSettings = {
    backgroundDim: 48,
    storyboard: true,
    video: true,
};

test("authored warning is hidden for unflagged charts or no presented media", () => {
    assert.equal(
        shouldShowEpilepsyWarning(
            { ...baseChart, epilepsyWarning: false },
            baseSettings,
        ),
        false,
    );
    assert.equal(
        shouldShowEpilepsyWarning(
            { ...baseChart, hasVideo: false },
            baseSettings,
        ),
        false,
    );
});

test("background dimming at 95% or above hides the warning", () => {
    assert.equal(
        shouldShowEpilepsyWarning(baseChart, {
            ...baseSettings,
            backgroundDim: 94,
        }),
        true,
    );
    assert.equal(
        shouldShowEpilepsyWarning(baseChart, {
            ...baseSettings,
            backgroundDim: 95,
        }),
        false,
    );
    assert.equal(
        shouldShowEpilepsyWarning(baseChart, {
            ...baseSettings,
            backgroundDim: 100,
        }),
        false,
    );
});

test("storyboard charts follow the storyboard switch, even with a video", () => {
    const chart = { ...baseChart, hasStoryboard: true };
    assert.equal(
        shouldShowEpilepsyWarning(chart, {
            ...baseSettings,
            storyboard: true,
            video: false,
        }),
        true,
    );
    assert.equal(
        shouldShowEpilepsyWarning(chart, {
            ...baseSettings,
            storyboard: false,
            video: true,
        }),
        false,
    );
});

test("charts without a storyboard follow the video switch", () => {
    assert.equal(
        shouldShowEpilepsyWarning(baseChart, {
            ...baseSettings,
            storyboard: false,
            video: true,
        }),
        true,
    );
    assert.equal(
        shouldShowEpilepsyWarning(baseChart, {
            ...baseSettings,
            storyboard: true,
            video: false,
        }),
        false,
    );
});
