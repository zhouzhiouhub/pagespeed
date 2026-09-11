"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import {
  clearContentCache,
  getCachedContent,
  setCachedContent,
  type ContentBrief,
  type ContentGap,
  type ContentGapsResponse,
} from "@/lib/content-cache";
import { parseSiteUrl } from "@/lib/url";
import { readSiteUrl, writeSiteUrl } from "@/lib/site";

function stars(n: number) {
  const clamped = Math.max(1, Math.min(5, Math.round(n)));
  return "★".repeat(clamped) + "☆".repeat(5 - clamped);
}

function sourceLabel(source: ContentGapsResponse["source"]) {
  if (source === "gsc") return "Google Search Console";
  if (source === "ai") return "AI 推断（待 GSC 校验）";
  return "页面启发式（待 GSC）";
}

function GapsTable({
  items,
  selected,
  onSelect,
}: {
  items: ContentGap[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-[var(--border)] bg-[var(--surface-2)]/60 text-[var(--muted)]">
          <tr>
            <th className="px-4 py-3 font-medium">缺口标题</th>
            <th className="px-4 py-3 font-medium">目标词</th>
            <th className="px-4 py-3 font-medium">建议路径</th>
            <th className="px-4 py-3 font-medium">价值</th>
            <th className="px-4 py-3 font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const active = selected === item.id;
            return (
              <tr
                key={item.id}
                className={
                  active
                    ? "border-t border-[var(--border)] bg-[var(--accent-soft)]/50"
                    : "border-t border-[var(--border)] hover:bg-[var(--surface-2)]/40"
                }
              >
                <td className="px-4 py-3 font-medium text-[var(--fg)]">
                  {item.title}
                </td>
                <td className="px-4 py-3 text-[var(--fg)]">{item.targetKeyword}</td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--muted)]">
                  {item.suggestedPath}
                </td>
                <td
                  className="px-4 py-3 text-[#f4b400]"
                  title={`${item.potential}/5`}
                >
                  {stars(item.potential)}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onSelect(item.id)}
                    className="text-sm font-medium text-[var(--brand-blue)] hover:underline"
                  >
                    查看
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
  item: ContentGap;
  siteUrl: string;
}) {
  const [brief, setBrief] = useState<ContentBrief | null>(null);
  const [busy, setBusy] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);

  useEffect(() => {
    setBrief(null);
    setBriefError(null);
  }, [item.id]);

  async function generateBrief() {
    setBusy(true);
    setBriefError(null);
    try {
      const res = await fetch("/api/content/brief", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: siteUrl, gap: item }),
      });
      const json = (await res.json()) as ContentBrief & { error?: string };
      if (!res.ok) {
        setBriefError(json.error ?? "生成 Brief 失败");
        return;
      }
      setBrief(json);
    } catch {
      setBriefError("网络错误，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        内容缺口
      </p>
      <h2 className="mt-2 text-lg font-semibold text-[var(--fg)]">{item.title}</h2>
      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="text-[var(--muted)]">目标关键词</dt>
          <dd className="mt-0.5 font-medium text-[var(--fg)]">
            {item.targetKeyword}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">建议路径</dt>
          <dd className="mt-0.5 font-mono text-xs text-[var(--fg)]">
            {item.suggestedPath}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">意图</dt>
          <dd className="mt-0.5 text-[var(--fg)]">{item.intent ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">为什么值得写</dt>
          <dd className="mt-0.5 leading-relaxed text-[var(--fg)]">
            {item.rationale}
          </dd>
        </div>
        {item.geoHint ? (
          <div>
            <dt className="text-[var(--muted)]">GEO 提示</dt>
            <dd className="mt-0.5 text-[var(--fg)]">{item.geoHint}</dd>
          </div>
        ) : null}
      </dl>

      <button
        type="button"
        disabled={busy}
        onClick={() => void generateBrief()}
        className="mt-5 w-full rounded-lg bg-[var(--brand-blue)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-blue-deep)] disabled:opacity-60"
      >
        {busy ? "正在生成 Brief…" : brief ? "重新生成内容 Brief" : "生成内容 Brief"}
      </button>

      {briefError ? (
        <p className="mt-3 text-sm text-[#d93025]">{briefError}</p>
      ) : null}

      {brief ? (
        <div className="mt-5 space-y-4 border-t border-[var(--border)] pt-4 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Content Brief
              {brief.source === "ai" ? " · AI" : " · 规则模板"}
            </p>
            <p className="mt-2 leading-relaxed text-[var(--fg)]">{brief.summary}</p>
            {brief.warning ? (
              <p className="mt-2 text-xs text-[#8a5a00]">{brief.warning}</p>
            ) : null}
          </div>

          <div>
            <p className="font-medium text-[var(--fg)]">搜索意图</p>
            <p className="mt-1 text-[var(--muted)]">{brief.intent}</p>
          </div>

          <div>
            <p className="font-medium text-[var(--fg)]">首段直接答案</p>
            <p className="mt-1 text-[var(--muted)]">{brief.definitionBlock}</p>
          </div>

          <div>
            <p className="font-medium text-[var(--fg)]">大纲 H2</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-[var(--muted)]">
              {brief.outline.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ol>
          </div>

          <div>
            <p className="font-medium text-[var(--fg)]">FAQ</p>
            <ul className="mt-2 space-y-2">
              {brief.faq.map((f) => (
                <li key={f.question}>
                  <p className="font-medium text-[var(--fg)]">Q: {f.question}</p>
                  <p className="text-[var(--muted)]">A: {f.answer}</p>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="font-medium text-[var(--fg)]">内链目标</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[var(--muted)]">
              {brief.internalLinks.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>

          <div>
            <p className="font-medium text-[var(--fg)]">结构化数据</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[var(--muted)]">
              {brief.schemaHints.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>

          <div>
            <p className="font-medium text-[var(--fg)]">GEO 清单</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[var(--muted)]">
              {brief.geoChecklist.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

export function ContentClient({ initialUrl }: { initialUrl: string | null }) {
  const router = useRouter();
  const [siteUrl, setSiteUrl] = useState<string | null>(initialUrl);
  const [data, setData] = useState<ContentGapsResponse | null>(null);
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
    router.replace(`/content?url=${encodeURIComponent(parsed.url)}`);
  }, [initialUrl, router]);

  const load = useCallback(async (url: string, opts?: { force?: boolean }) => {
    const force = opts?.force ?? false;
    if (!force) {
      const cached = getCachedContent(url);
      if (cached) {
        setData(cached);
        setFromCache(true);
        setSelected(cached.items[0]?.id ?? null);
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
      const res = await fetch(`/api/content?url=${encodeURIComponent(url)}`);
      const json = (await res.json()) as ContentGapsResponse & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "内容缺口分析失败");
        return;
      }
      setCachedContent(url, json);
      setData(json);
      setFromCache(false);
      setSelected(json.items[0]?.id ?? null);
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

  const selectedItem =
    data?.items.find((item) => item.id === selected) ?? data?.items[0] ?? null;

  return (
    <PageShell
      title="内容机会"
      description="该写什么、先写哪篇。V1 输出内容缺口与 Brief（首段答案 / 大纲 / FAQ），不自动发布全文。"
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
                onClick={() => {
                  clearContentCache();
                  void load(siteUrl, { force: true });
                }}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--fg)] hover:bg-[var(--surface-2)] disabled:opacity-60"
              >
                {loading ? "分析中…" : "刷新内容缺口"}
              </button>
              <Link
                href={`/keywords?url=${encodeURIComponent(siteUrl)}`}
                className="rounded-lg bg-[var(--brand-blue)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--brand-blue-deep)]"
              >
                查看关键词机会
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
              正在抓取页面并识别内容缺口…
            </div>
          ) : null}

          {data && data.items.length > 0 ? (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
              <GapsTable
                items={data.items}
                selected={selectedItem?.id ?? null}
                onSelect={setSelected}
              />
              {selectedItem ? (
                <DetailPanel item={selectedItem} siteUrl={siteUrl} />
              ) : null}
            </div>
          ) : null}

          {data && data.items.length === 0 && !loading ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-16 text-center text-sm text-[var(--muted)]">
              未识别到内容缺口。可尝试刷新，或先在关键词页同步 GSC。
            </div>
          ) : null}
        </div>
      )}
    </PageShell>
  );
}
