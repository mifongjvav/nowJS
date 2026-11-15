// Import order is intentional: bootstrap.ts performs the synchronous Pixi
// setup, then the gameplay modules evaluate, and finally startApp() awaits the
// renderer initialization. This avoids dynamic imports and Vite's preload
// helper while keeping window.app/gameWidth available to gameplay modules.
import { startApp } from "./bootstrap.ts";
import "./player.ts";
import "./line.ts";
import "./circlePool.ts";
import "./stats.ts";
import "./ui.ts";
import * as songSelect from "./songSelect.ts";
import "./gameLoop.ts";

await startApp();

const boot = document.getElementById("boot-splash");
if (boot) boot.remove();

songSelect.showPresetMenu();
