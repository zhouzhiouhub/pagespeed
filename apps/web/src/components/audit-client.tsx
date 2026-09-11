"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { PagespeedReport } from "@/components/pagespeed-report";
import { parseSiteUrl } from "@/lib/url";
import { readSiteUrl, writeSiteUrl } from "@/lib/site";

export function AuditClient({ initialUrl }: { initialUrl: string | null }) {
  const router = useRouter();
  const [siteUrl, setSiteUrl] = useState<string | null>(initialUrl);

  useEffect(() => {
    if (initialUrl) {
      writeSiteUrl(initialUrl);
      setSiteUrl(initialUrl);
      return;
    }

    const saved = readSiteUrl();
    if (!saved) return;
    const parsed = parseSiteUrl(saved);
    if (!parsed.ok) return;
    setSiteUrl(parsed.url);
    router.replace(`/audit?url=${encodeURIComponent(parsed.url)}`);
  }, [initialUrl, router]);

  return (
    <PageShell
      title="网站分析"
      description="基于 PageSpeed Insights（Lighthouse）的性能、SEO、无障碍与最佳实践评分。"
    >
      {siteUrl ? (
        <div className="space-y-5">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
            <p className="text-sm text-[var(--muted)]">分析站点</p>
            <p className="mt-1 break-all text-lg font-medium text-[var(--fg)]">
              {siteUrl}
            </p>
            <Link
              href="/"
              className="mt-3 inline-flex text-sm font-medium text-[var(--brand-blue)] hover:underline"
            >
              ← 更换网站
            </Link>
          </div>
          <PagespeedReport url={siteUrl} />
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-16 text-center">
          <p className="text-sm text-[var(--muted)]">
            还没有网站。请先在 Dashboard 输入 URL。
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex text-sm font-medium text-[var(--brand-blue)] hover:underline"
          >
            去输入网站 →
          </Link>
        </div>
      )}
    </PageShell>
  );
}
