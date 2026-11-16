// Shared tuning for both presentation autoplay and the worker-side model.
export const AUTOPLAY_FRUIT_OMEGA = 20;
export const AUTOPLAY_FRUIT_ZETA = 0.9;
export const AUTOPLAY_FRUIT_MAX_SPEED = 7000;

// Bananas are bonus objects that appear every <=100 ms at random positions.
// A much faster critically damped follow is required to sweep the shower.
export const AUTOPLAY_BANANA_OMEGA = 55;
export const AUTOPLAY_BANANA_ZETA = 1;
export const AUTOPLAY_BANANA_MAX_SPEED = 22000;

// Integrate autoplay movement in small substeps so a slow render frame does
// not effectively slow the catcher down (the old 40 ms clamp caused misses).
export const AUTOPLAY_MAX_STEP_MS = 120;
export const AUTOPLAY_MAX_SUBSTEP_SECONDS = 1 / 240;
