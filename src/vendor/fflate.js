// Centralised dependency entry point.
// Keep third-party bare specifiers out of application modules. Export only the
// synchronous helpers used by the game so fflate's Worker path is not bundled.
export {
    strFromU8,
    strToU8,
    unzipSync,
    zipSync,
} from "../../node_modules/fflate/esm/browser.js";
