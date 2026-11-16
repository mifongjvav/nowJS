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
export const AUTOPLAY_MAX_STEP_MS = 1000;
export const AUTOPLAY_MAX_SUBSTEP_SECONDS = 1 / 240;

// When the next object is farther than a few catcher widths, or time is about
// to run out and the catcher is outside the catch area, teleport instead of
// letting the spring trail behind. This keeps accuracy at 100% on dense maps.
export const AUTOPLAY_TELEPORT_DISTANCE_RATIO = 3;
export const AUTOPLAY_TELEPORT_URGENT_MS = 180;

// A 60 Hz frame is the baseline. Longer frames get a matching timing
// tolerance so autoplay is not punished for missed intermediate render ticks.
export const AUTOPLAY_BASE_FRAME_MS = 1000 / 60;
