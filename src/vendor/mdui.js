// Centralised MDUI entry point.
// Keep third-party bare specifiers out of application modules.
import "../../node_modules/mdui/mdui.css";

import "../../node_modules/mdui/components/button.js";
import "../../node_modules/mdui/components/button-icon.js";
import "../../node_modules/mdui/components/card.js";
import "../../node_modules/mdui/components/chip.js";
import "../../node_modules/mdui/components/circular-progress.js";
import "../../node_modules/mdui/components/dialog.js";
import "../../node_modules/mdui/components/dropdown.js";
import "../../node_modules/mdui/components/linear-progress.js";
import "../../node_modules/mdui/components/list.js";
import "../../node_modules/mdui/components/list-item.js";
import "../../node_modules/mdui/components/menu.js";
import "../../node_modules/mdui/components/menu-item.js";
import "../../node_modules/mdui/components/segmented-button-group.js";
import "../../node_modules/mdui/components/segmented-button.js";
import "../../node_modules/mdui/components/switch.js";
import "../../node_modules/mdui/components/top-app-bar.js";

import "../../node_modules/@mdui/icons/check-circle.js";
import "../../node_modules/@mdui/icons/play-arrow.js";
import "../../node_modules/@mdui/icons/folder-open.js";
import "../../node_modules/@mdui/icons/music-note.js";
import "../../node_modules/@mdui/icons/upload-file.js";
import "../../node_modules/@mdui/icons/settings.js";
import "../../node_modules/@mdui/icons/language.js";
import "../../node_modules/@mdui/icons/smart-toy.js";
import "../../node_modules/@mdui/icons/restart-alt.js";
import "../../node_modules/@mdui/icons/exit-to-app.js";
import "../../node_modules/@mdui/icons/replay.js";
import "../../node_modules/@mdui/icons/chevron-right.js";

export { snackbar } from "../../node_modules/mdui/functions/snackbar.js";
export { setTheme } from "../../node_modules/mdui/functions/setTheme.js";
export { setColorScheme } from "../../node_modules/mdui/functions/setColorScheme.js";
export { removeColorScheme } from "../../node_modules/mdui/functions/removeColorScheme.js";
export { loadLocale } from "../../node_modules/mdui/functions/loadLocale.js";
export { setLocale } from "../../node_modules/mdui/functions/setLocale.js";
export { templates } from "../../node_modules/mdui/locales/zh-cn.js";
