export const LOCALES = ["zh", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_COOKIE = "wa_locale";
export const LOCALE_STORAGE_KEY = "wa_locale";

export const DEFAULT_LOCALE: Locale = "zh";

export function isLocale(value: unknown): value is Locale {
  return value === "zh" || value === "en";
}

export function htmlLang(locale: Locale): string {
  return locale === "en" ? "en" : "zh-CN";
}

export function psiLocale(locale: Locale): string {
  return locale === "en" ? "en" : "zh-CN";
}

export function dateLocale(locale: Locale): string {
  return locale === "en" ? "en-US" : "zh-CN";
}
