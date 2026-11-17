import type { Graphics } from "./vendor/pixi.js";

export function getManiaRectangleGeometry(
    fieldWidth: number,
    laneCount: number,
    scale: number,
) {
    const laneWidth = fieldWidth / Math.max(1, laneCount);
    const width = laneWidth - Math.min(10 * scale, laneWidth * 0.15);
    const height = 20 * scale;
    return {
        width,
        height,
        radius: Math.min(5 * scale, width / 2, height / 2),
        bodyWidth: width * 0.76,
        stripeHeight: 3 * scale,
    };
}

// Geometry only: note position, timing, lane and tail judgement stay untouched.
// Anchor the bright bottom edge at y=0 so it reaches the judgement line at the
// note's timestamp; long-note tail edges use the same anchor.
export function drawManiaRectangle(
    graphic: Graphics,
    holdHeight: number,
    color: number,
    outline: number,
    fieldWidth: number,
    laneCount: number,
    scale: number,
) {
    const { width, height, radius, bodyWidth, stripeHeight } =
        getManiaRectangleGeometry(fieldWidth, laneCount, scale);
    if (holdHeight > 0.5) {
        graphic
            .roundRect(
                -bodyWidth / 2,
                -holdHeight,
                bodyWidth,
                holdHeight,
                Math.min(radius, holdHeight / 2),
            )
            .fill({ color, alpha: 0.32 })
            .stroke({ color, alpha: 0.65, width: scale });
        if (holdHeight > height) {
            graphic
                .roundRect(
                    -width / 2,
                    -holdHeight - height,
                    width,
                    height,
                    radius,
                )
                .fill({ color, alpha: 0.85 });
            graphic
                .roundRect(
                    -width / 2 + 2 * scale,
                    -holdHeight - stripeHeight,
                    width - 4 * scale,
                    stripeHeight,
                    stripeHeight / 2,
                )
                .fill({ color: 0xffffff, alpha: 0.85 });
        }
    }
    graphic
        .roundRect(-width / 2, -height, width, height, radius)
        .fill(color)
        .stroke({ color: outline, alpha: 0.65, width: scale });
    graphic
        .roundRect(
            -width / 2 + 2 * scale,
            -stripeHeight,
            width - 4 * scale,
            stripeHeight,
            stripeHeight / 2,
        )
        .fill({ color: 0xffffff, alpha: 0.95 });
}
