import i18nCore, { i18nUtils } from "../vendor/ticatec-i18n.js";
import {
    loadLocale,
    setLocale,
    templates as zhCNMduiTemplates,
} from "../vendor/mdui.js";
import zhCN from "./locales/zh-cn.ts";
import enUS from "./locales/en-us.ts";
import type { TemplateParams } from "@ticatec/i18n";

const STORAGE_KEY = "nowjs-language";
export const LANGUAGES = {
    "zh-cn": zhCN,
    "en-us": enUS,
} as const satisfies Record<string, typeof zhCN>;

type Locale = keyof typeof LANGUAGES;
const DEFAULT_LANGUAGE: Locale = "zh-cn";

type I18nProxy<T> = (() => string) & {
    readonly [Key in keyof T]: T[Key] extends string
        ? string
        : I18nProxy<T[Key]>;
};

const languageListeners = new Set<(language: Locale) => void>();

function normalizeLanguage(value: unknown): Locale | null {
    const language = String(value || "").toLowerCase();
    if (language.startsWith("zh")) return "zh-cn";
    if (language.startsWith("en")) return "en-us";
    return null;
}

function detectLanguage(): Locale {
    return (
        normalizeLanguage(i18nCore.language) ||
        normalizeLanguage(
            typeof navigator === "undefined" ? "" : navigator.language,
        ) ||
        DEFAULT_LANGUAGE
    );
}

i18nUtils.initialize(STORAGE_KEY);

let currentLanguage = detectLanguage();

i18nCore.language = currentLanguage;
i18nCore.setResource(zhCN, false);
if (currentLanguage !== "zh-cn") {
    i18nCore.setResource(enUS, true);
}

/**
 * Returns the translated string for a dot-separated key.
 */
export function t(key: string): string {
    const value = i18nCore.get(key);
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    return key;
}

function createI18nProxy<T>(prefix = ""): I18nProxy<T> {
    const target = () => t(prefix);

    return new Proxy(target, {
        get(_, property) {
            if (property === Symbol.toPrimitive) return () => t(prefix);
            if (property === "toString") return () => t(prefix);
            if (property === "valueOf") return () => t(prefix);
            if (typeof property !== "string") return undefined;

            const path = prefix ? `${prefix}.${property}` : property;
            const value = i18nCore.get(path);

            if (value !== null && typeof value === "object") {
                return createI18nProxy(path);
            }

            return t(path);
        },
    }) as I18nProxy<T>;
}

/**
 * Nested translation object. Use it as `i18n.menu.start`, `i18n.meta.bpm`, etc.
 */
export const i18n = createI18nProxy<typeof zhCN>();

export function format(template: string, params?: TemplateParams): string {
    return i18nUtils.formatText(String(template ?? ""), params);
}

export function getLanguage(): Locale {
    return currentLanguage;
}

export function onLanguageChange(
    listener: (language: Locale) => void,
): () => boolean {
    languageListeners.add(listener);
    return () => languageListeners.delete(listener);
}

let localeLoaderReady = false;

function ensureLocaleLoader() {
    if (localeLoaderReady) return;
    localeLoaderReady = true;

    loadLocale((locale) =>
        locale === "zh-cn"
            ? Promise.resolve({ templates: zhCNMduiTemplates })
            : Promise.resolve({ templates: {} }),
    );
}

async function syncMduiLocale(language: Locale): Promise<void> {
    ensureLocaleLoader();
    try {
        await setLocale(language);
    } catch (error) {
        console.warn("Failed to apply the MDUI locale", error);
    }
}

function updateDocument() {
    document.documentElement.lang =
        currentLanguage === "zh-cn" ? "zh-CN" : "en-US";
    document.title = t("app.title");

    const description = document.querySelector('meta[name="description"]');
    if (description) {
        description.setAttribute("content", t("app.description"));
    }
}

/**
 * Applies translations to all elements carrying data-i18n* attributes.
 */
export function applyI18n(root: ParentNode = document): void {
    for (const element of root.querySelectorAll<HTMLElement>("[data-i18n]")) {
        element.textContent = t(element.dataset.i18n || "");
    }

    for (const element of root.querySelectorAll<HTMLElement>(
        "[data-i18n-aria-label]",
    )) {
        element.setAttribute(
            "aria-label",
            t(element.dataset.i18nAriaLabel || ""),
        );
    }

    for (const element of root.querySelectorAll<HTMLElement>(
        "[data-i18n-title]",
    )) {
        element.setAttribute("title", t(element.dataset.i18nTitle || ""));
    }

    for (const element of root.querySelectorAll<HTMLElement>(
        "[data-i18n-content]",
    )) {
        element.setAttribute("content", t(element.dataset.i18nContent || ""));
    }
}

export async function setLanguage(language: string): Promise<void> {
    const next = normalizeLanguage(language);
    if (!next || next === currentLanguage) return;

    currentLanguage = next;
    i18nCore.language = next;
    i18nCore.setResource(LANGUAGES[next], true);
    updateDocument();

    for (const listener of languageListeners) {
        listener(next);
    }

    await syncMduiLocale(next);
}

export async function initI18n(): Promise<I18nProxy<typeof zhCN>> {
    updateDocument();
    await syncMduiLocale(currentLanguage);
    return i18n;
}
