import * as PIXI from "pixi.js";

const app = window.app;
const WIDTH = 1280;

const player = new PIXI.Graphics();
player.beginFill(0xffffff);
player.roundRect(0, 0, 100, 20, 5);
player.endFill();
player.x = 360;
player.y = 550;
app.stage.addChild(player);

window.player = player;

window.addEventListener("mousemove", (e) => {
    const rect = app.view.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    let mouseXInGame = (e.clientX - rect.left) * scaleX;
    player.x = Math.min(WIDTH - 100, Math.max(0, mouseXInGame - 50));
});
