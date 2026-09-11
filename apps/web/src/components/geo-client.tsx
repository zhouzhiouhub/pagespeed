"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import {
  clearGeoCache,
  getCachedGeo,
  setCachedGeo,
  type GeoBreakdown,
  type GeoOpportunity,
  type GeoPlan,
  type GeoResponse,
} from "@/lib/geo-cache";
import { parseSiteUrl } from "@/lib/url";
import { readSiteUrl, writeSiteUrl } from "@/lib/site";

function stars(n: number) {
  const clamped = Math.max(1, Math.min(5, Math.round(n)));
  return "★".repeat(clamped) + "☆".repeat(5 - clamped);
}

function scoreColor(score: number) {
  if (score >= 75) return "text-[#0f9d58]";
  if (score >= 50) return "text-[#f4b400]";
  return "text-[#d93025]";
}

function missingLabel(code: string) {
  const map: Record<string, string> = {
    definition_block: "定义段",
    faq: "FAQ",
    faq_schema: "FAQ Schema",
    organization_schema: "Organization",
    product_schema: "Product Schema",
    author: "作者",
    dateModified: "更新日期",
    llms_txt: "llms.txt",
    ai_bot_access: "AI bot 访问",
    comparison_table: "对比表",
    key_points: "要点列表",
  };
  return map[code] ?? code;
}

