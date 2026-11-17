interface Point {
    x: number;
    y: number;
}
// Cubic approximation of a quarter circle, derived from its tangent at π/8.
const KAPPA = (4 / 3) * Math.tan(Math.PI / 8);

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
        for (const points of halves(height)) {
            let previous = points[0];
            // Match the importer's cubic sampling, not the control polygon.
            for (let i = 1; i <= 54; i++) {
                const t = i / 54,
                    s = 1 - t;
                const point = {
                    x:
                        s ** 3 * points[0].x +
                        3 * s * s * t * points[1].x +
                        3 * s * t * t * points[2].x +
                        t ** 3 * points[3].x,
                    y:
                        s ** 3 * points[0].y +
                        3 * s * s * t * points[1].y +
                        3 * s * t * t * points[2].y +
                        t ** 3 * points[3].y,
                };
                distance += Math.hypot(
                    point.x - previous.x,
                    point.y - previous.y,
                );
                previous = point;
            }
        }
        return distance;
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
