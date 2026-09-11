"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { readSiteUrl } from "@/lib/site";
import type { Locale } from "@/lib/i18n/locale";

function hostLabel(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function AppNav({ pathname }: { pathname: string }) {
  const { locale, setLocale, t } = useI18n();
  const [siteUrl, setSiteUrl] = useState<string | null>(null);

  useEffect(() => {
    setSiteUrl(readSiteUrl());
  }, [pathname]);

  const nav = [
    { href: "/", label: t("nav.dashboard"), withSite: false },
    { href: "/audit", label: t("nav.audit"), withSite: true },
    { href: "/keywords", label: t("nav.keywords"), withSite: true },
    { href: "/content", label: t("nav.content"), withSite: true },
    { href: "/geo", label: t("nav.geo"), withSite: true },
    { href: "/advice", label: t("nav.advice"), withSite: true },
  ] as const;

  function switchLocale(next: Locale) {
    if (next === locale) return;
    setLocale(next);
  }

  return (
    <header className="border-b border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 tracking-tight text-[var(--fg)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/symbol.svg"
            alt="Kinolin"
            width={28}
            height={28}
            className="h-7 w-7 rounded-md"
          />
          <span className="font-semibold">Growth Agent</span>
        </Link>
        <nav className="flex flex-1 flex-wrap items-center gap-1 text-sm">
          {nav.map((item) => {
            const href =
              item.withSite && siteUrl
                ? `${item.href}?url=${encodeURIComponent(siteUrl)}`
                : item.href;
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={href}
                className={
                  active
                    ? "rounded-md bg-[var(--accent-soft)] px-2.5 py-1.5 font-medium text-[var(--brand-blue)]"
                    : "rounded-md px-2.5 py-1.5 text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-3">
          <div
            className="inline-flex rounded-md border border-[var(--border)] p-0.5 text-xs"
            role="group"
            aria-label={t("nav.switchLang")}
          >
            <button
              type="button"
              onClick={() => switchLocale("zh")}
              className={
                locale === "zh"
                  ? "rounded px-2 py-1 font-medium text-[var(--brand-blue)] bg-[var(--accent-soft)]"
                  : "rounded px-2 py-1 text-[var(--muted)] hover:text-[var(--fg)]"
              }
            >
              {t("nav.langZh")}
            </button>
            <button
              type="button"
              onClick={() => switchLocale("en")}
              className={
                locale === "en"
                  ? "rounded px-2 py-1 font-medium text-[var(--brand-blue)] bg-[var(--accent-soft)]"
                  : "rounded px-2 py-1 text-[var(--muted)] hover:text-[var(--fg)]"
              }
            >
              {t("nav.langEn")}
            </button>
          </div>
          <span
            className="hidden max-w-[12rem] truncate text-xs text-[var(--muted)] sm:inline"
            title={siteUrl ?? undefined}
          >
            {siteUrl ? hostLabel(siteUrl) : t("nav.noSite")}
          </span>
        </div>
      </div>
    </header>
  );
}
