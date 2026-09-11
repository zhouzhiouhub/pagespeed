"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteUrlForm } from "@/components/site-url-form";
import { Ga4ConnectPanel } from "@/components/ga4-connect-panel";
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

  const load = useCallback(async (url: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard?url=${encodeURIComponent(url)}`);
      const json = (await res.json()) as DashboardData & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "加载失败");
        return;
      }
      setData(json);
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAnalytics = useCallback(async (url: string) => {
    setAnalyticsBusy(true);
    try {
      const res = await fetch(`/api/analytics?url=${encodeURIComponent(url)}`);
      const json = (await res.json()) as AnalyticsNarrative & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Analytics Agent 失败");
        return;
      }
      setAnalytics(json);
    } catch {
      setError("Analytics 请求失败");
    } finally {
      setAnalyticsBusy(false);
    }
  }, []);

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
        setError(json.error ?? "爬取失败");
        return;
      }
      await load(siteUrl);
    } catch {
      setError("爬取请求失败");
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
            让网站持续增长
          </h1>
          <p className="mt-4 max-w-xl text-center text-base text-[var(--muted)] sm:text-lg">
            输入网址，立刻得到 SEO + GEO 机会与下一步行动——不只是一份报告。
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
    { href: `/audit?url=${encodeURIComponent(siteUrl)}`, label: "网站分析" },
    { href: `/keywords?url=${encodeURIComponent(siteUrl)}`, label: "关键词" },
    { href: `/content?url=${encodeURIComponent(siteUrl)}`, label: "内容" },
    { href: `/geo?url=${encodeURIComponent(siteUrl)}`, label: "GEO" },
    { href: `/advice?url=${encodeURIComponent(siteUrl)}`, label: "今日建议" },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-[var(--muted)]">Dashboard</p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--fg)]">
            {data?.site.name ?? "站点"}
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
            {crawling ? "全站抽样爬取中…" : "运行多页爬取"}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void load(siteUrl)}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--fg)] hover:bg-[var(--surface-2)]"
          >
            刷新
          </button>
          <Link
            href="/"
            onClick={() => {
              writeSiteUrl("");
            }}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] hover:bg-[var(--surface-2)]"
          >
            更换站点
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
          { label: "综合", value: scores?.overall },
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
          <h2 className="font-semibold text-[var(--fg)]">最近审计</h2>
          {data?.audit ? (
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted)]">页面</dt>
                <dd>{data.audit.pageCount}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted)]">Issues</dt>
                <dd>{data.audit.issueCount}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted)]">完成时间</dt>
                <dd>
                  {data.audit.finishedAt
                    ? new Date(data.audit.finishedAt).toLocaleString()
                    : "—"}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-[var(--muted)]">
              尚未爬取。点击「运行多页爬取」开始（sitemap + 抽样）。
            </p>
          )}
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
          <h2 className="font-semibold text-[var(--fg)]">数据接入</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex justify-between gap-4">
              <span className="text-[var(--muted)]">PageSpeed</span>
              <span>{data?.integrations.pagespeed ? "已配置" : "未配置"}</span>
            </li>
            <li className="flex justify-between gap-4">
              <span className="text-[var(--muted)]">GSC</span>
              <span>
                {data?.integrations.gsc
                  ? `${data.gsc?.opportunityCount ?? 0} 机会`
                  : "未连接"}
              </span>
            </li>
            <li className="flex justify-between gap-4">
              <span className="text-[var(--muted)]">GA4</span>
              <span>
                {data?.integrations.ga4
                  ? `${data.ga4.sessions7d ?? 0} sessions`
                  : "未连接"}
              </span>
            </li>
            <li className="flex justify-between gap-4">
              <span className="text-[var(--muted)]">Postgres</span>
              <span>{data?.database.available ? "可用" : "降级文件存储"}</span>
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
              管理 GSC →
            </Link>
            <button
              type="button"
              disabled={analyticsBusy}
              onClick={() => void loadAnalytics(siteUrl)}
              className="text-sm font-medium text-[var(--brand-blue)] hover:underline disabled:opacity-50"
            >
              {analyticsBusy ? "生成叙事中…" : "运行 Analytics Agent"}
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
              <p className="text-sm font-medium text-[var(--fg)]">下一步</p>
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
            <h2 className="font-semibold text-[var(--fg)]">今日建议</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {data?.advice?.headline ?? "尚未生成"}
            </p>
          </div>
          <Link
            href={`/advice?url=${encodeURIComponent(siteUrl)}`}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--brand-blue)] hover:bg-[var(--surface-2)]"
          >
            {data?.advice
              ? `查看 ${data.advice.openCount} 项 open →`
              : "生成建议 →"}
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
