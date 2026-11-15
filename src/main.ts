// Import order is intentional: bootstrap creates the Pixi application and
// window dimensions with top-level await, then the gameplay modules evaluate.
import "./bootstrap.ts";
import "./player.ts";
import "./line.ts";
import "./circlePool.ts";
import "./stats.ts";
import "./ui.ts";
import * as songSelect from "./songSelect.ts";
import "./gameLoop.ts";

const boot = document.getElementById("boot-splash");
if (boot) boot.remove();

songSelect.showPresetMenu();
