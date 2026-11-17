interface Point {
    x: number;
    y: number;
}
// Cubic approximation of a quarter circle, derived from its tangent at π/8.
const KAPPA = (4 / 3) * Math.tan(Math.PI / 8);
// All ellipse quarters share the same cubic basis. Precompute its edge
// coefficients once; fitting then needs only scaled distances, not new
// control points and de Casteljau/polynomial work for every arc and iteration.
const quarterEdges = Array.from({ length: 54 }, (_, i) => {
    const point = (t: number) => {
        const s = 1 - t;
        return {
            x: 3 * s * t * t * (1 - KAPPA) + t ** 3,
            y: 3 * s * s * t * KAPPA + 3 * s * t * t + t ** 3,
        };
    };
    const a = point(i / 54),
        b = point((i + 1) / 54);
    return { x: b.x - a.x, y: b.y - a.y };
});

// Half-ellipses replace the thin cubic S wiggles. Alternate above/below at
// joins so both halves and neighbouring arches share a tangent. Keep x
// monotone: "rounder" must not secretly add Catch overshoots or reversals.
export function createGeneratorSliderCurve(
    x: number,
    endX: number,
    length: number,
) {
    const dx = endX - x;
    if (length <= Math.abs(dx) + 0.001) return `B|${endX}:192`;
    const count = Math.max(1, Math.ceil(length / 280));
    const span = dx / count,
        radiusX = span / 2;
    const halves = (height: number): Point[][] => {
        const result: Point[][] = [];
        for (let i = 0; i < count; i++) {
            const left = x + span * i,
                mid = left + radiusX,
                right = left + span;
            const h = height * (i % 2 ? -1 : 1);
            result.push(
                [
                    { x: left, y: 192 },
                    { x: left, y: 192 + KAPPA * h },
                    { x: mid - KAPPA * radiusX, y: 192 + h },
                    { x: mid, y: 192 + h },
                ],
                [
                    { x: mid, y: 192 + h },
                    { x: mid + KAPPA * radiusX, y: 192 + h },
                    { x: right, y: 192 + KAPPA * h },
                    { x: right, y: 192 },
                ],
            );
        }
        return result;
    };
    const arcLength = (height: number) => {
        let distance = 0;
        for (const edge of quarterEdges)
            distance += Math.hypot(radiusX * edge.x, height * edge.y);
        // Symmetry makes the second quarter and all subsequent arches equal.
        return distance * 2 * count;
    };
    let low = 0,
        high = length;
    for (let i = 0; i < 32; i++) {
        const mid = (low + high) / 2;
        if (arcLength(mid) < length) low = mid;
        else high = mid;
    }
    const curves = halves((low + high) / 2);
    const points = curves.flatMap((curve, i) => (i ? curve : curve.slice(1)));
    return `B|${points.map((p) => `${p.x.toFixed(6)}:${p.y.toFixed(6)}`).join("|")}`;
}
