"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteUrlForm } from "@/components/site-url-form";
import { Ga4ConnectPanel } from "@/components/ga4-connect-panel";
import { useI18n, useT } from "@/components/i18n-provider";
import { dateLocale } from "@/lib/i18n/locale";
import { parseSiteUrl } from "@/lib/url";
import { readSiteUrl, writeSiteUrl } from "@/lib/site";

type DashboardData = {
  site: { id: string; url: string; name: string; status: string };
  database: { available: boolean };
  scores: Record<string, number> | null;
  audit: {
    id: string;
    finishedAt: string | null;
    pageCount: number;
    issueCount: number;
    summary: Record<string, number>;
  } | null;
  integrations: { pagespeed: boolean; gsc: boolean; ga4: boolean };
  gsc: {
    property: string | null;
    lastSyncedAt: string | null;
    rowCount: number;
    opportunityCount: number;
  } | null;
  ga4: {
    connected: boolean;
    note: string;
    sessions7d: number | null;
    users7d: number | null;
    topPages?: Array<{ path: string; sessions: number; users?: number }>;
  };
  advice: {
    runId: string;
    generatedAt: string;
    headline: string;
    openCount: number;
    itemCount: number;
  } | null;
};

type AnalyticsNarrative = {
  headline: string;
  summary: string;
  bullets: string[];
  risks: string[];
  nextActions: string[];
  source: string;
  warning: string | null;
};

