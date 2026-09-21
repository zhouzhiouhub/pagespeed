"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
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
  const [langOpen, setLangOpen] = useState(false);
  const langWrapRef = useRef<HTMLDivElement>(null);
  const langMenuId = useId();

  useEffect(() => {
    setSiteUrl(readSiteUrl());
  }, [pathname]);

  useEffect(() => {
    if (!langOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (!langWrapRef.current?.contains(event.target as Node)) {
        setLangOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setLangOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [langOpen]);

  const nav = [
    { href: "/audit", label: t("nav.audit"), withSite: true },
    { href: "/keywords", label: t("nav.keywords"), withSite: true },
    { href: "/content", label: t("nav.content"), withSite: true },
    { href: "/geo", label: t("nav.geo"), withSite: true },
    { href: "/advice", label: t("nav.advice"), withSite: true },
  ] as const;

  const localeOptions: Array<{ value: Locale; label: string }> = [
    { value: "zh", label: t("nav.langZh") },
    { value: "en", label: t("nav.langEn") },
  ];

  const currentLabel =
    localeOptions.find((item) => item.value === locale)?.label ??
    t("nav.langZh");

  function switchLocale(next: Locale) {
    if (next !== locale) setLocale(next);
    setLangOpen(false);
  }

  return (
    <header className="border-b border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
        <Link
          href={
            siteUrl
              ? `/audit?url=${encodeURIComponent(siteUrl)}`
              : "/audit"
          }
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
              pathname === item.href || pathname.startsWith(`${item.href}/`);
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
          <div className="relative" ref={langWrapRef}>
            <button
              type="button"
              aria-label={t("nav.switchLang")}
              aria-haspopup="listbox"
              aria-expanded={langOpen}
              aria-controls={langMenuId}
              onClick={() => setLangOpen((open) => !open)}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--fg)] hover:bg-[var(--surface-2)]"
            >
              <span>{currentLabel}</span>
              <svg
                aria-hidden
                viewBox="0 0 12 12"
                className={`h-3 w-3 text-[var(--muted)] transition-transform ${langOpen ? "rotate-180" : ""}`}
              >
                <path
                  d="M2.5 4.5 6 8l3.5-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {langOpen ? (
              <ul
                id={langMenuId}
                role="listbox"
                aria-label={t("nav.switchLang")}
                className="absolute right-0 z-50 mt-1 min-w-[7.5rem] overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] py-1 shadow-[0_8px_24px_rgba(11,23,48,0.12)]"
              >
                {localeOptions.map((option) => {
                  const active = option.value === locale;
                  return (
                    <li key={option.value} role="option" aria-selected={active}>
                      <button
                        type="button"
                        onClick={() => switchLocale(option.value)}
                        className={
                          active
                            ? "flex w-full items-center justify-between px-3 py-1.5 text-left text-xs font-medium text-[var(--brand-blue)] bg-[var(--accent-soft)]"
                            : "flex w-full items-center px-3 py-1.5 text-left text-xs text-[var(--fg)] hover:bg-[var(--surface-2)]"
                        }
                      >
                        <span>{option.label}</span>
                        {active ? (
                          <span aria-hidden className="text-[var(--brand-blue)]">
                            ✓
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
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
