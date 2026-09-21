"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { PagespeedReport } from "@/components/pagespeed-report";
import { SiteUrlForm } from "@/components/site-url-form";
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
      <div className="space-y-5">
        <div className="max-w-3xl">
          <SiteUrlForm
            initialUrl={siteUrl ?? ""}
            hint={siteUrl ? t("dashboard.switchHint") : undefined}
            autoFocus={!siteUrl}
            onConfirm={(url) => {
              writeSiteUrl(url);
              setSiteUrl(url);
              router.replace(`/audit?url=${encodeURIComponent(url)}`);
            }}
          />
          {!siteUrl ? (
            <p className="mt-3 text-sm text-[var(--muted)]">
              <Link
                href="/onboarding"
                className="font-medium text-[var(--brand-blue)] underline-offset-2 hover:underline"
              >
                {t("dashboard.startOnboarding")}
              </Link>
            </p>
          ) : null}
        </div>

        {siteUrl ? <PagespeedReport url={siteUrl} /> : null}
      </div>
    </PageShell>
  );
}
