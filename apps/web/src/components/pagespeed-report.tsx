"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n, useT } from "@/components/i18n-provider";
import { psiLocale } from "@/lib/i18n/locale";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  getCachedPsi,
  setCachedPsi,
  type PsiStrategy,
  type PsiSummary,
  type PsiOpportunity,
} from "@/lib/pagespeed-cache";
import { writeSiteUrl } from "@/lib/site";

function scoreTone(score: number | null): string {
  if (score === null) return "text-[var(--muted)]";
  if (score >= 90) return "text-[#0f9d58]";
  if (score >= 50) return "text-[#f9ab00]";
  return "text-[#d93025]";
}

function scoreRing(score: number | null): string {
  if (score === null) return "border-[var(--border)]";
  if (score >= 90) return "border-[#0f9d58]";
  if (score >= 50) return "border-[#f9ab00]";
  return "border-[#d93025]";
}

function kindLabelKey(kind: PsiOpportunity["kind"]): MessageKey {
  if (kind === "opportunity") return "pagespeed.kindOpportunity";
  if (kind === "diagnostic") return "pagespeed.kindDiagnostic";
  return "pagespeed.kindFail";
}

export function PagespeedReport({ url }: { url: string }) {
  const t = useT();
  const { locale } = useI18n();
  const [strategy, setStrategy] = useState<PsiStrategy>("mobile");
  const [data, setData] = useState<PsiSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fromCache, setFromCache] = useState(false);

  useEffect(() => {
    writeSiteUrl(url);
  }, [url]);

  const formatSavings = useCallback(
    (ms: number | null): string | null => {
      if (ms === null || ms <= 0) return null;
      if (ms >= 1000) {
        return t("pagespeed.saveSeconds", {
          value: (ms / 1000).toFixed(1),
        });
      }
      return t("pagespeed.saveMs", { value: ms });
    },
    [t],
  );

  const load = useCallback(
    async (nextStrategy: PsiStrategy, opts?: { force?: boolean }) => {
      const force = opts?.force ?? false;
      if (!force) {
        const cached = getCachedPsi(url, nextStrategy);
        if (cached) {
          setData(cached);
          setFromCache(true);
          setError(null);
          setLoading(false);
          return;
        }
      }

      setLoading(true);
      setError(null);
      if (force) {
        // Keep previous result visible while refreshing
        setFromCache(false);
      } else {
        setData(null);
        setFromCache(false);
      }

      try {
        const res = await fetch(
          `/api/pagespeed?url=${encodeURIComponent(url)}&strategy=${nextStrategy}&locale=${psiLocale(locale)}`,
        );
        const json = (await res.json()) as PsiSummary & { error?: string };
        if (!res.ok) {
          setError(json.error ?? t("pagespeed.analyzeFailed"));
          return;
        }
        setCachedPsi(url, nextStrategy, json);
        setData(json);
        setFromCache(false);
      } catch {
        setError(t("common.networkError"));
      } finally {
        setLoading(false);
      }
    },
    [url, locale, t],
  );

  useEffect(() => {
    void load(strategy);
  }, [load, strategy]);

  const grouped = useMemo(() => {
    const list = data?.opportunities ?? data?.seoAudits ?? [];
    const map = new Map<string, { title: string; items: PsiOpportunity[] }>();
    for (const item of list) {
      const key = item.category || "other";
      const existing = map.get(key);
      if (existing) existing.items.push(item);
      else map.set(key, { title: item.categoryTitle || key, items: [item] });
    }
    const order = ["performance", "accessibility", "best-practices", "seo"];
    return [...map.entries()].sort(([a], [b]) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [data]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1">
          {(["mobile", "desktop"] as const).map((s) => (
            <button
              key={s}
              type="button"
              disabled={loading}
              onClick={() => setStrategy(s)}
              className={
                strategy === s
                  ? "rounded-md bg-[var(--brand-blue)] px-3 py-1.5 text-sm font-medium text-white"
                  : "rounded-md px-3 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--fg)]"
              }
            >
              {s === "mobile" ? "Mobile" : "Desktop"}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void load(strategy, { force: true })}
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--fg)] hover:bg-[var(--surface-2)] disabled:opacity-60"
        >
          {loading
            ? t("pagespeed.refreshing")
            : t("pagespeed.refreshAnalysis")}
        </button>
        {loading ? (
          <p className="text-sm text-[var(--muted)]">
            {t("pagespeed.analyzing")}
          </p>
        ) : fromCache && data ? (
          <p className="text-sm text-[var(--muted)]">
            {t("pagespeed.cachedHint")}
          </p>
        ) : null}
      </div>

      {error ? (
        <div
          role="alert"
          className="space-y-3 rounded-xl border border-[#f5c2c0] bg-[#fef2f1] px-4 py-3 text-sm text-[#d93025]"
        >
          <p>{error}</p>
          <button
            type="button"
            disabled={loading}
            onClick={() => void load(strategy, { force: true })}
            className="rounded-md bg-[var(--brand-blue)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {t("pagespeed.retryAnalysis")}
          </button>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-16 text-center text-sm text-[var(--muted)]">
          {t("pagespeed.waitHint")}
        </div>
      ) : null}

      {data ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.scores.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4"
              >
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-full border-4 ${scoreRing(item.score)}`}
                >
                  <span
                    className={`text-lg font-semibold ${scoreTone(item.score)}`}
                  >
                    {item.score ?? "—"}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--fg)]">
                    {item.title}
                  </p>
                  <p className="text-xs text-[var(--muted)]">Lighthouse</p>
                </div>
              </div>
            ))}
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
            <h2 className="text-sm font-medium text-[var(--fg)]">
              {t("pagespeed.coreMetrics")}
            </h2>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              {data.metrics.map((m) => (
                <div
                  key={m.id}
                  className="flex items-baseline justify-between gap-3"
                >
                  <dt className="text-sm text-[var(--muted)]">{m.title}</dt>
                  <dd
                    className={`text-sm font-medium ${scoreTone(
                      m.score === null
                        ? null
                        : Math.round((m.score ?? 0) * 100),
                    )}`}
                  >
                    {m.displayValue ?? "—"}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-medium text-[var(--fg)]">
                {t("pagespeed.needOptimize")}
              </h2>
              <p className="text-xs text-[var(--muted)]">
                {t("pagespeed.itemCount", {
                  count: (data.opportunities ?? data.seoAudits ?? []).length,
                })}
              </p>
            </div>

            {grouped.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--muted)]">
                {t("pagespeed.noImprovements")}
              </p>
            ) : (
              <div className="mt-4 space-y-6">
                {grouped.map(([category, group]) => (
                  <div key={category}>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                      {group.title}
                    </h3>
                    <ul className="mt-2 space-y-3">
                      {group.items.map((a) => (
                        <li
                          key={a.id}
                          className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/40 px-3 py-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--brand-blue)]">
                              {t(kindLabelKey(a.kind))}
                            </span>
                            {formatSavings(a.savingsMs) ? (
                              <span className="text-[11px] font-medium text-[#c26400]">
                                {formatSavings(a.savingsMs)}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1.5 text-sm font-medium text-[var(--fg)]">
                            {a.title}
                          </p>
                          {a.displayValue ? (
                            <p className="mt-0.5 text-xs text-[var(--muted)]">
                              {a.displayValue}
                            </p>
                          ) : null}
                          {a.description ? (
                            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--muted)]">
                              {a.description}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
