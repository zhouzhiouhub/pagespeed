"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import {
  clearAdviceCache,
  getCachedAdvice,
  setCachedAdvice,
  type AdviceItem,
  type AdviceResponse,
  type AdviceUserState,
} from "@/lib/advice-cache";
import { parseSiteUrl } from "@/lib/url";
import { readSiteUrl, writeSiteUrl } from "@/lib/site";

function priorityMeta(priority: AdviceItem["priority"]) {
  if (priority === "high") {
    return {
      label: "高优先级",
      className: "border-[#f5c2c0] bg-[#fef2f1] text-[#d93025]",
      dot: "🔴",
    };
  }
  if (priority === "medium") {
    return {
      label: "中优先级",
      className: "border-[#f3e0b5] bg-[#fff8e8] text-[#8a5a00]",
      dot: "🟠",
    };
  }
  return {
    label: "增长机会",
    className: "border-[#c6e7c6] bg-[#e6f4ea] text-[#137333]",
    dot: "🟢",
  };
}

type AdvicePlan = {
  summary: string;
  estimatedLift: string;
  steps: Array<{ order: number; kind: string; title: string; content: string }>;
  faq: Array<{ question: string; answer: string }>;
  warning: string | null;
  source: string;
};

function AdviceCard({
  item,
  busy,
  planBusy,
  plan,
  onState,
  onPlan,
}: {
  item: AdviceItem;
  busy: boolean;
  planBusy: boolean;
  plan: AdvicePlan | null;
  onState: (state: AdviceUserState) => void;
  onPlan: () => void;
}) {
  const meta = priorityMeta(item.priority);
  const evidenceEntries = Object.entries(item.evidence).slice(0, 6);

  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span
            className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${meta.className}`}
          >
            {meta.dot} {meta.label} · {item.type}
          </span>
          <h3 className="mt-2 text-base font-semibold text-[var(--fg)]">
            {item.title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
            {item.summary}
          </p>
        </div>
        <span className="shrink-0 text-xs text-[var(--muted)]">
          score {(item.score * 100).toFixed(0)}
        </span>
      </div>

      {evidenceEntries.length > 0 ? (
        <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
          {evidenceEntries.map(([k, v]) => (
            <div key={k} className="rounded-lg bg-[var(--surface-2)] px-3 py-2">
              <dt className="text-[var(--muted)]">{k}</dt>
              <dd className="mt-0.5 break-words font-mono text-[var(--fg)]">
                {typeof v === "string" || typeof v === "number"
                  ? String(v)
                  : JSON.stringify(v)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {item.suggestedActions.length > 0 ? (
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-[var(--fg)]">
          {item.suggestedActions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ol>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={planBusy}
          onClick={onPlan}
          className="rounded-lg bg-[var(--brand-blue)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--brand-blue-deep)] disabled:opacity-50"
        >
          {planBusy ? "生成方案中…" : plan ? "刷新方案" : "生成 Action Plan"}
        </button>
        {item.href ? (
          <Link
            href={item.href}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--fg)] hover:bg-[var(--surface-2)]"
          >
            {item.ctaLabel}
          </Link>
        ) : null}
        <button
          type="button"
          disabled={busy || item.userState === "acted"}
          onClick={() => onState("acted")}
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--fg)] hover:bg-[var(--surface-2)] disabled:opacity-50"
        >
          已处理
        </button>
        <button
          type="button"
          disabled={busy || item.userState === "snoozed"}
          onClick={() => onState("snoozed")}
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--fg)] hover:bg-[var(--surface-2)] disabled:opacity-50"
        >
          稍后
        </button>
        <button
          type="button"
          disabled={busy || item.userState === "dismissed"}
          onClick={() => onState("dismissed")}
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface-2)] disabled:opacity-50"
        >
          忽略
        </button>
      </div>

      {plan ? (
        <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 text-sm">
          <p className="font-medium text-[var(--fg)]">{plan.summary}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            预估：{plan.estimatedLift} · {plan.source}
          </p>
          {plan.warning ? (
            <p className="mt-2 text-xs text-[#8a5a00]">{plan.warning}</p>
          ) : null}
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-[var(--fg)]">
            {plan.steps.map((s) => (
              <li key={s.order}>
                <span className="font-medium">{s.title}</span> — {s.content}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {item.userState !== "open" ? (
        <p className="mt-3 text-xs text-[var(--muted)]">状态：{item.userState}</p>
      ) : null}
    </article>
  );
}

export function AdviceClient({ initialUrl }: { initialUrl: string | null }) {
  const router = useRouter();
  const [siteUrl, setSiteUrl] = useState<string | null>(initialUrl);
  const [data, setData] = useState<AdviceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [patchBusy, setPatchBusy] = useState(false);
  const [planBusyId, setPlanBusyId] = useState<string | null>(null);
  const [plans, setPlans] = useState<Record<string, AdvicePlan>>({});
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

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
    router.replace(`/advice?url=${encodeURIComponent(parsed.url)}`);
  }, [initialUrl, router]);

  const load = useCallback(async (url: string, opts?: { force?: boolean }) => {
    const force = opts?.force ?? false;
    if (!force) {
      const cached = getCachedAdvice(url);
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
    if (!force) {
      setData(null);
      setFromCache(false);
    }

    try {
      const qs = force ? "&force=1" : "";
      const res = await fetch(
        `/api/advice?url=${encodeURIComponent(url)}${qs}`,
      );
      const json = (await res.json()) as AdviceResponse & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "生成增长建议失败");
        return;
      }
      setCachedAdvice(url, json);
      setData(json);
      setFromCache(false);
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!siteUrl) return;
    void load(siteUrl);
  }, [siteUrl, load]);

  async function patchState(itemId: string, userState: AdviceUserState) {
    if (!siteUrl) return;
    setPatchBusy(true);
    try {
      const res = await fetch("/api/advice/items", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: siteUrl, itemId, userState }),
      });
      const json = (await res.json()) as AdviceResponse & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "更新状态失败");
        return;
      }
      setCachedAdvice(siteUrl, json);
      setData(json);
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setPatchBusy(false);
    }
  }

  async function loadPlan(itemId: string) {
    if (!siteUrl) return;
    setPlanBusyId(itemId);
    setError(null);
    try {
      const res = await fetch("/api/advice/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: siteUrl, itemId }),
      });
      const json = (await res.json()) as {
        plan?: AdvicePlan;
        error?: string;
      };
      if (!res.ok || !json.plan) {
        setError(json.error ?? "生成方案失败");
        return;
      }
      setPlans((prev) => ({ ...prev, [itemId]: json.plan! }));
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setPlanBusyId(null);
    }
  }

  const visibleItems = useMemo(() => {
    if (!data) return [];
    return data.items.filter((i) =>
      showClosed ? true : i.userState === "open",
    );
  }, [data, showClosed]);

  const groups = useMemo(() => {
    const high = visibleItems.filter((i) => i.priority === "high");
    const medium = visibleItems.filter((i) => i.priority === "medium");
    const growth = visibleItems.filter((i) => i.priority === "growth");
    return [
      { key: "high" as const, items: high },
      { key: "medium" as const, items: medium },
      { key: "growth" as const, items: growth },
    ].filter((g) => g.items.length > 0);
  }, [visibleItems]);

  return (
    <PageShell
      title="今日增长建议"
      description="编排关键词、内容、GEO、（可选）PageSpeed，汇总成今日优先事项。可标记已处理 / 稍后 / 忽略。"
    >
      {!siteUrl ? (
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
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
            <div>
              <p className="text-sm text-[var(--muted)]">当前站点</p>
              <p className="mt-1 break-all font-medium text-[var(--fg)]">{siteUrl}</p>
              {data ? (
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {data.greeting}
                  {fromCache ? " · 缓存" : ""}
                  {data.model ? ` · ${data.model}` : ""}
                  {" · "}
                  {new Date(data.generatedAt).toLocaleString()}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  clearAdviceCache();
                  void load(siteUrl, { force: true });
                }}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--fg)] hover:bg-[var(--surface-2)] disabled:opacity-60"
              >
                {loading ? "编排中…" : "重新生成"}
              </button>
              <button
                type="button"
                onClick={() => setShowClosed((v) => !v)}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--fg)] hover:bg-[var(--surface-2)]"
              >
                {showClosed ? "隐藏已处理" : "显示全部状态"}
              </button>
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
                重试
              </button>
            </div>
          ) : null}

          {loading && !data ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-16 text-center text-sm text-[var(--muted)]">
              正在汇总关键词 / 内容 / GEO / 审计信号…
            </div>
          ) : null}

          {data ? (
            <div className="space-y-5">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
                <p className="text-lg font-semibold text-[var(--fg)]">
                  {data.headline}
                </p>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  来源：{data.sources.join(" · ") || "—"}
                </p>
              </div>

              {groups.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-16 text-center text-sm text-[var(--muted)]">
                  当前没有 open 状态的建议。可点「显示全部状态」或重新生成。
                </div>
              ) : (
                groups.map((group) => (
                  <section key={group.key} className="space-y-3">
                    <h2 className="text-sm font-semibold text-[var(--fg)]">
                      {priorityMeta(group.key).dot}{" "}
                      {priorityMeta(group.key).label}
                      <span className="ml-2 font-normal text-[var(--muted)]">
                        {group.items.length}
                      </span>
                    </h2>
                    <div className="space-y-4">
                      {group.items.map((item) => (
                        <AdviceCard
                          key={item.id}
                          item={item}
                          busy={patchBusy}
                          planBusy={planBusyId === item.id}
                          plan={plans[item.id] ?? null}
                          onState={(state) => void patchState(item.id, state)}
                          onPlan={() => void loadPlan(item.id)}
                        />
                      ))}
                    </div>
                  </section>
                ))
              )}
            </div>
          ) : null}
        </div>
      )}
    </PageShell>
  );
}
