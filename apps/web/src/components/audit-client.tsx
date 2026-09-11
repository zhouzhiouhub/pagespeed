"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { PagespeedReport } from "@/components/pagespeed-report";
import { useT } from "@/components/i18n-provider";
import { parseSiteUrl } from "@/lib/url";
import { readSiteUrl, writeSiteUrl } from "@/lib/site";

export function AuditClient({ initialUrl }: { initialUrl: string | null }) {
  const router = useRouter();
  const t = useT();
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
    <PageShell title={t("audit.title")} description={t("audit.description")}>
      {siteUrl ? (
        <div className="space-y-5">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
            <p className="text-sm text-[var(--muted)]">
              {t("audit.analyzingSite")}
            </p>
            <p className="mt-1 break-all text-lg font-medium text-[var(--fg)]">
              {siteUrl}
            </p>
            <Link
              href="/"
              className="mt-3 inline-flex text-sm font-medium text-[var(--brand-blue)] hover:underline"
            >
              {t("audit.changeSite")}
            </Link>
          </div>
          <PagespeedReport url={siteUrl} />
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-16 text-center">
          <p className="text-sm text-[var(--muted)]">{t("common.noSiteYet")}</p>
          <Link
            href="/"
            className="mt-4 inline-flex text-sm font-medium text-[var(--brand-blue)] hover:underline"
          >
            {t("common.goEnterSite")}
          </Link>
        </div>
      )}
    </PageShell>
  );
}
