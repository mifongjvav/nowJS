export interface WarningMediaChart {
    epilepsyWarning: boolean;
    hasStoryboard: boolean;
    hasVideo: boolean;
}

export interface WarningMediaSettings {
    backgroundDim: number;
    storyboard: boolean;
    video: boolean;
}

// The authored warning is only useful when flashing media can actually be
// presented. A heavily dimmed background (95–100%) also makes it unnecessary.
// A storyboard-bearing chart follows its own toggle even if a video also exists;
// other charts follow the video toggle.
export function shouldShowEpilepsyWarning(
    chart: WarningMediaChart,
    settings: WarningMediaSettings,
): boolean {
    if (!chart.epilepsyWarning) return false;
    if (settings.backgroundDim >= 95) return false;
    if (chart.hasStoryboard) return settings.storyboard;
    return chart.hasVideo && settings.video;
}
