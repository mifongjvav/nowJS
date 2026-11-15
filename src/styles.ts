import "../node_modules/mdui/mdui.css";

const STYLE_ID = "nowjs-mdui-styles";

const BASE_CSS = `
    :root {
        color-scheme: dark;

        /* nowJS palette, mapped onto MDUI design tokens (RGB triplets). */
        --now-primary: 122, 247, 255;
        --now-on-primary: 0, 54, 58;
        --now-primary-container: 0, 79, 84;
        --now-on-primary-container: 160, 240, 245;
        --now-inverse-primary: 0, 105, 111;
        --now-secondary: 185, 200, 255;
        --now-secondary-container: 49, 68, 124;
        --now-on-secondary: 26, 43, 96;
        --now-on-secondary-container: 219, 225, 255;
        --now-tertiary: 255, 177, 200;
        --now-tertiary-container: 125, 41, 76;
        --now-on-tertiary: 94, 17, 54;
        --now-on-tertiary-container: 255, 217, 228;
        --now-surface: 11, 20, 22;
        --now-surface-dim: 11, 20, 22;
        --now-surface-bright: 49, 59, 60;
        --now-surface-container-lowest: 6, 15, 17;
        --now-surface-container-low: 16, 26, 28;
        --now-surface-container: 20, 30, 32;
        --now-surface-container-high: 30, 41, 43;
        --now-surface-container-highest: 41, 52, 54;
        --now-surface-variant: 63, 73, 75;
        --now-on-surface: 222, 228, 229;
        --now-on-surface-variant: 191, 200, 202;
        --now-inverse-surface: 222, 228, 229;
        --now-inverse-on-surface: 42, 49, 51;
        --now-background: 11, 20, 22;
        --now-on-background: 222, 228, 229;
        --now-error: 255, 180, 171;
        --now-error-container: 147, 0, 10;
        --now-on-error: 105, 0, 5;
        --now-on-error-container: 255, 218, 214;
        --now-outline: 137, 147, 149;
        --now-outline-variant: 63, 73, 75;
        --now-shadow: 0, 0, 0;
        --now-surface-tint-color: 122, 247, 255;
        --now-scrim: 0, 0, 0;

        --now-font-family: "Roboto Flex", Roboto, "Noto Sans SC", "PingFang SC",
            "Microsoft YaHei", system-ui, sans-serif;
        --now-content-width: 1040px;

        /* MDUI 2.1.5 ships a too-small label-small line height. */
        --mdui-typescale-label-small-line-height: 1rem;

        --mdui-color-primary-light: var(--now-primary);
        --mdui-color-primary-dark: var(--now-primary);
        --mdui-color-on-primary-light: var(--now-on-primary);
        --mdui-color-on-primary-dark: var(--now-on-primary);
        --mdui-color-primary-container-light: var(--now-primary-container);
        --mdui-color-primary-container-dark: var(--now-primary-container);
        --mdui-color-on-primary-container-light: var(--now-on-primary-container);
        --mdui-color-on-primary-container-dark: var(--now-on-primary-container);
        --mdui-color-inverse-primary-light: var(--now-inverse-primary);
        --mdui-color-inverse-primary-dark: var(--now-inverse-primary);
        --mdui-color-secondary-light: var(--now-secondary);
        --mdui-color-secondary-dark: var(--now-secondary);
        --mdui-color-secondary-container-light: var(--now-secondary-container);
        --mdui-color-secondary-container-dark: var(--now-secondary-container);
        --mdui-color-on-secondary-light: var(--now-on-secondary);
        --mdui-color-on-secondary-dark: var(--now-on-secondary);
        --mdui-color-on-secondary-container-light: var(--now-on-secondary-container);
        --mdui-color-on-secondary-container-dark: var(--now-on-secondary-container);
        --mdui-color-tertiary-light: var(--now-tertiary);
        --mdui-color-tertiary-dark: var(--now-tertiary);
        --mdui-color-tertiary-container-light: var(--now-tertiary-container);
        --mdui-color-tertiary-container-dark: var(--now-tertiary-container);
        --mdui-color-on-tertiary-light: var(--now-on-tertiary);
        --mdui-color-on-tertiary-dark: var(--now-on-tertiary);
        --mdui-color-on-tertiary-container-light: var(--now-on-tertiary-container);
        --mdui-color-on-tertiary-container-dark: var(--now-on-tertiary-container);
        --mdui-color-surface-light: var(--now-surface);
        --mdui-color-surface-dark: var(--now-surface);
        --mdui-color-surface-dim-light: var(--now-surface-dim);
        --mdui-color-surface-dim-dark: var(--now-surface-dim);
        --mdui-color-surface-bright-light: var(--now-surface-bright);
        --mdui-color-surface-bright-dark: var(--now-surface-bright);
        --mdui-color-surface-container-lowest-light: var(--now-surface-container-lowest);
        --mdui-color-surface-container-lowest-dark: var(--now-surface-container-lowest);
        --mdui-color-surface-container-low-light: var(--now-surface-container-low);
        --mdui-color-surface-container-low-dark: var(--now-surface-container-low);
        --mdui-color-surface-container-light: var(--now-surface-container);
        --mdui-color-surface-container-dark: var(--now-surface-container);
        --mdui-color-surface-container-high-light: var(--now-surface-container-high);
        --mdui-color-surface-container-high-dark: var(--now-surface-container-high);
        --mdui-color-surface-container-highest-light: var(--now-surface-container-highest);
        --mdui-color-surface-container-highest-dark: var(--now-surface-container-highest);
        --mdui-color-surface-variant-light: var(--now-surface-variant);
        --mdui-color-surface-variant-dark: var(--now-surface-variant);
        --mdui-color-on-surface-light: var(--now-on-surface);
        --mdui-color-on-surface-dark: var(--now-on-surface);
        --mdui-color-on-surface-variant-light: var(--now-on-surface-variant);
        --mdui-color-on-surface-variant-dark: var(--now-on-surface-variant);
        --mdui-color-inverse-surface-light: var(--now-inverse-surface);
        --mdui-color-inverse-surface-dark: var(--now-inverse-surface);
        --mdui-color-inverse-on-surface-light: var(--now-inverse-on-surface);
        --mdui-color-inverse-on-surface-dark: var(--now-inverse-on-surface);
        --mdui-color-background-light: var(--now-background);
        --mdui-color-background-dark: var(--now-background);
        --mdui-color-on-background-light: var(--now-on-background);
        --mdui-color-on-background-dark: var(--now-on-background);
        --mdui-color-error-light: var(--now-error);
        --mdui-color-error-dark: var(--now-error);
        --mdui-color-error-container-light: var(--now-error-container);
        --mdui-color-error-container-dark: var(--now-error-container);
        --mdui-color-on-error-light: var(--now-on-error);
        --mdui-color-on-error-dark: var(--now-on-error);
        --mdui-color-on-error-container-light: var(--now-on-error-container);
        --mdui-color-on-error-container-dark: var(--now-on-error-container);
        --mdui-color-outline-light: var(--now-outline);
        --mdui-color-outline-dark: var(--now-outline);
        --mdui-color-outline-variant-light: var(--now-outline-variant);
        --mdui-color-outline-variant-dark: var(--now-outline-variant);
        --mdui-color-shadow-light: var(--now-shadow);
        --mdui-color-shadow-dark: var(--now-shadow);
        --mdui-color-surface-tint-color-light: var(--now-surface-tint-color);
        --mdui-color-surface-tint-color-dark: var(--now-surface-tint-color);
        --mdui-color-scrim-light: var(--now-scrim);
        --mdui-color-scrim-dark: var(--now-scrim);
    }

    *,
    *::before,
    *::after {
        box-sizing: border-box;
    }

    html,
    body {
        margin: 0;
        height: 100%;
        background: rgb(var(--mdui-color-surface));
        color: rgb(var(--mdui-color-on-surface));
        font-family: var(--now-font-family);
    }

    body {
        overflow: hidden;
    }

    .now-hidden {
        display: none !important;
    }

    #nowjs-ui {
        position: fixed;
        inset: 0;
        z-index: 9000;
        pointer-events: none;
        color: rgb(var(--mdui-color-on-surface));
        font-family: var(--now-font-family);
    }

    .now-screen {
        position: fixed;
        inset: 0;
        display: flex;
        pointer-events: auto;
        animation: now-fade-in var(--mdui-motion-duration-medium1)
            var(--mdui-motion-easing-standard-decelerate) both;
    }

    @keyframes now-fade-in {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }

    @keyframes now-rise-in {
        from {
            opacity: 0;
            transform: translateY(14px) scale(0.985);
        }
        to {
            opacity: 1;
            transform: translateY(0) scale(1);
        }
    }

    @keyframes now-pop-in {
        0% {
            opacity: 0;
            transform: scale(0.82);
        }
        70% {
            opacity: 1;
            transform: scale(1.06);
        }
        100% {
            transform: scale(1);
        }
    }

    @keyframes now-result-stat-in {
        from {
            opacity: 0;
            transform: translateY(10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .now-menu-screen {
        flex-direction: column;
        padding: var(--mdui-typescale-body-small-line-height) clamp(16px, 4vw, 64px)
            24px;
        overflow: hidden;
        background: color-mix(
            in srgb,
            rgb(var(--mdui-color-surface)) 78%,
            transparent
        );
        backdrop-filter: blur(24px) saturate(1.15);
        -webkit-backdrop-filter: blur(24px) saturate(1.15);
    }

    .now-ambient {
        position: absolute;
        inset: 0;
        overflow: hidden;
        pointer-events: none;
    }

    .now-ambient-orb {
        position: absolute;
        width: clamp(320px, 42vw, 640px);
        aspect-ratio: 1;
        border-radius: 50%;
        filter: blur(90px);
        opacity: 0.22;
        will-change: transform;
        animation: now-orb-drift 20s var(--mdui-motion-easing-standard) infinite
            alternate;
    }

    .now-ambient-orb-a {
        top: -18%;
        left: -12%;
        background: rgb(var(--mdui-color-primary));
    }

    .now-ambient-orb-b {
        right: -14%;
        bottom: -22%;
        background: rgb(var(--mdui-color-secondary));
        opacity: 0.18;
        animation-delay: -11s;
        animation-duration: 26s;
    }

    @keyframes now-orb-drift {
        from {
            transform: translate3d(0, 0, 0) scale(1);
        }
        to {
            transform: translate3d(5%, 7%, 0) scale(1.08);
        }
    }

    mdui-top-app-bar.now-top-app-bar {
        position: relative;
        width: 100%;
        max-width: var(--now-content-width);
        height: 64px;
        min-height: 64px;
        margin: 0 auto;
        padding: 0;
        align-items: center;
        justify-content: space-between;
        background: transparent;
        animation: now-rise-in 420ms var(--mdui-motion-easing-standard-decelerate)
            both;
    }

    .now-brand {
        display: flex;
        align-items: center;
        gap: 16px;
        min-width: 0;
    }

    .now-brand-mark {
        display: grid;
        place-items: center;
        width: 48px;
        height: 48px;
        flex: none;
        border-radius: var(--mdui-shape-corner-large);
        background: rgb(var(--mdui-color-primary-container));
        color: rgb(var(--mdui-color-on-primary-container));
        font-size: 26px;
        font-weight: 600;
        line-height: 1;
        transition:
            transform var(--mdui-motion-duration-short3)
                var(--mdui-motion-easing-emphasized),
            box-shadow var(--mdui-motion-duration-short3)
                var(--mdui-motion-easing-standard);
    }

    .now-brand:hover .now-brand-mark {
        transform: rotate(-6deg) scale(1.06);
        box-shadow: 0 0 22px
            color-mix(in srgb, rgb(var(--mdui-color-primary)) 32%, transparent);
    }

    .now-brand-copy {
        min-width: 0;
    }

    .now-brand-copy h1 {
        margin: 0;
        color: rgb(var(--mdui-color-on-surface));
        font-size: var(--mdui-typescale-title-large-size);
        font-weight: 600;
        line-height: var(--mdui-typescale-title-large-line-height);
        letter-spacing: var(--mdui-typescale-title-large-tracking);
    }

    .now-brand-copy p {
        margin: 2px 0 0;
        color: rgb(var(--mdui-color-on-surface-variant));
        font-size: var(--mdui-typescale-label-small-size);
        font-weight: var(--mdui-typescale-label-small-weight);
        line-height: var(--mdui-typescale-label-small-line-height);
        letter-spacing: 0.16em;
        text-transform: uppercase;
    }

    .now-top-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-left: auto;
    }

    .now-top-actions mdui-button-icon,
    .now-top-actions mdui-chip {
        transition:
            transform var(--mdui-motion-duration-short2)
                var(--mdui-motion-easing-standard),
            box-shadow var(--mdui-motion-duration-short2)
                var(--mdui-motion-easing-standard);
    }

    .now-top-actions mdui-button-icon:hover,
    .now-top-actions mdui-chip:hover {
        transform: translateY(-2px);
        box-shadow: var(--mdui-elevation-level2);
    }

    .now-top-actions mdui-button-icon:active,
    .now-top-actions mdui-chip:active {
        transform: scale(0.94);
    }

    mdui-chip.now-resolution-chip {
        height: 40px;
        --shape-corner: var(--mdui-shape-corner-full);
        color: rgb(var(--mdui-color-on-surface-variant));
    }

    mdui-chip.now-resolution-chip mdui-icon-settings {
        font-size: 18px;
    }

    .now-menu-main {
        flex: 1;
        min-height: 0;
        width: 100%;
        max-width: var(--now-content-width);
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        justify-content: safe center;
        gap: 16px;
        padding: 32px 0;
        overflow-y: auto;
    }

    .now-presets {
        width: 100%;
        animation: now-rise-in 460ms var(--mdui-motion-easing-standard-decelerate)
            40ms both;
    }

    .now-presets-heading {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        margin: 0 0 10px;
    }

    .now-presets-heading h2 {
        margin: 0;
        color: rgb(var(--mdui-color-on-surface));
        font-size: var(--mdui-typescale-title-medium-size);
        font-weight: var(--mdui-typescale-title-medium-weight);
        line-height: var(--mdui-typescale-title-medium-line-height);
    }

    .now-presets-heading span {
        color: rgb(var(--mdui-color-on-surface-variant));
        font-size: var(--mdui-typescale-label-medium-size);
    }

    .now-preset-grid {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 12px;
    }

    mdui-card.now-preset-card {
        display: flex;
        min-width: 0;
        min-height: 112px;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 10px;
        border: 1px solid rgb(var(--mdui-color-outline-variant));
        border-radius: var(--mdui-shape-corner-small);
        background: rgb(var(--mdui-color-surface-container-high));
        color: rgb(var(--mdui-color-on-surface));
        text-align: center;
        cursor: pointer;
        transition:
            border-color var(--mdui-motion-duration-short2)
                var(--mdui-motion-easing-standard),
            transform var(--mdui-motion-duration-short2)
                var(--mdui-motion-easing-emphasized),
            box-shadow var(--mdui-motion-duration-short2)
                var(--mdui-motion-easing-standard);
        animation: now-rise-in 420ms var(--mdui-motion-easing-standard-decelerate)
            both;
    }

    mdui-card.now-preset-card:nth-child(1) {
        animation-delay: 80ms;
    }

    mdui-card.now-preset-card:nth-child(2) {
        animation-delay: 130ms;
    }

    mdui-card.now-preset-card:nth-child(3) {
        animation-delay: 180ms;
    }

    mdui-card.now-preset-card:nth-child(4) {
        animation-delay: 230ms;
    }

    mdui-card.now-preset-card:nth-child(5) {
        animation-delay: 280ms;
    }

    mdui-card.now-preset-card:hover,
    mdui-card.now-preset-card:focus-visible {
        border-color: rgb(var(--mdui-color-primary));
        transform: translateY(-4px) scale(1.015);
        box-shadow: var(--mdui-elevation-level2);
        outline: none;
    }

    mdui-card.now-preset-card:active {
        transform: translateY(0) scale(0.975);
        box-shadow: var(--mdui-elevation-level0);
    }

    .now-preset-mark {
        display: grid;
        flex: none;
        width: 48px;
        height: 48px;
        place-items: center;
        border: 3px solid #fff;
        border-radius: 50%;
        background: #ed68a5;
        box-shadow: 0 1px 4px rgb(0 0 0 / 24%);
        color: #fff;
        font-size: 15px;
        font-weight: 800;
        letter-spacing: -0.04em;
    }

    .now-preset-label {
        display: -webkit-box;
        width: 100%;
        overflow: hidden;
        color: inherit;
        font-size: var(--mdui-typescale-label-medium-size);
        line-height: 1.4;
        overflow-wrap: anywhere;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
    }

    .now-preset-grid:has(> :only-child) {
        grid-template-columns: minmax(180px, 220px);
        justify-content: center;
    }

    mdui-card.now-song-card {
        display: block;
        width: 100%;
        --shape-corner: var(--mdui-shape-corner-medium);
        background-color: color-mix(
            in srgb,
            rgb(var(--mdui-color-surface-container-high)) 72%,
            transparent
        );
        border: 1px solid
            color-mix(
                in srgb,
                rgb(var(--mdui-color-outline-variant)) 55%,
                transparent
            );
        backdrop-filter: blur(20px) saturate(1.15);
        -webkit-backdrop-filter: blur(20px) saturate(1.15);
        animation: now-rise-in 500ms var(--mdui-motion-easing-standard-decelerate)
            100ms both;
    }

    .now-song-card-inner {
        display: grid;
        grid-template-columns: 220px minmax(0, 1fr);
        gap: 32px;
        align-items: stretch;
        padding: 24px;
    }

    .now-menu-screen.is-dragging mdui-card.now-song-card {
        outline: 3px solid rgb(var(--mdui-color-primary));
        outline-offset: 2px;
    }

    .now-song-cover {
        position: relative;
        width: 100%;
        min-height: 176px;
        aspect-ratio: 1;
        border-radius: var(--mdui-shape-corner-medium);
        overflow: hidden;
        background-color: rgb(var(--mdui-color-surface-container-highest));
        background-size: cover;
        background-position: center;
    }

    .now-song-cover.is-empty {
        display: grid;
        place-items: center;
        background-image: none;
    }

    .now-cover-glyph {
        font-size: 64px;
        color: rgb(var(--mdui-color-on-surface-variant));
        opacity: 0.6;
    }

    .now-song-cover:not(.is-empty) .now-cover-glyph {
        display: none;
    }

    .now-song-body {
        display: flex;
        flex-direction: column;
        justify-content: center;
        min-width: 0;
        padding: 8px 0;
    }

    .now-eyebrow {
        margin: 0;
        color: rgb(var(--mdui-color-primary));
        font-size: var(--mdui-typescale-label-medium-size);
        font-weight: var(--mdui-typescale-label-medium-weight);
        line-height: var(--mdui-typescale-label-medium-line-height);
        letter-spacing: var(--mdui-typescale-label-medium-tracking);
    }

    .now-song-title {
        margin: 8px 0 0;
        color: rgb(var(--mdui-color-on-surface));
        font-size: var(--mdui-typescale-headline-medium-size);
        font-weight: var(--mdui-typescale-headline-medium-weight);
        line-height: var(--mdui-typescale-headline-medium-line-height);
        letter-spacing: var(--mdui-typescale-headline-medium-tracking);
        overflow-wrap: anywhere;
    }

    .now-song-artist {
        margin: 8px 0 0;
        color: rgb(var(--mdui-color-on-surface-variant));
        font-size: var(--mdui-typescale-body-large-size);
        line-height: var(--mdui-typescale-body-large-line-height);
        letter-spacing: var(--mdui-typescale-body-large-tracking);
        overflow-wrap: anywhere;
    }

    .now-song-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 24px;
    }

    .now-meta-item {
        display: inline-flex;
        align-items: baseline;
        gap: 8px;
        min-height: 32px;
        padding: 4px 16px;
        border: 1px solid rgb(var(--mdui-color-outline-variant));
        border-radius: var(--mdui-shape-corner-small);
        background: transparent;
        color: rgb(var(--mdui-color-on-surface-variant));
    }

    .now-meta-item span {
        color: rgb(var(--mdui-color-on-surface-variant));
        font-size: var(--mdui-typescale-label-small-size);
        line-height: var(--mdui-typescale-label-small-line-height);
        letter-spacing: var(--mdui-typescale-label-small-tracking);
    }

    .now-meta-item strong {
        color: rgb(var(--mdui-color-on-surface));
        font-size: var(--mdui-typescale-label-large-size);
        font-weight: 500;
        line-height: var(--mdui-typescale-label-large-line-height);
        letter-spacing: var(--mdui-typescale-label-large-tracking);
    }

    .now-song-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 24px;
    }

    .now-song-actions mdui-button {
        transition:
            transform var(--mdui-motion-duration-short2)
                var(--mdui-motion-easing-emphasized),
            box-shadow var(--mdui-motion-duration-short2)
                var(--mdui-motion-easing-standard);
    }

    .now-song-actions mdui-button:hover:not([disabled]) {
        transform: translateY(-2px);
        box-shadow: var(--mdui-elevation-level2);
    }

    .now-song-actions mdui-button:active:not([disabled]) {
        transform: scale(0.97);
        box-shadow: var(--mdui-elevation-level0);
    }

    mdui-card.now-drop-hint {
        display: block;
        width: min(640px, 100%);
        --shape-corner: var(--mdui-shape-corner-medium);
        background-color: color-mix(
            in srgb,
            rgb(var(--mdui-color-surface-container-low)) 68%,
            transparent
        );
        backdrop-filter: blur(16px) saturate(1.1);
        -webkit-backdrop-filter: blur(16px) saturate(1.1);
        animation: now-rise-in 460ms var(--mdui-motion-easing-standard-decelerate)
            180ms both;
        transition:
            border-color var(--mdui-motion-duration-short2)
                var(--mdui-motion-easing-standard),
            transform var(--mdui-motion-duration-short2)
                var(--mdui-motion-easing-emphasized);
    }

    mdui-card.now-drop-hint:hover,
    mdui-card.now-drop-hint:focus-visible {
        border-color: rgb(var(--mdui-color-primary));
        transform: translateY(-2px);
        outline: none;
    }

    mdui-card.now-drop-hint:active {
        transform: scale(0.99);
    }

    .now-drop-hint-inner {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: 56px;
        padding: 8px 16px;
        color: rgb(var(--mdui-color-on-surface-variant));
        text-align: center;
        font-size: var(--mdui-typescale-body-medium-size);
        line-height: var(--mdui-typescale-body-medium-line-height);
        letter-spacing: var(--mdui-typescale-body-medium-tracking);
    }

    .now-drop-hint mdui-icon-upload-file {
        flex: none;
        font-size: 20px;
    }

    .now-menu-screen.is-dragging mdui-card.now-drop-hint {
        border-color: transparent;
        background-color: rgb(var(--mdui-color-primary-container));
        color: rgb(var(--mdui-color-on-primary-container));
    }

    .now-menu-screen.is-dragging .now-drop-hint-inner {
        color: rgb(var(--mdui-color-on-primary-container));
    }

    .now-play-hint {
        margin: 0;
        color: rgb(var(--mdui-color-on-surface-variant));
        text-align: center;
        font-size: var(--mdui-typescale-body-medium-size);
        line-height: var(--mdui-typescale-body-medium-line-height);
        letter-spacing: var(--mdui-typescale-body-medium-tracking);
        animation: now-rise-in 420ms var(--mdui-motion-easing-standard-decelerate)
            220ms both;
    }

    /* Keep cards at their natural height and let the menu scroll instead of
       squeezing their contents when the window is short. */
    .now-presets,
    mdui-card.now-song-card,
    mdui-card.now-drop-hint,
    .now-play-hint {
        flex: 0 0 auto;
    }

    .now-menu-footer {
        width: 100%;
        max-width: var(--now-content-width);
        margin: 0 auto;
        padding-top: 8px;
        border-top: 1px solid rgb(var(--mdui-color-outline-variant));
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 4px 16px;
        color: rgb(var(--mdui-color-on-surface-variant));
        font-size: var(--mdui-typescale-label-small-size);
        font-weight: var(--mdui-typescale-label-small-weight);
        line-height: var(--mdui-typescale-label-small-line-height);
        letter-spacing: var(--mdui-typescale-label-small-tracking);
    }

    .now-menu-footer span:first-child {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .now-menu-footer span:last-child {
        flex: none;
    }

    .now-sound-credit {
        flex: none;
        padding: 0;
        border: 0;
        background: none;
        color: rgb(var(--mdui-color-primary));
        font: inherit;
        text-decoration: none;
        cursor: pointer;
    }

    .now-sound-credit:hover,
    .now-sound-credit:focus-visible {
        text-decoration: underline;
    }

    mdui-dialog.now-license-dialog::part(panel) {
        width: min(42rem, calc(100vw - 4rem));
        max-width: min(42rem, calc(100vw - 4rem));
        box-sizing: border-box;
    }

    .now-license-text {
        max-height: min(56vh, 32rem);
        margin: 0;
        overflow: auto;
        color: rgb(var(--mdui-color-on-surface-variant));
        font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
        font-size: 11px;
        line-height: 1.55;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
    }

    mdui-dialog.now-compact-dialog::part(panel) {
        width: min(28rem, calc(100vw - 6rem));
        max-width: min(28rem, calc(100vw - 6rem));
        box-sizing: border-box;
    }

    mdui-dialog.now-compact-dialog::part(action) {
        flex-wrap: wrap;
        gap: 8px;
    }

    mdui-dialog.now-compact-dialog mdui-button,
    mdui-dialog.now-result-dialog mdui-button {
        transition:
            transform var(--mdui-motion-duration-short2)
                var(--mdui-motion-easing-emphasized),
            box-shadow var(--mdui-motion-duration-short2)
                var(--mdui-motion-easing-standard);
    }

    mdui-dialog.now-compact-dialog mdui-button:hover,
    mdui-dialog.now-result-dialog mdui-button:hover {
        transform: translateY(-2px);
        box-shadow: var(--mdui-elevation-level2);
    }

    mdui-dialog.now-compact-dialog mdui-button:active,
    mdui-dialog.now-result-dialog mdui-button:active {
        transform: scale(0.97);
        box-shadow: var(--mdui-elevation-level0);
    }

    mdui-dialog.now-result-dialog::part(panel) {
        max-width: 35rem;
    }

    mdui-dialog.now-difficulty-dialog::part(panel) {
        max-width: 40rem;
    }

    .now-result-head {
        display: flex;
        align-items: center;
        gap: 24px;
        margin-top: 8px;
    }

    .now-result-copy {
        min-width: 0;
    }

    .now-result-copy h2 {
        margin: 0;
        overflow-wrap: anywhere;
        font-size: var(--mdui-typescale-headline-small-size);
        font-weight: 500;
        line-height: var(--mdui-typescale-headline-small-line-height);
    }

    .now-result-copy p {
        margin: 8px 0 0;
        color: rgb(var(--mdui-color-on-surface-variant));
        font-size: var(--mdui-typescale-body-medium-size);
        line-height: var(--mdui-typescale-body-medium-line-height);
    }

    .now-grade {
        flex: none;
        color: rgb(var(--mdui-color-primary));
        font-size: clamp(64px, 10vw, 96px);
        font-weight: 600;
        line-height: 1;
        letter-spacing: -0.04em;
        transform-origin: center;
        animation: now-pop-in 520ms var(--mdui-motion-easing-emphasized-decelerate)
            both;
    }

    .now-grade[data-grade="B"],
    .now-grade[data-grade="C"] {
        color: rgb(var(--mdui-color-tertiary));
    }

    .now-grade[data-grade="D"] {
        color: rgb(var(--mdui-color-error));
    }

    .now-result-stats {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
        margin-top: 24px;
    }

    .now-result-stat {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 16px;
        border-radius: var(--mdui-shape-corner-medium);
        background: color-mix(
            in srgb,
            rgb(var(--mdui-color-surface-container-low)) 68%,
            transparent
        );
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        animation: now-result-stat-in 360ms
            var(--mdui-motion-easing-standard-decelerate) both;
    }

    .now-result-stat:nth-child(2) {
        animation-delay: 55ms;
    }

    .now-result-stat:nth-child(3) {
        animation-delay: 110ms;
    }

    .now-result-stat:nth-child(4) {
        animation-delay: 165ms;
    }

    .now-result-stat span {
        color: rgb(var(--mdui-color-on-surface-variant));
        font-size: var(--mdui-typescale-label-medium-size);
        line-height: var(--mdui-typescale-label-medium-line-height);
        letter-spacing: var(--mdui-typescale-label-medium-tracking);
    }

    .now-result-stat strong {
        color: rgb(var(--mdui-color-on-surface));
        font-size: var(--mdui-typescale-title-large-size);
        font-weight: 500;
        line-height: var(--mdui-typescale-title-large-line-height);
    }

    .now-mini-hint {
        margin: 16px 0 0;
        color: rgb(var(--mdui-color-on-surface-variant));
        font-size: var(--mdui-typescale-body-small-size);
        line-height: var(--mdui-typescale-body-small-line-height);
    }

    mdui-list.now-difficulty-list {
        display: block;
        max-height: min(46vh, 420px);
        margin-top: 16px;
        padding: 0;
        overflow-y: auto;
        border: 1px solid rgb(var(--mdui-color-outline-variant));
        border-radius: var(--mdui-shape-corner-medium);
    }

    mdui-list.now-difficulty-list mdui-list-item {
        --shape-corner: 0;
    }

    mdui-list.now-difficulty-list mdui-list-item:not(:last-child) {
        border-bottom: 1px solid rgb(var(--mdui-color-outline-variant));
    }

    .now-loading-screen {
        position: fixed;
        inset: 0;
        z-index: 15000;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 24px;
        pointer-events: auto;
        background: color-mix(
            in srgb,
            rgb(var(--mdui-color-surface)) 92%,
            transparent
        );
        backdrop-filter: blur(16px) saturate(1.1);
        -webkit-backdrop-filter: blur(16px) saturate(1.1);
    }

    .now-loading-screen p {
        margin: 0;
        color: rgb(var(--mdui-color-on-surface-variant));
        font-size: var(--mdui-typescale-body-medium-size);
        line-height: var(--mdui-typescale-body-medium-line-height);
    }

    .now-hud {
        position: fixed;
        inset: 0;
        z-index: 7000;
        pointer-events: none;
    }

    mdui-linear-progress.now-hud-progress {
        --shape-corner: 999px;
        position: absolute;
        top: 6px;
        left: 16px;
        right: 16px;
        width: auto;
        height: 8px;
        border-radius: 999px;
        transition:
            height 120ms ease,
            top 120ms ease;
    }

    .now-hud-scrubbable mdui-linear-progress.now-hud-progress {
        pointer-events: auto;
        cursor: pointer;
        touch-action: none;
    }

    .now-hud-scrubbable mdui-linear-progress.now-hud-progress:hover,
    .now-hud-seeking mdui-linear-progress.now-hud-progress {
        top: 2px;
        height: 18px;
    }

    mdui-linear-progress.now-hud-progress::part(indicator) {
        border-radius: 999px;
    }

    .now-hud-auto {
        position: absolute;
        top: 24px;
        left: 50%;
        transform: translateX(-50%);
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 8px;
        border-radius: var(--mdui-shape-corner-small);
        background: color-mix(
            in srgb,
            rgb(var(--mdui-color-primary-container)) 76%,
            transparent
        );
        color: rgb(var(--mdui-color-on-primary-container));
        backdrop-filter: blur(14px) saturate(1.15);
        -webkit-backdrop-filter: blur(14px) saturate(1.15);
        font-size: var(--mdui-typescale-label-medium-size);
        font-weight: var(--mdui-typescale-label-medium-weight);
        line-height: var(--mdui-typescale-label-medium-line-height);
        letter-spacing: var(--mdui-typescale-label-medium-tracking);
    }

    .now-hud-auto mdui-icon-smart-toy {
        font-size: 16px;
    }

    .now-hud-auto:not(.now-hidden) {
        animation: now-badge-in 260ms
            var(--mdui-motion-easing-emphasized-decelerate) both;
    }

    @keyframes now-badge-in {
        from {
            opacity: 0;
            transform: translate(-50%, -6px) scale(0.9);
        }
        to {
            opacity: 1;
            transform: translate(-50%, 0) scale(1);
        }
    }

    .now-hud-song {
        position: absolute;
        top: 16px;
        right: 16px;
        max-width: min(40vw, 460px);
        padding: 8px;
        border-radius: var(--mdui-shape-corner-small);
        background: color-mix(
            in srgb,
            rgb(var(--mdui-color-surface-container)) 74%,
            transparent
        );
        color: rgb(var(--mdui-color-on-surface-variant));
        font-size: var(--mdui-typescale-label-large-size);
        line-height: var(--mdui-typescale-label-large-line-height);
        letter-spacing: var(--mdui-typescale-label-large-tracking);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        backdrop-filter: blur(14px) saturate(1.15);
        -webkit-backdrop-filter: blur(14px) saturate(1.15);
    }

    mdui-dialog {
        --z-index: 25000;
        pointer-events: auto;
    }

    mdui-dialog::part(panel) {
        background-color: color-mix(
            in srgb,
            rgb(var(--mdui-color-surface-container-high)) 82%,
            transparent
        );
        border: 1px solid
            color-mix(
                in srgb,
                rgb(var(--mdui-color-outline-variant)) 50%,
                transparent
            );
        backdrop-filter: blur(28px) saturate(1.2);
        -webkit-backdrop-filter: blur(28px) saturate(1.2);
    }

    mdui-snackbar {
        --z-index: 30000;
        background-color: color-mix(
            in srgb,
            rgb(var(--mdui-color-inverse-surface)) 84%,
            transparent
        );
        border: 1px solid
            color-mix(
                in srgb,
                rgb(var(--mdui-color-outline-variant)) 45%,
                transparent
            );
        backdrop-filter: blur(18px) saturate(1.15);
        -webkit-backdrop-filter: blur(18px) saturate(1.15);
    }

    mdui-snackbar[data-type="error"] {
        --mdui-color-inverse-surface: var(--mdui-color-error-container);
        --mdui-color-inverse-on-surface: var(--mdui-color-on-error-container);
    }

    @media (min-width: 840px) {
        .now-song-title {
            font-size: var(--mdui-typescale-headline-large-size);
            line-height: var(--mdui-typescale-headline-large-line-height);
            letter-spacing: var(--mdui-typescale-headline-large-tracking);
        }
    }

    /* Compact layout for short windows (for example a 946x526 sandbox frame).
       Without this, the vertical flex layout squeezes the song card until its
       cover and text overlap. */
    @media (max-height: 780px) {
        .now-menu-main {
            gap: 12px;
            padding: 20px 0;
        }
    }

    @media (max-height: 700px) {
        .now-menu-screen {
            padding: 8px clamp(16px, 3.5vw, 40px) 10px;
        }

        mdui-top-app-bar.now-top-app-bar {
            min-height: 56px;
            height: 56px;
        }

        .now-brand-mark {
            width: 40px;
            height: 40px;
            font-size: 22px;
        }

        .now-menu-main {
            gap: 8px;
            padding: 12px 0;
        }

        .now-presets-heading {
            margin-bottom: 6px;
        }

        mdui-card.now-preset-card {
            min-height: 80px;
            gap: 6px;
            padding: 8px;
        }

        .now-preset-mark {
            width: 40px;
            height: 40px;
            font-size: 13px;
        }

        .now-song-card-inner {
            grid-template-columns: clamp(120px, 22vh, 160px) minmax(0, 1fr);
            gap: 20px;
            padding: 14px 16px;
        }

        .now-song-cover {
            min-height: 0;
        }

        .now-song-body {
            padding: 0;
        }

        .now-song-title {
            margin-top: 4px;
            font-size: var(--mdui-typescale-headline-small-size);
            line-height: var(--mdui-typescale-headline-small-line-height);
            letter-spacing: var(--mdui-typescale-headline-small-tracking);
        }

        .now-song-artist {
            margin-top: 4px;
            font-size: var(--mdui-typescale-body-medium-size);
            line-height: var(--mdui-typescale-body-medium-line-height);
            letter-spacing: var(--mdui-typescale-body-medium-tracking);
        }

        .now-song-meta {
            gap: 6px;
            margin-top: 10px;
        }

        .now-meta-item {
            min-height: 26px;
            padding: 2px 10px;
        }

        .now-meta-item strong {
            font-size: var(--mdui-typescale-label-medium-size);
        }

        .now-song-actions {
            margin-top: 10px;
        }

        .now-drop-hint-inner {
            min-height: 38px;
            padding: 4px 16px;
        }

        .now-play-hint {
            font-size: var(--mdui-typescale-label-medium-size);
            line-height: var(--mdui-typescale-label-medium-line-height);
        }

        .now-menu-footer {
            padding-top: 6px;
        }
    }

    @media (max-width: 600px) {
        .now-menu-screen {
            padding: 8px 16px 16px;
        }

        mdui-top-app-bar.now-top-app-bar {
            min-height: 56px;
            height: 56px;
        }

        .now-brand-mark {
            width: 40px;
            height: 40px;
            border-radius: var(--mdui-shape-corner-medium);
            font-size: 22px;
        }

        .now-brand-copy h1 {
            font-size: var(--mdui-typescale-title-medium-size);
            line-height: var(--mdui-typescale-title-medium-line-height);
        }

        .now-menu-main {
            padding: 24px 0;
        }

        .now-preset-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
        }

        .now-preset-grid:has(> :only-child) {
            grid-template-columns: minmax(180px, 1fr);
        }

        .now-song-card-inner {
            grid-template-columns: 1fr;
            gap: 16px;
            padding: 16px;
        }

        .now-song-cover {
            aspect-ratio: 16 / 9;
            min-height: 0;
            max-height: 176px;
        }

        mdui-button {
            min-height: 48px;
        }

        mdui-chip.now-resolution-chip {
            height: 48px;
        }

        .now-song-body {
            padding: 0;
        }

        .now-song-actions mdui-button {
            flex: 1 1 auto;
        }

        .now-result-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .now-result-head {
            align-items: flex-start;
            gap: 16px;
        }

        .now-menu-footer span:last-child {
            display: none;
        }

        .now-hud-song {
            max-width: 60vw;
            font-size: var(--mdui-typescale-label-medium-size);
        }
    }

    @media (max-width: 400px) {
        .now-menu-main {
            justify-content: flex-start;
        }

        .now-top-actions {
            gap: 4px;
        }

        .now-song-meta {
            gap: 4px;
        }

        .now-meta-item {
            padding-inline: 8px;
        }
    }

    @media (max-width: 340px) {
        .now-brand {
            gap: 8px;
        }

        .now-brand-copy p {
            display: none;
        }

        mdui-chip.now-resolution-chip {
            width: 48px;
            padding: 0;
        }

        mdui-chip.now-resolution-chip #now-resolution-label {
            display: none;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
            animation-duration: 1ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 1ms !important;
            scroll-behavior: auto !important;
        }
    }
`;

export function injectBaseStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = BASE_CSS;
    document.head.appendChild(style);
}
