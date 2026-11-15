# Experimental multithreading

The setting is off by default and enables fixed-step decoupling automatically.
Each service reports its own acknowledged startup state and fallback reason.
Both Pixi entry points install the official no-eval compatibility implementation;
rendering does not require the `eval` capability. The render worker catches
dependency-load/initialization failures before marking itself ready, and uses a
worker timer if worker `requestAnimationFrame` is unavailable or unsupported.
The render worker uses a project-specific ESM-only Pixi adapter rather than the
generic adapter's CommonJS XML parser dependency. Image decoding stays on the
main thread; XML parsing is only available if the worker host provides DOMParser.

- `logic.worker.ts`: authoritative 240 Hz movement, spawning, catch/mania
  judgements and hold tails. The pure model is in `simulation.ts`. The main
  thread applies ordered presentation/scoring/audio events, but does not run a
  second judgement loop. Session IDs discard stale results after pause, seek,
  restart and exit. Audio startup rebases the simulation clock.
- `render.worker.js`: a separate Pixi WebGL renderer owns a transferred
  OffscreenCanvas. DOM/UI, scene preparation, image/video decoding and the
  prepared background-blur texture remain on the main/browser side. The scene
  bridge supports the graphics, text, sprites and blur filters used by this
  project, not arbitrary Pixi plugins. It sends only one scene at a time, caches
  geometry/images, transfers decoded ImageBitmaps, and clears resources when
  charts change. Unsupported scene instructions fall back instead of silently
  omitting objects. Native context-menu canvas actions remain available.
- `input.worker.ts`: normalizes captured key/pointer events and coordinates.
  DOM event collection and immediate key-plate feedback must remain on the main
  thread. A MessageChannel forwards normalized input directly to the logic worker
  without waiting for a main-thread round trip. Queue bounds, response timeouts
  and epoch IDs prevent stuck/stale input.
- `audio.worklet.js`: a self-contained AudioWorklet mixes decoded music and
  gameplay hit samples. `mixer.js` implements bounded polyphony and resampling.
  File loading/decoding, UI sounds and storyboard samples retain their existing
  browser audio paths. Pausing freezes the music voice; seeking replaces it.

No SharedArrayBuffer or cross-origin isolation is assumed. Message transfer,
duplicated scene resources and multiple WebGL contexts can increase latency,
memory and power usage; this is not a performance guarantee. Main-thread DOM
stalls can still delay input collection, scene preparation and effect delivery.

MOSS deployments must declare the `worker` capability. AudioWorklet and
OffscreenCanvas support in the actual sandbox must be verified separately; a
normal-browser test is not MOSS/PICKCAT playback verification. Runtime API
failures retain the existing per-module main-thread/native-audio fallback. If a
viewer refuses the platform's declared `worker` capability, MOSS does not start
the work at all; an in-work fallback cannot bypass that permission decision.

Tests (Node with TypeScript stripping):

```sh
node --experimental-strip-types --test src/tests/*.test.mjs
```

When modifying gameplay rules, keep the worker model and the default
`circlePool.ts` judgement path aligned, and extend the model/input/mixer tests.
