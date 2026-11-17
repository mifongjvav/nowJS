interface Point {
    x: number;
    y: number;
}

// Cubic S arcs join with matching tangents. x stays monotone so rounding the
// visible path cannot introduce Catch overshoots, extra reversals or new jumps.
// Fit the sampled arc length (54 steps, as in the importer), not the control
// polygon length: otherwise osu! trims/extends the tail and changes its x.
export function createGeneratorSliderCurve(
    x: number,
    endX: number,
    length: number,
) {
    const dx = endX - x;
    if (length <= Math.abs(dx) + 0.001) return `B|${endX}:192`;
    const segments = Math.max(1, Math.ceil(length / 160));
    const span = dx / segments;
    const segmentLength = (height: number) => {
        let distance = 0,
            previous: Point = { x: 0, y: 0 };
        for (let i = 1; i <= 54; i++) {
            const t = i / 54;
            const point = {
                x: span * t,
                y: 3 * height * t * (1 - t) * (1 - 2 * t),
            };
            distance += Math.hypot(point.x - previous.x, point.y - previous.y);
            previous = point;
        }
        return distance;
    };
    let low = 0,
        high = length;
    for (let i = 0; i < 32; i++) {
        const middle = (low + high) / 2;
        if (segmentLength(middle) * segments < length) low = middle;
        else high = middle;
    }
    const height = (low + high) / 2;
    const points: Point[] = [];
    for (let i = 0; i < segments; i++) {
        const left = x + span * i,
            right = x + span * (i + 1);
        if (i) points.push({ x: left, y: 192 }); // repeated anchor splits Beziers
        points.push(
            { x: left + span / 3, y: 192 + height },
            { x: left + (span * 2) / 3, y: 192 - height },
            { x: right, y: 192 },
        );
    }
    return `B|${points.map((p) => `${p.x.toFixed(6)}:${p.y.toFixed(6)}`).join("|")}`;
}