function BreakdownBars({ breakdown }: { breakdown: GeoBreakdown }) {
  const rows: Array<{ key: keyof GeoBreakdown; label: string }> = [
    { key: "answerability", label: "Answerability" },
    { key: "structure", label: "Structure" },
    { key: "trust", label: "Trust" },
    { key: "ai_access", label: "AI Access" },
    { key: "entity", label: "Entity" },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
      {rows.map((row) => {
        const value = breakdown[row.key];
        return (
          <div key={row.key}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-[var(--muted)]">{row.label}</span>
              <span className="font-medium text-[var(--fg)]">{value}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
              <div
                className="h-full rounded-full bg-[var(--brand-blue)]"
                style={{ width: `${value}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SignalChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={
        ok
          ? "inline-flex items-center rounded-md bg-[#e6f4ea] px-2.5 py-1 text-xs font-medium text-[#137333]"
          : "inline-flex items-center rounded-md bg-[#fce8e6] px-2.5 py-1 text-xs font-medium text-[#c5221f]"
      }
    >
      {ok ? "✓" : "×"} {label}
    </span>
  );
}

function OpportunityList({
  items,
  selected,
  onSelect,
}: {
  items: GeoOpportunity[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      {items.map((item) => {
        const active = selected === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={
              active
                ? "w-full rounded-xl border border-[var(--brand-blue)] bg-[var(--accent-soft)]/60 px-4 py-4 text-left"
                : "w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4 text-left hover:bg-[var(--surface-2)]/50"
            }
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--fg)]">{item.title}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {item.type} · 页面{" "}
                  <span className="font-mono text-[var(--fg)]">{item.page}</span>
                </p>
              </div>
              <span
                className="shrink-0 text-sm text-[#f4b400]"
                title={`${item.potential}/5`}
              >
                {stars(item.potential)}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {item.missing.map((m) => (
                <span
                  key={m}
                  className="rounded-md bg-[var(--surface-2)] px-2 py-0.5 text-xs text-[var(--muted)]"
                >
                  {missingLabel(m)}
                </span>
              ))}
            </div>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              {item.rationale}
            </p>
          </button>
        );
      })}
    </div>
  );
}

function DetailPanel({
  item,
  siteUrl,
}: {
  item: GeoOpportunity;
  siteUrl: string;
}) {
  const [plan, setPlan] = useState<GeoPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  useEffect(() => {
    setPlan(null);
    setPlanError(null);
  }, [item.id]);

  async function generatePlan() {
    setBusy(true);
    setPlanError(null);
    try {
      const res = await fetch("/api/geo/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: siteUrl, opportunity: item }),
      });
      const json = (await res.json()) as GeoPlan & { error?: string };
      if (!res.ok) {
        setPlanError(json.error ?? "生成方案失败");
        return;
      }
      setPlan(json);
    } catch {
      setPlanError("网络错误，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        选中机会 · {item.type}
      </p>
      <h2 className="mt-2 text-lg font-semibold text-[var(--fg)]">{item.title}</h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="text-sm">
          <p className="text-[var(--muted)]">页面</p>
          <p className="mt-0.5 font-mono text-[var(--fg)]">{item.page}</p>
        </div>
        <div className="text-sm">
          <p className="text-[var(--muted)]">价值</p>
          <p className="mt-0.5 text-[#f4b400]">{stars(item.potential)}</p>
        </div>
      </div>

      <div className="mt-4 text-sm">
        <p className="text-[var(--muted)]">缺失项</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.missing.map((m) => (
            <span
              key={m}
              className="rounded-md bg-[var(--surface-2)] px-2 py-1 text-xs text-[var(--fg)]"
            >
              {missingLabel(m)}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 text-sm">
        <p className="text-[var(--muted)]">为什么重要</p>
        <p className="mt-1 leading-relaxed text-[var(--fg)]">{item.rationale}</p>
      </div>

      <div className="mt-4 text-sm">
        <p className="text-[var(--muted)]">建议动作</p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[var(--fg)]">
          {item.actions.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ol>
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => void generatePlan()}
        className="mt-5 w-full rounded-lg bg-[var(--brand-blue)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-blue-deep)] disabled:opacity-60 sm:w-auto"
      >
        {busy ? "正在生成方案…" : plan ? "重新生成 GEO 方案" : "生成 GEO 方案"}
      </button>

      {planError ? (
        <p className="mt-3 text-sm text-[#d93025]">{planError}</p>
      ) : null}

      {plan ? (
        <div className="mt-5 space-y-5 border-t border-[var(--border)] pt-5 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              GEO 方案
              {plan.source === "ai" ? " · AI" : " · 规则模板"}
            </p>
            <p className="mt-2 leading-relaxed text-[var(--fg)]">{plan.summary}</p>
            {plan.warning ? (
              <p className="mt-2 text-xs text-[#8a5a00]">{plan.warning}</p>
            ) : null}
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <p className="font-medium text-[var(--fg)]">定义段草稿</p>
              <p className="mt-1 leading-relaxed text-[var(--muted)]">
                {plan.definitionBlock}
              </p>
            </div>
            <div>
              <p className="font-medium text-[var(--fg)]">FAQ 草稿</p>
              <ul className="mt-2 space-y-2">
                {plan.faq.map((f) => (
                  <li key={f.question}>
                    <p className="font-medium text-[var(--fg)]">Q: {f.question}</p>
                    <p className="text-[var(--muted)]">A: {f.answer}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <p className="font-medium text-[var(--fg)]">Schema 片段</p>
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--surface-2)] p-3 text-xs text-[var(--muted)]">
                {plan.schemaSnippet}
              </pre>
            </div>
            {plan.llmsTxtSnippet ? (
              <div>
                <p className="font-medium text-[var(--fg)]">llms.txt 草稿</p>
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--surface-2)] p-3 text-xs text-[var(--muted)]">
                  {plan.llmsTxtSnippet}
                </pre>
              </div>
            ) : (
              <div>
                <p className="font-medium text-[var(--fg)]">验收清单</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--muted)]">
                  {plan.checklist.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {plan.llmsTxtSnippet ? (
            <div>
              <p className="font-medium text-[var(--fg)]">验收清单</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--muted)]">
                {plan.checklist.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <p className="font-medium text-[var(--fg)]">执行步骤</p>
            <ol className="mt-2 grid gap-3 sm:grid-cols-2">
              {plan.steps.map((s) => (
                <li
                  key={`${s.order}-${s.title}`}
                  className="rounded-lg border border-[var(--border)] px-3 py-3"
                >
                  <p className="font-medium text-[var(--fg)]">
                    {s.order}. {s.title}
                  </p>
                  <p className="mt-1 text-[var(--muted)]">{s.content}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

export function GeoClient({ initialUrl }: { initialUrl: string | null }) {
  const router = useRouter();
  const [siteUrl, setSiteUrl] = useState<string | null>(initialUrl);
  const [data, setData] = useState<GeoResponse | null>(null);
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
    router.replace(`/geo?url=${encodeURIComponent(parsed.url)}`);
  }, [initialUrl, router]);

  const load = useCallback(async (url: string, opts?: { force?: boolean }) => {
    const force = opts?.force ?? false;
    if (!force) {
      const cached = getCachedGeo(url);
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
      const res = await fetch(`/api/geo?url=${encodeURIComponent(url)}`);
      const json = (await res.json()) as GeoResponse & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "GEO 分析失败");
        return;
      }
      setCachedGeo(url, json);
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
      title="GEO"
      description="生成式引擎可见性：答案块、FAQ/Schema、实体、AI bot / llms.txt 等 Readiness 信号。"
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
                  Readiness 规则评分
                  {fromCache ? " · 缓存" : ""}
                  {data.fetchedUrl && data.fetchedUrl !== data.url
                    ? ` · 抓取 ${data.fetchedUrl}`
                    : ""}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  clearGeoCache();
                  void load(siteUrl, { force: true });
                }}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--fg)] hover:bg-[var(--surface-2)] disabled:opacity-60"
              >
                {loading ? "分析中…" : "刷新 GEO"}
              </button>
              <Link
                href={`/content?url=${encodeURIComponent(siteUrl)}`}
                className="rounded-lg bg-[var(--brand-blue)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--brand-blue-deep)]"
              >
                查看内容机会
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
              正在抓取页面并评估 GEO Readiness…
            </div>
          ) : null}

          {data ? (
            <div className="space-y-5">
              {/* Overview: score + breakdown + access — all visible */}
              <div className="grid gap-5 lg:grid-cols-[12rem_minmax(0,1.2fr)_minmax(0,1fr)]">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                    GEO 总分
                  </p>
                  <p
                    className={`mt-2 text-5xl font-semibold ${scoreColor(data.score)}`}
                  >
                    {data.score}
                  </p>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Readiness（非引用实测）
                  </p>
                </div>

                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                    分项得分
                  </p>
                  <div className="mt-4">
                    <BreakdownBars breakdown={data.breakdown} />
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                    站点级 AI 访问
                  </p>
                  <dl className="mt-3 space-y-3">
                    <div>
                      <dt className="text-[var(--muted)]">robots AI bot</dt>
                      <dd className="mt-0.5 font-medium text-[var(--fg)]">
                        {data.access.aiBotPolicy}
                      </dd>
                      <dd className="mt-1 break-words text-[var(--muted)]">
                        {data.access.aiBotSummary}
                      </dd>
                      <dd className="mt-1 break-all font-mono text-xs text-[var(--muted)]">
                        {data.access.robotsUrl}
                        {data.access.robotsOk ? "" : "（读取失败）"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[var(--muted)]">llms.txt</dt>
                      <dd className="mt-0.5 font-medium text-[var(--fg)]">
                        {data.access.llmsTxtPresent ? "已发现" : "未发现"}
                      </dd>
                      <dd className="mt-1 break-all font-mono text-xs text-[var(--muted)]">
                        {data.access.llmsTxtUrl}
                      </dd>
                      {data.access.llmsTxtPreview ? (
                        <dd className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-[var(--surface-2)] p-2 text-xs text-[var(--muted)]">
                          {data.access.llmsTxtPreview}
                        </dd>
                      ) : null}
                    </div>
                  </dl>
                </div>
              </div>

              {/* Page signals — previously hidden */}
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  当前页信号
                </p>
                {(data.page.title || data.page.h1.length > 0) && (
                  <div className="mt-3 space-y-1 text-sm">
                    {data.page.title ? (
                      <p className="text-[var(--fg)]">
                        <span className="text-[var(--muted)]">Title：</span>
                        {data.page.title}
                      </p>
                    ) : null}
                    {data.page.h1.length > 0 ? (
                      <p className="text-[var(--fg)]">
                        <span className="text-[var(--muted)]">H1：</span>
                        {data.page.h1.join(" / ")}
                      </p>
                    ) : null}
                    {data.page.description ? (
                      <p className="text-[var(--muted)]">
                        <span className="text-[var(--muted)]">Description：</span>
                        {data.page.description}
                      </p>
                    ) : null}
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <SignalChip
                    ok={data.page.flags.hasDefinitionCue}
                    label="定义线索"
                  />
                  <SignalChip ok={data.page.flags.hasFaqHeading} label="FAQ 标题" />
                  <SignalChip ok={data.page.flags.hasFaqSchema} label="FAQ Schema" />
                  <SignalChip ok={data.page.flags.hasOrgSchema} label="Organization" />
                  <SignalChip
                    ok={data.page.flags.hasProductSchema}
                    label="Product/App"
                  />
                  <SignalChip ok={data.page.flags.hasAuthor} label="作者" />
                  <SignalChip
                    ok={data.page.flags.hasDateModified}
                    label="更新日期"
                  />
                  <SignalChip ok={data.page.flags.hasTable} label="表格" />
                </div>
              </div>

              {/* Opportunities + detail: stack so nothing is clipped */}
              <div>
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-[var(--fg)]">
                      GEO 机会
                    </h3>
                    <p className="mt-0.5 text-sm text-[var(--muted)]">
                      共 {data.items.length} 项 · 点击查看详情并生成方案
                    </p>
                  </div>
                </div>

                {data.items.length > 0 ? (
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.95fr)]">
                    <OpportunityList
                      items={data.items}
                      selected={selectedItem?.id ?? null}
                      onSelect={setSelected}
                    />
                    {selectedItem ? (
                      <DetailPanel item={selectedItem} siteUrl={siteUrl} />
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-16 text-center text-sm text-[var(--muted)]">
                    未发现明显 GEO 缺口（或信号已较完整）。
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </PageShell>
  );
}
