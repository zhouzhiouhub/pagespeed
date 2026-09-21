"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { useI18n, useT } from "@/components/i18n-provider";
import {
  clearContentCache,
  getCachedContent,
  setCachedContent,
  type ContentBrief,
  type ContentGap,
  type ContentGapsResponse,
} from "@/lib/content-cache";
import type { MessageKey } from "@/lib/i18n/messages";
import { parseSiteUrl } from "@/lib/url";
import { readSiteUrl, writeSiteUrl } from "@/lib/site";

type TFn = (key: MessageKey, params?: Record<string, string | number>) => string;

function stars(n: number) {
  const clamped = Math.max(1, Math.min(5, Math.round(n)));
  return "★".repeat(clamped) + "☆".repeat(5 - clamped);
}

function sourceLabel(source: ContentGapsResponse["source"], t: TFn) {
  if (source === "gsc") return "Google Search Console";
  if (source === "ai") return t("content.sourceAi");
  return t("content.sourceHeuristic");
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
  const t = useT();
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-[var(--border)] bg-[var(--surface-2)]/60 text-[var(--muted)]">
          <tr>
            <th className="px-4 py-3 font-medium">{t("content.colGap")}</th>
            <th className="px-4 py-3 font-medium">{t("content.colTarget")}</th>
            <th className="px-4 py-3 font-medium">{t("content.colPath")}</th>
            <th className="px-4 py-3 font-medium">{t("content.colValue")}</th>
            <th className="px-4 py-3 font-medium">{t("content.colAction")}</th>
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
                    {t("content.view")}
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
  const t = useT();
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
        setBriefError(json.error ?? t("content.briefFailed"));
        return;
      }
      setBrief(json);
    } catch {
      setBriefError(t("common.networkError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        {t("content.gapsTitle")}
      </p>
      <h2 className="mt-2 text-lg font-semibold text-[var(--fg)]">{item.title}</h2>
      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="text-[var(--muted)]">{t("content.targetKeyword")}</dt>
          <dd className="mt-0.5 font-medium text-[var(--fg)]">
            {item.targetKeyword}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">{t("content.suggestedPath")}</dt>
          <dd className="mt-0.5 font-mono text-xs text-[var(--fg)]">
            {item.suggestedPath}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">{t("content.intent")}</dt>
          <dd className="mt-0.5 text-[var(--fg)]">{item.intent ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">{t("content.whyWrite")}</dt>
          <dd className="mt-0.5 leading-relaxed text-[var(--fg)]">
            {item.rationale}
          </dd>
        </div>
        {item.geoHint ? (
          <div>
            <dt className="text-[var(--muted)]">{t("content.geoHint")}</dt>
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
        {busy
          ? t("content.generatingBrief")
          : brief
            ? t("content.regenerateBrief")
            : t("content.generateBrief")}
      </button>

      {briefError ? (
        <p className="mt-3 text-sm text-[#d93025]">{briefError}</p>
      ) : null}

      {brief ? (
        <div className="mt-5 space-y-4 border-t border-[var(--border)] pt-4 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Content Brief
              {brief.source === "ai" ? t("common.aiSuffix") : t("common.ruleSuffix")}
            </p>
            <p className="mt-2 leading-relaxed text-[var(--fg)]">{brief.summary}</p>
            {brief.warning ? (
              <p className="mt-2 text-xs text-[#8a5a00]">{brief.warning}</p>
            ) : null}
          </div>

          <div>
            <p className="font-medium text-[var(--fg)]">
              {t("content.searchIntent")}
            </p>
            <p className="mt-1 text-[var(--muted)]">{brief.intent}</p>
          </div>

          <div>
            <p className="font-medium text-[var(--fg)]">
              {t("content.directAnswer")}
            </p>
            <p className="mt-1 text-[var(--muted)]">{brief.definitionBlock}</p>
          </div>

          <div>
            <p className="font-medium text-[var(--fg)]">{t("content.outlineH2")}</p>
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
            <p className="font-medium text-[var(--fg)]">
              {t("content.internalTargets")}
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[var(--muted)]">
              {brief.internalLinks.map((link) => (
                <li key={link}>{link}</li>
              ))}
            </ul>
          </div>

          <div>
            <p className="font-medium text-[var(--fg)]">
              {t("content.structuredData")}
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[var(--muted)]">
              {brief.schemaHints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
          </div>

          <div>
            <p className="font-medium text-[var(--fg)]">
              {t("content.geoChecklist")}
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[var(--muted)]">
              {brief.geoChecklist.map((item) => (
                <li key={item}>{item}</li>
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
  const t = useT();
  const { locale, ready } = useI18n();
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

  const load = useCallback(
    async (url: string, opts?: { force?: boolean }) => {
      const force = opts?.force ?? false;
      if (!force) {
        const cached = getCachedContent(url, locale);
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
        const json = (await res.json()) as ContentGapsResponse & {
          error?: string;
        };
        if (!res.ok) {
          setError(json.error ?? t("content.analyzeFailed"));
          return;
        }
        setCachedContent(url, json, locale);
        setData(json);
        setFromCache(false);
        setSelected(json.items[0]?.id ?? null);
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
    data?.items.find((item) => item.id === selected) ?? data?.items[0] ?? null;

  return (
    <PageShell
      title={t("content.title")}
      description={t("content.description")}
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
                onClick={() => {
                  clearContentCache();
                  void load(siteUrl, { force: true });
                }}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--fg)] hover:bg-[var(--surface-2)] disabled:opacity-60"
              >
                {loading ? t("content.analyzing") : t("content.refreshGaps")}
              </button>
              <Link
                href={`/keywords?url=${encodeURIComponent(siteUrl)}`}
                className="rounded-lg bg-[var(--brand-blue)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--brand-blue-deep)]"
              >
                {t("content.viewKeywords")}
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
              {t("content.loading")}
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
              {t("content.empty")}
            </div>
          ) : null}
        </div>
      )}
    </PageShell>
  );
}
