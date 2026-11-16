export interface WarningMediaChart {
    epilepsyWarning: boolean;
    hasStoryboard: boolean;
    hasVideo: boolean;
}

export interface WarningMediaSettings {
    backgroundDim: number;
    photosensitive: boolean;
    storyboard: boolean;
    video: boolean;
}

export const PHOTOSENSITIVE_DIM = 95;

export function effectiveBackgroundDim(
    backgroundDim: number,
    photosensitive: boolean,
    chartWarns: boolean,
): number {
    return photosensitive && chartWarns
        ? Math.max(PHOTOSENSITIVE_DIM, backgroundDim)
        : backgroundDim;
}

// The authored warning is only useful when flashing media can actually be
// presented. A heavily dimmed background (95–100%) also makes it unnecessary.
// A storyboard-bearing chart follows its own toggle even if a video also exists;
// other charts follow the video toggle. Photosensitive mode forces such charts
// to a safe dim level, so the extra notice is skipped.
export function shouldShowEpilepsyWarning(
    chart: WarningMediaChart,
    settings: WarningMediaSettings,
): boolean {
    if (!chart.epilepsyWarning) return false;
    const dim = effectiveBackgroundDim(
        settings.backgroundDim,
        settings.photosensitive,
        chart.epilepsyWarning,
    );
    if (dim >= PHOTOSENSITIVE_DIM) return false;
    if (chart.hasStoryboard) return settings.storyboard;
    return chart.hasVideo && settings.video;
}
