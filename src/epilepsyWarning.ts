import { format, i18n } from "./i18n/index.ts";

let cancelCurrent: (() => void) | null = null;

export function cancelEpilepsyWarning(): void {
    cancelCurrent?.();
}

// Keep the warning itself static: no flashing, fade transitions or animated
// backgrounds. The skip event is consumed so it cannot also hit a note/pause.
export function showEpilepsyWarning(): Promise<boolean> {
    cancelEpilepsyWarning();
    const overlay = document.createElement("section");
    overlay.id = "now-epilepsy-warning";
    overlay.className = "now-epilepsy-warning";
    overlay.setAttribute("role", "alertdialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "now-epilepsy-title");
    overlay.setAttribute(
        "aria-describedby",
        "now-epilepsy-description now-epilepsy-skip",
    );
    overlay.tabIndex = -1;
    const content = document.createElement("div");
    const title = document.createElement("h2");
    title.id = "now-epilepsy-title";
    title.textContent = i18n.epilepsy.title;
    const description = document.createElement("p");
    description.id = "now-epilepsy-description";
    description.textContent = i18n.epilepsy.description;
    const countdown = document.createElement("p");
    countdown.className = "now-epilepsy-countdown";
    countdown.setAttribute("aria-live", "off");
    const hint = document.createElement("p");
    hint.id = "now-epilepsy-skip";
    hint.textContent = i18n.epilepsy.skip;
    content.append(title, description, countdown, hint);
    overlay.appendChild(content);
    (document.getElementById("nowjs-ui") || document.body).appendChild(overlay);
    overlay.focus({ preventScroll: true });

    return new Promise((resolve) => {
        const started = performance.now();
        let settled = false,
            previousSeconds = -1;
        const finish = (proceed: boolean) => {
            if (settled) return;
            settled = true;
            clearInterval(timer);
            window.removeEventListener("keydown", skipKey, true);
            window.removeEventListener("pointerdown", skipPointer, true);
            overlay.remove();
            cancelCurrent = null;
            resolve(proceed);
        };
        const skipKey = (event: KeyboardEvent) => {
            if (event.repeat || event.isComposing) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            finish(true);
        };
        const skipPointer = (event: PointerEvent) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            finish(true);
        };
        const tick = () => {
            const seconds = Math.max(
                0,
                Math.ceil((3000 - performance.now() + started) / 1000),
            );
            if (!seconds) {
                finish(true);
                return;
            }
            if (seconds !== previousSeconds) {
                previousSeconds = seconds;
                countdown.textContent = format(i18n.epilepsy.countdown, {
                    seconds,
                });
            }
        };
        const timer = setInterval(tick, 50);
        cancelCurrent = () => finish(false);
        window.addEventListener("keydown", skipKey, true);
        window.addEventListener("pointerdown", skipPointer, {
            capture: true,
            passive: false,
        });
        tick();
    });
}
