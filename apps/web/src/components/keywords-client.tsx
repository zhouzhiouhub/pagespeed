"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import {
  getCachedKeywords,
  setCachedKeywords,
  type KeywordOpportunity,
  type KeywordsResponse,
} from "@/lib/keywords-cache";
import { parseSiteUrl } from "@/lib/url";
import { readSiteUrl, writeSiteUrl } from "@/lib/site";

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

function sourceLabel(source: KeywordsResponse["source"]) {
  if (source === "gsc") return "Google Search Console";
  if (source === "ai") return "AI 推断（待 GSC 校验）";
  return "页面启发式（待 GSC）";
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
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-[var(--border)] bg-[var(--surface-2)]/60 text-[var(--muted)]">
          <tr>
            <th className="px-4 py-3 font-medium">关键词</th>
            <th className="px-4 py-3 font-medium">当前排名</th>
            <th className="px-4 py-3 font-medium">趋势</th>
            <th className="px-4 py-3 font-medium">落地页</th>
            <th className="px-4 py-3 font-medium">潜力</th>
            <th className="px-4 py-3 font-medium">操作</th>
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
                    查看方案
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

function DetailPanel({ item }: { item: KeywordOpportunity }) {
  const estimated =
    item.position != null
      ? `#${item.position} → #${Math.max(3, item.position - 8)}~${Math.max(5, item.position - 4)}`
      : "待 GSC 数据校准";

  return (
    <aside className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        机会详情
      </p>
      <h2 className="mt-2 text-lg font-semibold text-[var(--fg)]">{item.query}</h2>
      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="text-[var(--muted)]">预计提升</dt>
          <dd className="mt-0.5 font-medium text-[var(--fg)]">{estimated}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">意图</dt>
          <dd className="mt-0.5 text-[var(--fg)]">{item.intent ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">落地页</dt>
          <dd className="mt-0.5 break-all text-[var(--fg)]">{item.page}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">为什么值得做</dt>
          <dd className="mt-0.5 leading-relaxed text-[var(--fg)]">
            {item.rationale}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">建议动作</dt>
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
        className="mt-5 w-full rounded-lg bg-[var(--brand-blue)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-blue-deep)]"
      >
        生成优化方案（即将接入 Agent）
      </button>
    </aside>
  );
}

export function KeywordsClient({ initialUrl }: { initialUrl: string | null }) {
  const router = useRouter();
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
        const cached = getCachedKeywords(url);
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
          setError(json.error ?? "关键词分析失败");
          return;
        }
        setCachedKeywords(url, json);
        setData(json);
        setFromCache(false);
        setSelected(json.items[0]?.query ?? null);
      } catch {
        setError("网络错误，请稍后重试");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!siteUrl) return;
    void load(siteUrl);
  }, [siteUrl, load]);

  const selectedItem =
    data?.items.find((item) => item.query === selected) ?? data?.items[0] ?? null;

  return (
    <PageShell
      title="关键词机会"
      description="值得抢的词，而不是词库浏览器。V1 可先用页面/AI 推断；接入 GSC 后替换为真实排名与 CTR。"
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
                  来源：{sourceLabel(data.source)}
                  {fromCache ? " · 缓存" : ""}
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
                {loading ? "分析中…" : "刷新关键词"}
              </button>
              <Link
                href={`/audit?url=${encodeURIComponent(siteUrl)}`}
                className="rounded-lg bg-[var(--brand-blue)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--brand-blue-deep)]"
              >
                查看网站分析
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
                重试
              </button>
            </div>
          ) : null}

          {loading && !data ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-16 text-center text-sm text-[var(--muted)]">
              正在抓取页面并生成关键词机会…
            </div>
          ) : null}

          {data && data.items.length > 0 ? (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
              <KeywordsTable
                items={data.items}
                selected={selectedItem?.query ?? null}
                onSelect={setSelected}
              />
              {selectedItem ? <DetailPanel item={selectedItem} /> : null}
            </div>
          ) : null}

          {data && data.items.length === 0 && !loading ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-16 text-center text-sm text-[var(--muted)]">
              未识别到关键词机会，可尝试刷新或检查站点是否可访问。
            </div>
          ) : null}
        </div>
      )}
    </PageShell>
  );
}
