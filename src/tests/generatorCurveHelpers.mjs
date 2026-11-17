export function bezierSegments(object) {
    const anchors = [{ x: object.x, y: 192 }, ...object.curvePoints],
        segments = [];
    let current = [anchors[0]];
    for (let i = 1; i < anchors.length; i++) {
        if (
            Math.hypot(
                anchors[i].x - anchors[i - 1].x,
                anchors[i].y - anchors[i - 1].y,
            ) < 0.001
        ) {
            if (current.length > 1) segments.push(current);
            current = [anchors[i]];
        } else current.push(anchors[i]);
    }
    if (current.length > 1) segments.push(current);
    return segments;
}
export function sampleBezierSlider(object) {
    return bezierSegments(object).flatMap((anchors) => {
        const steps = Math.max(14, (anchors.length - 1) * 18);
        return Array.from({ length: steps + 1 }, (_, i) => {
            let points = anchors.map((p) => ({ ...p }));
            const t = i / steps;
            while (points.length > 1)
                points = points.slice(1).map((p, j) => ({
                    x: points[j].x + (p.x - points[j].x) * t,
                    y: points[j].y + (p.y - points[j].y) * t,
                }));
            return points[0];
        });
    });
}
