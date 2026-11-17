// osu!lazer LegacyRulesetExtensions.CalculateScaleFromCircleSize:
// (1 - 0.7 * ((CS - 5) / 5)) / 2.
// Preserve this project's CS4 visual size, while applying the original
// relative CS scaling consistently to fruit, catcher and hyperdash margins.
// https://github.com/ppy/osu/blob/master/osu.Game/Rulesets/Objects/Legacy/LegacyRulesetExtensions.cs
export function getCatchSizeScale(circleSize = 4): number {
    const cs = Number.isFinite(circleSize)
        ? Math.max(0, Math.min(10, circleSize))
        : 4;
    return (1 - 0.7 * ((cs - 5) / 5)) / (1 - 0.7 * ((4 - 5) / 5));
}

export function getCatchPlayerWidthOsu(circleSize = 4): number {
    return (100 / 960) * 512 * getCatchSizeScale(circleSize);
}
