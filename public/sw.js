const CACHE_NAME = "nowjs-audio-v4";
const AUDIO_FILES = [
    "osu-resources/Samples/Gameplay/normal-hitnormal.wav",
    "osu-resources/Samples/Gameplay/normal-hitclap.wav",
    "osu-resources/Samples/Gameplay/normal-hitfinish.wav",
    "osu-resources/Samples/Gameplay/normal-hitwhistle.wav",
    "osu-resources/Samples/Gameplay/soft-hitnormal.wav",
    "osu-resources/Samples/Gameplay/soft-hitclap.wav",
    "osu-resources/Samples/Gameplay/soft-hitfinish.wav",
    "osu-resources/Samples/Gameplay/soft-hitwhistle.wav",
    "osu-resources/Samples/Gameplay/drum-hitnormal.wav",
    "osu-resources/Samples/Gameplay/drum-hitclap.wav",
    "osu-resources/Samples/Gameplay/drum-hitfinish.wav",
    "osu-resources/Samples/Gameplay/drum-hitwhistle.wav",
    "osu-resources/Samples/Gameplay/catch-banana.wav",
    "osu-resources/Samples/Gameplay/combobreak.mp3",
    "osu-resources/Samples/Gameplay/pause-loop.mp3",
    "osu-resources/Samples/Gameplay/restart.wav",
    "osu-resources/Samples/Gameplay/resume-countdown.wav",
    "osu-resources/Samples/Gameplay/spinnerspin.wav",
    "osu-resources/Samples/Gameplay/spinnerbonus.wav",
    "osu-resources/Samples/UI/button-hover.wav",
    "osu-resources/Samples/UI/button-select.wav",
    "osu-resources/Samples/UI/dialog-pop-in.wav",
    "osu-resources/Samples/UI/dialog-pop-out.wav",
    "osu-resources/Samples/UI/notification-default.wav",
    "osu-resources/Samples/UI/notification-error.wav",
    "osu-resources/Samples/UI/notification-done.wav",
    "osu-resources/Samples/Menu/button-play-select.wav",
    "osu-resources/Samples/Menu/back-to-top.wav",
    "osu-resources/Samples/SongSelect/confirm-selection.wav",
    "osu-resources/Samples/SongSelect/select-difficulty.wav",
    "osu-resources/Samples/Results/rank-impact-pass.wav",
    "osu-resources/Samples/Results/rank-impact-pass-ss.wav",
    "osu-resources/Samples/Results/rank-impact-fail.wav",
    "osu-resources/Samples/Results/applause-a.wav",
];

const AUDIO_PATHS = new Set(
    AUDIO_FILES.map((file) => new URL(file, self.registration.scope).pathname),
);

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(AUDIO_FILES);
        }),
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter((key) => key !== CACHE_NAME)
                        .map((key) => caches.delete(key)),
                ),
            ),
    );
});

self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);
    if (AUDIO_PATHS.has(url.pathname)) {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                return cached || fetch(event.request);
            }),
        );
    }
});
