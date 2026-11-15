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
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("class", "now-epilepsy-icon");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("focusable", "false");
    icon.innerHTML = `
        <path d="M12 2 1 21h22L12 2Z" fill="currentColor" />
        <path d="M11 8h2v7h-2z M11 17h2v2h-2z" fill="#101619" />
    `;
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
    content.append(icon, title, description, countdown, hint);
    overlay.appendChild(content);
    (document.getElementById("nowjs-ui") || document.body).appendChild(overlay);
    overlay.focus({ preventScroll: true });

    return new Promise((resolve) => {
        const started = performance.now();
        let settled = false,
            finishing = false,
            previousSeconds = -1;
        const removeListeners = () => {
            window.removeEventListener("keydown", skipKey, true);
            window.removeEventListener("pointerdown", skipPointer, true);
        };
        const remove = () => {
            if (!overlay.isConnected) return;
            overlay.remove();
            cancelCurrent = null;
        };
        const settle = (proceed: boolean) => {
            if (settled) return;
            settled = true;
            clearInterval(timer);
            removeListeners();
            remove();
            resolve(proceed);
        };
        const finish = (proceed: boolean) => {
            if (settled || finishing) return;
            finishing = true;
            clearInterval(timer);
            removeListeners();
            overlay.classList.add("is-leaving");
            overlay.addEventListener(
                "animationend",
                (event) => {
                    if (event.target === overlay) settle(proceed);
                },
                { once: true },
            );
            // animationend is not guaranteed under reduced motion or when the
            // element is hidden by the host; keep dismissal bounded.
            setTimeout(() => settle(proceed), 280);
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
        cancelCurrent = () => settle(false);
        window.addEventListener("keydown", skipKey, true);
        window.addEventListener("pointerdown", skipPointer, {
            capture: true,
            passive: false,
        });
        tick();
    });
}
