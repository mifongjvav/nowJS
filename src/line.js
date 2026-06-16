import * as PIXI from "pixi.js";

const app = window.app;
const WIDTH = window.gameWidth;
const HEIGHT = window.gameHeight;
const SCALE = window.gameScale;

const line = new PIXI.Graphics();
line.beginFill(0xffffff);
line.roundRect(0, -SCALE, WIDTH, 2 * SCALE, 5 * SCALE);
line.endFill();
line.x = 0;
line.y = HEIGHT - 160 * SCALE;
app.stage.addChildAt(line, 0);
window.judgeLine = line;
