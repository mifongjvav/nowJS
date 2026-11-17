// Bananas are bonus hits: collecting one improves accuracy, while an
// uncollected banana still does not create a miss or break the combo.
export function calculateAccuracy(
    hitCount: number,
    missCount: number,
    bananaCount = 0,
): number {
    const hits = hitCount + bananaCount;
    const total = hits + missCount;
    return total > 0 ? hits / total : 1;
}
