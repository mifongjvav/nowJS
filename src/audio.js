import { sound, filters } from "@pixi/sound";

sound.add("catch", "normal-hitnormal.wav");
sound.add("miss", "combobreak.wav");

export function playCatchSound(playerX, playerW, leftBound, playfieldWidth) {
    const playerCenter = playerX + playerW / 2;
    const t = (playerCenter - leftBound) / playfieldWidth;
    const pan = (t - 0.5) * 2;
    sound.play("catch", { filters: [new filters.StereoFilter(pan)] });
}

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
