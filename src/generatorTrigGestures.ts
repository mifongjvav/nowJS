const clamp = (n: number, low: number, high: number) =>
    Math.max(low, Math.min(high, n));

// Time-parametric circle/ellipse projections, not an oscillator running over
// the whole song. All start with zero velocity; turns slow down naturally.
export function sampleGeneratorTrigGesture(progress: number, variant: number) {
    const u = clamp(progress, 0, 1);
    if (variant === 0) return Math.sin(Math.PI * u) ** 2;
    if (variant === 1) return (1 - Math.cos(Math.PI * u)) / 2;
    return Math.sin(2 * Math.PI * u) * Math.sin(Math.PI * u) ** 2;
}

export function createGeneratorTrigGesture(
    start: number,
    end: number,
    radius: number,
    speed: number,
    signature: string,
    seed: number,
) {
    let hash = seed >>> 0;
    for (let i = 0; i < signature.length; i++)
        hash = Math.imul(hash ^ signature.charCodeAt(i), 16777619) >>> 0;
    const duration = Math.max(0, end - start);
    // Conservative derivative bound for all three shapes. Short phrases get
    // smaller arcs instead of acquiring impossible motion or extra notes.
    const amplitude = Math.min(
        radius * 0.9,
        (duration * speed) / (Math.PI * 4),
    );
    return {
        direction: hash & 1 ? 1 : -1,
        sample(at: number) {
            if (!duration) return 0;
            return (
                amplitude *
                sampleGeneratorTrigGesture((at - start) / duration, hash % 3)
            );
        },
    };
}
