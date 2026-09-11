"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readSiteUrl } from "@/lib/site";

const NAV = [
  { href: "/", label: "Dashboard", withSite: false },
  { href: "/audit", label: "网站分析", withSite: true },
  { href: "/keywords", label: "关键词", withSite: false },
  { href: "/content", label: "内容", withSite: false },
  { href: "/geo", label: "GEO", withSite: false },
  { href: "/advice", label: "增长建议", withSite: false },
] as const;

function hostLabel(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function AppNav({ pathname }: { pathname: string }) {
  const [siteUrl, setSiteUrl] = useState<string | null>(null);

  useEffect(() => {
    setSiteUrl(readSiteUrl());
  }, [pathname]);

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
          {NAV.map((item) => {
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
        <span
          className="hidden max-w-[12rem] truncate text-xs text-[var(--muted)] sm:inline"
          title={siteUrl ?? undefined}
        >
          {siteUrl ? hostLabel(siteUrl) : "未接入站点"}
        </span>
      </div>
    </header>
  );
}
