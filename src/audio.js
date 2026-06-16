import { sound } from "@pixi/sound";

sound.add("catch", "normal-hitnormal.wav");
sound.add("miss", "combobreak.wav");

let musicResolve;
export const musicReady = new Promise((resolve) => {
    musicResolve = resolve;
});

export const music = sound.add("music", {
    url: "はやくにげなきゃ.mp3",
    preload: true,
    loaded: (err) => {
        if (!err) musicResolve();
    },
});
