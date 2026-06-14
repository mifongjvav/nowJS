import * as PIXI from "pixi.js";

const app = window.app;

const line = new PIXI.Graphics();
line.beginFill(0xffffff);
line.roundRect(-500, 10, 9999, 2, 5);
line.endFill();
line.x = 360;
line.y = 550;
app.stage.addChild(line);