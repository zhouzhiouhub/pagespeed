import { z } from "zod";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "@/lib/i18n/locale";
import { translate } from "@/lib/i18n/messages";

export type UrlParseErrorCode = "required" | "invalid";

const rawUrlSchema = z.string().trim().min(1);

export function normalizeSiteUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  // Prefer https for public sites so lab scores match pagespeed.web.dev
  if (/^http:\/\//i.test(trimmed)) {
    return trimmed.replace(/^http:\/\//i, "https://");
  }
  if (/^https:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function parseSiteUrl(input: string): {
  ok: true;
  url: string;
  hostname: string;
} | {
  ok: false;
  error: string;
  code: UrlParseErrorCode;
} {
  const raw = rawUrlSchema.safeParse(input);
  if (!raw.success) {
    return {
      ok: false,
      code: "required",
      error: translate(DEFAULT_LOCALE, "url.required"),
    };
  }

  const normalized = normalizeSiteUrl(raw.data);

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return {
      ok: false,
      code: "invalid",
      error: translate(DEFAULT_LOCALE, "url.invalid"),
    };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return {
      ok: false,
      code: "invalid",
      error: translate(DEFAULT_LOCALE, "url.invalid"),
    };
  }

  if (!parsed.hostname.includes(".")) {
    return {
      ok: false,
      code: "invalid",
      error: translate(DEFAULT_LOCALE, "url.invalid"),
    };
  }

  return {
    ok: true,
    url: parsed.origin + (parsed.pathname === "/" ? "" : parsed.pathname),
    hostname: parsed.hostname,
  };
}

export function urlErrorMessageKey(
  code: UrlParseErrorCode,
): "url.required" | "url.invalid" {
  return code === "required" ? "url.required" : "url.invalid";
}

export function localeFromRequest(request: Request): Locale {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(
    new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`),
  );
  const value = match?.[1] ? decodeURIComponent(match[1]) : null;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function localizedUrlError(
  code: UrlParseErrorCode,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return translate(locale, urlErrorMessageKey(code));
}
