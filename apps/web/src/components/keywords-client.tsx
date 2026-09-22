"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { useI18n, useT } from "@/components/i18n-provider";
import {
  getCachedKeywords,
  setCachedKeywords,
  type KeywordOpportunity,
  type KeywordsResponse,
} from "@/lib/keywords-cache";
import type { MessageKey } from "@/lib/i18n/messages";
import { parseSiteUrl } from "@/lib/url";
import { readSiteUrl, writeSiteUrl } from "@/lib/site";

type ActionPlan = {
  query: string;
  page: string;
  summary: string;
  estimatedLift: string;
  titleOptions: string[];
  metaDescription: string;
  definitionBlock: string;
  faq: Array<{ question: string; answer: string }>;
  outline: string[];
  internalLinks: string[];
  schemaHints: string[];
  steps: Array<{ order: number; title: string; content: string }>;
  source: "ai" | "heuristic";
  warning: string | null;
};

type TFn = (key: MessageKey, params?: Record<string, string | number>) => string;

function stars(n: number) {
  const clamped = Math.max(1, Math.min(5, Math.round(n)));
  return "★".repeat(clamped) + "☆".repeat(5 - clamped);
}

function trendLabel(trend: number | null) {
  if (trend === null) return "—";
  if (trend < 0) return `↑${Math.abs(trend)}`;
  if (trend > 0) return `↓${trend}`;
  return "→0";
}

function trendClass(trend: number | null) {
  if (trend === null) return "text-[var(--muted)]";
  if (trend < 0) return "text-[#0f9d58]";
  if (trend > 0) return "text-[#d93025]";
  return "text-[var(--muted)]";
}

function sourceLabel(source: KeywordsResponse["source"], t: TFn) {
  if (source === "ai") return t("keywords.sourceAi");
  return t("keywords.sourceHeuristic");
}

