import { BackdropBlurFilter } from "./backdropBlurFilter.js";
import { getSettings } from "./settings.ts";
import type { Container } from "./vendor/pixi.js";

const filters = new WeakMap<Container, BackdropBlurFilter>();

export function setBackdropBlur(node: Container, enabled = true) {
    // The Canvas renderer cannot capture backdrop pixels through Pixi's filter
    // API. Do not substitute CSS blur: that would blur the foreground instead.
    const supported = window.app?.renderer?.type !== 4;
    if (!enabled || !getSettings().blur || !supported) {
        if (filters.has(node)) node.filters = null;
        return;
    }
    let filter = filters.get(node);
    if (!filter) {
        filter = new BackdropBlurFilter(6 * window.gameScale);
        filters.set(node, filter);
    }
    if (node.filters?.[0] !== filter) node.filters = [filter];
}