export function DashboardClient({ initialUrl }: { initialUrl: string | null }) {
  const router = useRouter();
  const t = useT();
  const { locale } = useI18n();
  const [siteUrl, setSiteUrl] = useState<string | null>(initialUrl);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsNarrative | null>(null);
  const [analyticsBusy, setAnalyticsBusy] = useState(false);

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
    router.replace(`/?url=${encodeURIComponent(parsed.url)}`);
  }, [initialUrl, router]);

  const load = useCallback(
    async (url: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/dashboard?url=${encodeURIComponent(url)}`);
        const json = (await res.json()) as DashboardData & { error?: string };
        if (!res.ok) {
          setError(json.error ?? t("common.loadFailed"));
          return;
        }
        setData(json);
      } catch {
        setError(t("common.networkErrorShort"));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  const loadAnalytics = useCallback(
    async (url: string) => {
      setAnalyticsBusy(true);
      try {
        const res = await fetch(`/api/analytics?url=${encodeURIComponent(url)}`);
        const json = (await res.json()) as AnalyticsNarrative & {
          error?: string;
        };
        if (!res.ok) {
          setError(json.error ?? t("dashboard.analyticsFailed"));
          return;
        }
        setAnalytics(json);
      } catch {
        setError(t("dashboard.analyticsRequestFailed"));
      } finally {
        setAnalyticsBusy(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (!siteUrl) return;
    void load(siteUrl);
  }, [siteUrl, load]);

  async function runCrawl() {
    if (!siteUrl) return;
    setCrawling(true);
    setError(null);
    try {
      const res = await fetch("/api/crawl", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: siteUrl, maxPages: 30 }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? t("dashboard.crawlFailed"));
        return;
      }
      await load(siteUrl);
    } catch {
      setError(t("dashboard.crawlRequestFailed"));
    } finally {
      setCrawling(false);
    }
  }

  if (!siteUrl) {
    return (
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(25,217,255,0.14),transparent_55%),radial-gradient(ellipse_at_80%_20%,rgba(22,119,255,0.10),transparent_45%),linear-gradient(180deg,var(--surface)_0%,var(--background)_48%,var(--background)_100%)]"
        />
        <section className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 py-16 sm:py-24">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.svg"
            alt="Kinolin"
            width={220}
            height={60}
            className="h-10 w-auto sm:h-12"
          />
          <h1 className="mt-10 text-center text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">
            {t("dashboard.heroTitle")}
          </h1>
          <p className="mt-4 max-w-xl text-center text-base text-[var(--muted)] sm:text-lg">
            {t("dashboard.heroSubtitle")}
          </p>
          <div className="mt-10 w-full">
            <SiteUrlForm />
          </div>
        </section>
      </div>
    );
  }

  const scores = data?.scores;
  const links = [
    {
      href: `/audit?url=${encodeURIComponent(siteUrl)}`,
      label: t("dashboard.linkAudit"),
    },
    {
      href: `/keywords?url=${encodeURIComponent(siteUrl)}`,
      label: t("dashboard.linkKeywords"),
    },
    {
      href: `/content?url=${encodeURIComponent(siteUrl)}`,
      label: t("dashboard.linkContent"),
    },
    { href: `/geo?url=${encodeURIComponent(siteUrl)}`, label: t("nav.geo") },
    {
      href: `/advice?url=${encodeURIComponent(siteUrl)}`,
      label: t("dashboard.linkAdvice"),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-[var(--muted)]">Dashboard</p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--fg)]">
            {data?.site.name ?? t("dashboard.siteFallback")}
          </h1>
          <p className="mt-1 break-all text-sm text-[var(--muted)]">{siteUrl}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={crawling}
            onClick={() => void runCrawl()}
            className="rounded-lg bg-[var(--brand-blue)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--brand-blue-deep)] disabled:opacity-60"
          >
            {crawling ? t("dashboard.crawlRunning") : t("dashboard.crawlRun")}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void load(siteUrl)}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--fg)] hover:bg-[var(--surface-2)]"
          >
            {t("common.refresh")}
          </button>
          <Link
            href="/"
            onClick={() => {
              writeSiteUrl("");
            }}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] hover:bg-[var(--surface-2)]"
          >
            {t("dashboard.changeSite")}
          </Link>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-[#f5c2c0] bg-[#fef2f1] px-4 py-3 text-sm text-[#d93025]">
          {error}
        </p>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          { label: "SEO", value: scores?.seo },
          { label: "GEO", value: scores?.geo },
          { label: t("dashboard.scoreOverall"), value: scores?.overall },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5"
          >
            <p className="text-sm text-[var(--muted)]">{s.label}</p>
            <p className="mt-2 text-3xl font-semibold text-[var(--fg)]">
              {typeof s.value === "number" ? s.value : "—"}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
          <h2 className="font-semibold text-[var(--fg)]">
            {t("dashboard.recentAudit")}
          </h2>
          {data?.audit ? (
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted)]">{t("dashboard.pages")}</dt>
                <dd>{data.audit.pageCount}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted)]">Issues</dt>
                <dd>{data.audit.issueCount}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted)]">
                  {t("dashboard.finishedAt")}
                </dt>
                <dd>
                  {data.audit.finishedAt
                    ? new Date(data.audit.finishedAt).toLocaleString(
                        dateLocale(locale),
                      )
                    : "—"}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-[var(--muted)]">
              {t("dashboard.noCrawlYet")}
            </p>
          )}
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
          <h2 className="font-semibold text-[var(--fg)]">
            {t("dashboard.dataAccess")}
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex justify-between gap-4">
              <span className="text-[var(--muted)]">PageSpeed</span>
              <span>
                {data?.integrations.pagespeed
                  ? t("dashboard.configured")
                  : t("dashboard.notConfigured")}
              </span>
            </li>
            <li className="flex justify-between gap-4">
              <span className="text-[var(--muted)]">GSC</span>
              <span>
                {data?.integrations.gsc
                  ? t("dashboard.opportunitiesCount", {
                      count: data.gsc?.opportunityCount ?? 0,
                    })
                  : t("dashboard.notConnected")}
              </span>
            </li>
            <li className="flex justify-between gap-4">
              <span className="text-[var(--muted)]">GA4</span>
              <span>
                {data?.integrations.ga4
                  ? `${data.ga4.sessions7d ?? 0} sessions`
                  : t("dashboard.notConnected")}
              </span>
            </li>
            <li className="flex justify-between gap-4">
              <span className="text-[var(--muted)]">Postgres</span>
              <span>
                {data?.database.available
                  ? t("dashboard.dbAvailable")
                  : t("dashboard.dbFallback")}
              </span>
            </li>
          </ul>
          {data?.ga4?.note ? (
            <p className="mt-3 text-xs text-[var(--muted)]">{data.ga4.note}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/keywords?url=${encodeURIComponent(siteUrl)}`}
              className="text-sm font-medium text-[var(--brand-blue)] hover:underline"
            >
              {t("dashboard.manageGsc")}
            </Link>
            <button
              type="button"
              disabled={analyticsBusy}
              onClick={() => void loadAnalytics(siteUrl)}
              className="text-sm font-medium text-[var(--brand-blue)] hover:underline disabled:opacity-50"
            >
              {analyticsBusy
                ? t("dashboard.analyticsRunning")
                : t("dashboard.analyticsRun")}
            </button>
          </div>
        </section>
      </div>

      <div className="mt-4">
        <Ga4ConnectPanel siteUrl={siteUrl} onSynced={() => void load(siteUrl)} />
      </div>

      {analytics ? (
        <section className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
          <p className="text-xs text-[var(--muted)]">
            Analytics Agent · {analytics.source}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-[var(--fg)]">
            {analytics.headline}
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">{analytics.summary}</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--fg)]">
            {analytics.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          {analytics.nextActions.length ? (
            <div className="mt-4">
              <p className="text-sm font-medium text-[var(--fg)]">
                {t("dashboard.nextSteps")}
              </p>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-[var(--muted)]">
                {analytics.nextActions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ol>
            </div>
          ) : null}
          {analytics.warning ? (
            <p className="mt-3 text-xs text-[#8a5a00]">{analytics.warning}</p>
          ) : null}
        </section>
      ) : null}

      <section className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-[var(--fg)]">
              {t("dashboard.todaysAdvice")}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {data?.advice?.headline ?? t("dashboard.notGenerated")}
            </p>
          </div>
          <Link
            href={`/advice?url=${encodeURIComponent(siteUrl)}`}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--brand-blue)] hover:bg-[var(--surface-2)]"
          >
            {data?.advice
              ? t("dashboard.viewOpenAdvice", {
                  count: data.advice.openCount,
                })
              : t("dashboard.generateAdvice")}
          </Link>
        </div>
      </section>

      <nav className="mt-6 flex flex-wrap gap-2">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--fg)] hover:bg-[var(--surface-2)]"
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
