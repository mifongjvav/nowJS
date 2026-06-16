const CACHE_NAME = "nowjs-audio-v1";
const AUDIO_FILES = [
    "はやくにげなきゃ.mp3",
    "normal-hitnormal.wav",
    "combobreak.wav",
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(AUDIO_FILES);
        }),
    );
});

self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);
    if (AUDIO_FILES.includes(url.pathname.replace(/^\//, ""))) {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                return cached || fetch(event.request);
            }),
        );
    }
});
