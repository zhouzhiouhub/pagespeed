"use client";

import { useCallback, useEffect, useState } from "react";

type PsiStrategy = "mobile" | "desktop";

type PsiSummary = {
  url: string;
  strategy: PsiStrategy;
  fetchTime: string | null;
  scores: Array<{ id: string; title: string; score: number | null }>;
  metrics: Array<{
    id: string;
    title: string;
    displayValue: string | null;
    score: number | null;
  }>;
  seoAudits: Array<{
    id: string;
    title: string;
    description: string | null;
    score: number | null;
    displayValue: string | null;
  }>;
};

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

export function PagespeedReport({ url }: { url: string }) {
  const [strategy, setStrategy] = useState<PsiStrategy>("mobile");
  const [data, setData] = useState<PsiSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (nextStrategy: PsiStrategy) => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(
        `/api/pagespeed?url=${encodeURIComponent(url)}&strategy=${nextStrategy}`,
      );
      const json = (await res.json()) as PsiSummary & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "分析失败");
        return;
      }
      setData(json);
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void load(strategy);
  }, [load, strategy]);

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
        {loading ? (
          <p className="text-sm text-[var(--muted)]">正在分析页面性能…</p>
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
            onClick={() => void load(strategy)}
            className="rounded-md bg-[var(--brand-blue)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          >
            重试分析
          </button>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-16 text-center text-sm text-[var(--muted)]">
          分析通常需要 15–40 秒，请稍候…
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
                  <span className={`text-lg font-semibold ${scoreTone(item.score)}`}>
                    {item.score ?? "—"}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--fg)]">{item.title}</p>
                  <p className="text-xs text-[var(--muted)]">Lighthouse</p>
                </div>
              </div>
            ))}
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
            <h2 className="text-sm font-medium text-[var(--fg)]">核心指标</h2>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              {data.metrics.map((m) => (
                <div
                  key={m.id}
                  className="flex items-baseline justify-between gap-3"
                >
                  <dt className="text-sm text-[var(--muted)]">{m.title}</dt>
                  <dd
                    className={`text-sm font-medium ${scoreTone(
                      m.score === null ? null : Math.round((m.score ?? 0) * 100),
                    )}`}
                  >
                    {m.displayValue ?? "—"}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
            <h2 className="text-sm font-medium text-[var(--fg)]">SEO / 可改进项</h2>
            {data.seoAudits.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--muted)]">
                未发现明显 SEO 失败项。
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {data.seoAudits.map((a) => (
                  <li
                    key={a.id}
                    className="border-t border-[var(--border)] pt-3 first:border-0 first:pt-0"
                  >
                    <p className="text-sm font-medium text-[var(--fg)]">{a.title}</p>
                    {a.displayValue ? (
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        {a.displayValue}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