function KeywordsTable({
  items,
  selected,
  onSelect,
}: {
  items: KeywordOpportunity[];
  selected: string | null;
  onSelect: (query: string) => void;
}) {
  const t = useT();
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-[var(--border)] bg-[var(--surface-2)]/60 text-[var(--muted)]">
          <tr>
            <th className="px-4 py-3 font-medium">{t("keywords.colKeyword")}</th>
            <th className="px-4 py-3 font-medium">{t("keywords.colRank")}</th>
            <th className="px-4 py-3 font-medium">{t("keywords.colTrend")}</th>
            <th className="px-4 py-3 font-medium">{t("keywords.colLanding")}</th>
            <th className="px-4 py-3 font-medium">{t("keywords.colPotential")}</th>
            <th className="px-4 py-3 font-medium">{t("keywords.colAction")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const active = selected === item.query;
            return (
              <tr
                key={item.query}
                className={
                  active
                    ? "border-t border-[var(--border)] bg-[var(--accent-soft)]/50"
                    : "border-t border-[var(--border)] hover:bg-[var(--surface-2)]/40"
                }
              >
                <td className="px-4 py-3 font-medium text-[var(--fg)]">
                  {item.query}
                </td>
                <td className="px-4 py-3 text-[var(--fg)]">
                  {item.position ? `#${item.position}` : "—"}
                </td>
                <td className={`px-4 py-3 font-medium ${trendClass(item.trend7d)}`}>
                  {trendLabel(item.trend7d)}
                </td>
                <td className="max-w-[14rem] truncate px-4 py-3 text-[var(--muted)]">
                  {item.page}
                </td>
                <td className="px-4 py-3 tracking-tight text-[#c26400]">
                  {stars(item.potential)}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onSelect(item.query)}
                    className="text-sm font-medium text-[var(--brand-blue)] hover:underline"
                  >
                    {t("keywords.viewPlan")}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DetailPanel({
  item,
  siteUrl,
}: {
  item: KeywordOpportunity;
  siteUrl: string;
}) {
  const t = useT();
  const [plan, setPlan] = useState<ActionPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const estimated =
    item.position != null
      ? `#${item.position} → #${Math.max(3, item.position - 8)}~${Math.max(5, item.position - 4)}`
      : t("keywords.rankEstimate");

  useEffect(() => {
    setPlan(null);
    setPlanError(null);
  }, [item.query, item.page]);

  async function generatePlan() {
    setBusy(true);
    setPlanError(null);
    try {
      const res = await fetch("/api/action-plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: siteUrl, opportunity: item }),
      });
      const json = (await res.json()) as ActionPlan & { error?: string };
      if (!res.ok) {
        setPlanError(json.error ?? t("keywords.planFailed"));
        return;
      }
      setPlan(json);
    } catch {
      setPlanError(t("common.networkError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        {t("keywords.detailTitle")}
      </p>
      <h2 className="mt-2 text-lg font-semibold text-[var(--fg)]">{item.query}</h2>
      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="text-[var(--muted)]">{t("keywords.estimatedLift")}</dt>
          <dd className="mt-0.5 font-medium text-[var(--fg)]">{estimated}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">{t("keywords.intent")}</dt>
          <dd className="mt-0.5 text-[var(--fg)]">{item.intent ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">{t("keywords.landingPage")}</dt>
          <dd className="mt-0.5 break-all text-[var(--fg)]">{item.page}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">{t("keywords.whyWorth")}</dt>
          <dd className="mt-0.5 leading-relaxed text-[var(--fg)]">
            {item.rationale}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">{t("keywords.suggestedActions")}</dt>
          <dd className="mt-2 space-y-1.5">
            {item.actions.map((action, i) => (
              <p key={action} className="text-[var(--fg)]">
                {i + 1}. {action}
              </p>
            ))}
          </dd>
        </div>
      </dl>
      <button
        type="button"
        disabled={busy}
        onClick={() => void generatePlan()}
        className="mt-5 w-full rounded-lg bg-[var(--brand-blue)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-blue-deep)] disabled:opacity-60"
      >
        {busy
          ? t("keywords.generatingPlan")
          : plan
            ? t("keywords.regeneratePlan")
            : t("keywords.generatePlan")}
      </button>

      {planError ? (
        <p className="mt-3 text-sm text-[#d93025]">{planError}</p>
      ) : null}

      {plan ? (
        <div className="mt-5 space-y-4 border-t border-[var(--border)] pt-4 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {t("keywords.optimizePlan")}
              {plan.source === "ai" ? t("common.aiSuffix") : t("common.ruleSuffix")}
            </p>
            <p className="mt-2 leading-relaxed text-[var(--fg)]">{plan.summary}</p>
            <p className="mt-1 text-[var(--muted)]">
              {t("keywords.estimated", { lift: plan.estimatedLift })}
            </p>
            {plan.warning ? (
              <p className="mt-2 text-xs text-[#8a5a00]">{plan.warning}</p>
            ) : null}
          </div>

          <div>
            <p className="font-medium text-[var(--fg)]">
              {t("keywords.titleCandidates")}
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[var(--muted)]">
              {plan.titleOptions.map((title) => (
                <li key={title}>{title}</li>
              ))}
            </ul>
          </div>

          <div>
            <p className="font-medium text-[var(--fg)]">Meta Description</p>
            <p className="mt-1 text-[var(--muted)]">{plan.metaDescription}</p>
          </div>

          <div>
            <p className="font-medium text-[var(--fg)]">
              {t("keywords.directAnswer")}
            </p>
            <p className="mt-1 text-[var(--muted)]">{plan.definitionBlock}</p>
          </div>

          <div>
            <p className="font-medium text-[var(--fg)]">FAQ</p>
            <ul className="mt-2 space-y-2">
              {plan.faq.map((f) => (
                <li key={f.question}>
                  <p className="font-medium text-[var(--fg)]">Q: {f.question}</p>
                  <p className="text-[var(--muted)]">A: {f.answer}</p>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="font-medium text-[var(--fg)]">{t("keywords.outline")}</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-[var(--muted)]">
              {plan.outline.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ol>
          </div>

          <div>
            <p className="font-medium text-[var(--fg)]">
              {t("keywords.internalLinks")}
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[var(--muted)]">
              {plan.internalLinks.map((link) => (
                <li key={link}>{link}</li>
              ))}
            </ul>
          </div>

          <div>
            <p className="font-medium text-[var(--fg)]">
              {t("keywords.structuredData")}
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[var(--muted)]">
              {plan.schemaHints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
          </div>

          <div>
            <p className="font-medium text-[var(--fg)]">{t("keywords.steps")}</p>
            <ol className="mt-2 space-y-2">
              {plan.steps.map((s) => (
                <li key={`${s.order}-${s.title}`}>
                  <p className="font-medium text-[var(--fg)]">
                    {s.order}. {s.title}
                  </p>
                  <p className="text-[var(--muted)]">{s.content}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

export function KeywordsClient({ initialUrl }: { initialUrl: string | null }) {
  const router = useRouter();
  const t = useT();
  const { locale, ready } = useI18n();
  const [siteUrl, setSiteUrl] = useState<string | null>(initialUrl);
  const [data, setData] = useState<KeywordsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

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
    router.replace(`/keywords?url=${encodeURIComponent(parsed.url)}`);
  }, [initialUrl, router]);

  const load = useCallback(
    async (url: string, opts?: { force?: boolean }) => {
      const force = opts?.force ?? false;
      if (!force) {
        const cached = getCachedKeywords(url, locale);
        if (cached) {
          setData(cached);
          setFromCache(true);
          setSelected(cached.items[0]?.query ?? null);
          setError(null);
          setLoading(false);
          return;
        }
      }

      setLoading(true);
      setError(null);
      if (!force) {
        setData(null);
        setFromCache(false);
      }

      try {
        const res = await fetch(
          `/api/keywords?url=${encodeURIComponent(url)}`,
        );
        const json = (await res.json()) as KeywordsResponse & { error?: string };
        if (!res.ok) {
          setError(json.error ?? t("keywords.analyzeFailed"));
          return;
        }
        setCachedKeywords(url, json, locale);
        setData(json);
        setFromCache(false);
        setSelected(json.items[0]?.query ?? null);
      } catch {
        setError(t("common.networkError"));
      } finally {
        setLoading(false);
      }
    },
    [t, locale],
  );

  useEffect(() => {
    if (!ready || !siteUrl) return;
    void load(siteUrl, { force: true });
  }, [ready, siteUrl, load]);

  const selectedItem =
    data?.items.find((item) => item.query === selected) ?? data?.items[0] ?? null;

  return (
    <PageShell
      title={t("keywords.title")}
      description={t("keywords.description")}
    >
      {!siteUrl ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-16 text-center">
          <p className="text-sm text-[var(--muted)]">{t("common.noSiteYet")}</p>
          <Link
            href="/audit"
            className="mt-4 inline-flex text-sm font-medium text-[var(--brand-blue)] hover:underline"
          >
            {t("common.goEnterSite")}
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
            <div>
              <p className="text-sm text-[var(--muted)]">{t("common.currentSite")}</p>
              <p className="mt-1 break-all font-medium text-[var(--fg)]">{siteUrl}</p>
              {data ? (
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {t("common.source", { source: sourceLabel(data.source, t) })}
                  {fromCache ? ` · ${t("common.cache")}` : ""}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => void load(siteUrl, { force: true })}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--fg)] hover:bg-[var(--surface-2)] disabled:opacity-60"
              >
                {loading
                  ? t("keywords.analyzing")
                  : t("keywords.refreshKeywords")}
              </button>
              <Link
                href={`/audit?url=${encodeURIComponent(siteUrl)}`}
                className="rounded-lg bg-[var(--brand-blue)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--brand-blue-deep)]"
              >
                {t("keywords.viewAudit")}
              </Link>
            </div>
          </div>

          {data?.warning ? (
            <div className="rounded-xl border border-[#f3e0b5] bg-[#fff8e8] px-4 py-3 text-sm text-[#8a5a00]">
              {data.warning}
            </div>
          ) : null}

          {error ? (
            <div
              role="alert"
              className="space-y-3 rounded-xl border border-[#f5c2c0] bg-[#fef2f1] px-4 py-3 text-sm text-[#d93025]"
            >
              <p>{error}</p>
              <button
                type="button"
                disabled={loading}
                onClick={() => void load(siteUrl, { force: true })}
                className="rounded-md bg-[var(--brand-blue)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {t("common.retry")}
              </button>
            </div>
          ) : null}

          {loading && !data ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-16 text-center text-sm text-[var(--muted)]">
              {t("keywords.loading")}
            </div>
          ) : null}

          {data && data.items.length > 0 ? (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
              <KeywordsTable
                items={data.items}
                selected={selectedItem?.query ?? null}
                onSelect={setSelected}
              />
              {selectedItem && siteUrl ? (
                <DetailPanel item={selectedItem} siteUrl={siteUrl} />
              ) : null}
            </div>
          ) : null}

          {data && data.items.length === 0 && !loading ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-16 text-center text-sm text-[var(--muted)]">
              {t("keywords.empty")}
            </div>
          ) : null}
        </div>
      )}
    </PageShell>
  );
}
