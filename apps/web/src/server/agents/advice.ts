import { z } from "zod";
import { fetchText } from "@/server/http/fetch";
import { extractPageSignals } from "@/server/keywords/extract";
import { buildKeywordOpportunities } from "@/server/keywords/opportunities";
import { buildContentGaps } from "@/server/content/gaps";
import { analyzeGeo } from "@/server/geo/analyze";
import { readGscStore } from "@/server/gsc/store";
import { runPageSpeed } from "@/server/integrations/pagespeed";
import { readGa4Store } from "@/server/ga4/store";
import { generateText } from "@/server/llm/gemini";
import {
  readAdviceRun,
  writeAdviceRun,
  type AdviceItemRecord,
  type AdviceRunRecord,
  type AdviceUserState,
} from "@/server/advice/store";
import {
  DEFAULT_LOCALE,
  llmLanguageRule,
  type Locale,
} from "@/lib/i18n/locale";
import { translate, type MessageKey } from "@/lib/i18n/messages";

type Candidate = Omit<AdviceItemRecord, "userState">;

function siteKey(url: string) {
  return url;
}

function t(
  locale: Locale,
  key: MessageKey,
  params?: Record<string, string | number>,
) {
  return translate(locale, key, params);
}

function mergeUserStates(
  nextItems: Candidate[],
  prev: AdviceRunRecord | null,
): AdviceItemRecord[] {
  const prevMap = new Map(prev?.items.map((i) => [i.id, i.userState] as const));
  return nextItems.map((item) => ({
    ...item,
    userState: (prevMap.get(item.id) ?? "open") as AdviceUserState,
  }));
}

function priorityFromScore(score: number): AdviceItemRecord["priority"] {
  if (score >= 0.75) return "high";
  if (score >= 0.5) return "medium";
  return "growth";
}

async function collectCandidates(
  siteUrl: string,
  locale: Locale,
): Promise<{
  candidates: Candidate[];
  sources: string[];
  warning: string | null;
}> {
  const sources: string[] = [];
  const warnings: string[] = [];
  const candidates: Candidate[] = [];

  const gsc = await readGscStore();
  const sameSite =
    gsc.siteUrl &&
    (gsc.siteUrl === siteUrl ||
      siteUrl.startsWith(gsc.siteUrl) ||
      gsc.siteUrl.includes(new URL(siteUrl).hostname));

  if (sameSite && gsc.opportunities.length > 0) {
    sources.push("gsc");
    for (const op of gsc.opportunities.slice(0, 8)) {
      const score = Math.min(0.95, 0.45 + op.potential * 0.1);
      candidates.push({
        id: `kw-gsc:${op.query}`,
        priority: priorityFromScore(score),
        type: "keyword",
        title: t(locale, "server.advice.kwGrabTitle", { query: op.query }),
        summary: op.rationale,
        evidence: {
          query: op.query,
          position: op.position,
          page: op.page,
          potential: op.potential,
          source: "gsc",
        },
        suggestedActions: op.actions,
        score,
        href: `/keywords?url=${encodeURIComponent(siteUrl)}`,
        ctaLabel: t(locale, "server.advice.viewKeywords"),
      });
    }
  }

  let pageHtml: string | null = null;
  let fetchedUrl = siteUrl;
  try {
    const page = await fetchText(siteUrl, { timeoutMs: 25_000 });
    if (page.ok) {
      pageHtml = page.text;
      fetchedUrl = page.finalUrl || siteUrl;
      sources.push("crawl");
    } else {
      warnings.push(
        t(locale, "server.advice.crawlFailedHttp", { status: page.status }),
      );
    }
  } catch (err) {
    warnings.push(
      err instanceof Error
        ? err.message
        : t(locale, "server.advice.crawlFailed"),
    );
  }

  if (pageHtml) {
    const signals = extractPageSignals(fetchedUrl, pageHtml);

    if (!sameSite || gsc.opportunities.length === 0) {
      try {
        const kw = await buildKeywordOpportunities(siteUrl, signals, locale);
        sources.push(`keywords:${kw.source}`);
        if (kw.warning) warnings.push(kw.warning);
        for (const op of kw.items.slice(0, 5)) {
          const score = Math.min(0.85, 0.35 + op.potential * 0.1);
          candidates.push({
            id: `kw:${op.query}`,
            priority: priorityFromScore(score),
            type: "keyword",
            title: t(locale, "server.advice.kwOppTitle", { query: op.query }),
            summary: op.rationale,
            evidence: {
              query: op.query,
              position: op.position,
              page: op.page,
              potential: op.potential,
              source: op.source,
            },
            suggestedActions: op.actions,
            score,
            href: `/keywords?url=${encodeURIComponent(siteUrl)}`,
            ctaLabel: t(locale, "server.advice.viewKeywords"),
          });
        }
      } catch (err) {
        warnings.push(
          err instanceof Error
            ? t(locale, "server.advice.kwFailedPrefixed", {
                message: err.message,
              })
            : t(locale, "server.advice.kwFailed"),
        );
      }
    }

    try {
      const gaps = await buildContentGaps(siteUrl, signals, locale);
      sources.push(`content:${gaps.source}`);
      if (gaps.warning) warnings.push(gaps.warning);
      for (const gap of gaps.items.slice(0, 4)) {
        const score = Math.min(0.9, 0.4 + gap.potential * 0.1);
        candidates.push({
          id: `content:${gap.id}`,
          priority: priorityFromScore(score),
          type: "content_gap",
          title: gap.title,
          summary: gap.rationale,
          evidence: {
            targetKeyword: gap.targetKeyword,
            suggestedPath: gap.suggestedPath,
            potential: gap.potential,
            source: gap.source,
          },
          suggestedActions: [
            t(locale, "server.advice.contentActionBrief"),
            t(locale, "server.advice.contentActionOutline"),
          ],
          score,
          href: `/content?url=${encodeURIComponent(siteUrl)}`,
          ctaLabel: t(locale, "server.advice.viewContent"),
        });
      }
    } catch (err) {
      warnings.push(
        err instanceof Error
          ? t(locale, "server.advice.contentFailedPrefixed", {
              message: err.message,
            })
          : t(locale, "server.advice.contentFailed"),
      );
    }
  }

  try {
    const geo = await analyzeGeo(siteUrl);
    sources.push("geo");
    if (geo.warning) warnings.push(geo.warning);
    if (geo.score < 70) {
      candidates.push({
        id: `geo-score:${geo.score}`,
        priority: geo.score < 50 ? "high" : "medium",
        type: "geo_readiness",
        title: t(locale, "server.advice.geoScoreTitle", {
          score: geo.score,
          kind: geo.page.pageKindLabel,
        }),
        summary: geo.page.pageKindReason,
        evidence: {
          score: geo.score,
          breakdown: geo.breakdown,
          pageKind: geo.page.pageKind,
        },
        suggestedActions: geo.page.expectationLabels.slice(0, 4),
        score: Math.min(0.92, (100 - geo.score) / 100 + 0.35),
        href: `/geo?url=${encodeURIComponent(siteUrl)}`,
        ctaLabel: t(locale, "server.advice.viewGeo"),
      });
    }
    for (const item of geo.items.slice(0, 5)) {
      const score = Math.min(0.95, 0.4 + item.potential * 0.1);
      candidates.push({
        id: `geo:${item.id}`,
        priority: priorityFromScore(score),
        type: item.type,
        title: item.title,
        summary: item.rationale,
        evidence: {
          page: item.page,
          missing: item.missing,
          scope: item.scope,
        },
        suggestedActions: item.actions,
        score,
        href: `/geo?url=${encodeURIComponent(siteUrl)}`,
        ctaLabel: t(locale, "server.advice.generateGeoPlan"),
      });
    }
  } catch (err) {
    warnings.push(
      err instanceof Error
        ? t(locale, "server.advice.geoFailedPrefixed", {
            message: err.message,
          })
        : t(locale, "server.advice.geoFailed"),
    );
  }

  try {
    const ga4 = await readGa4Store();
    const sameGa =
      ga4.siteUrl &&
      (ga4.siteUrl === siteUrl ||
        siteUrl.includes(ga4.siteUrl) ||
        ga4.siteUrl.includes(new URL(siteUrl).hostname));
    if (sameGa && ga4.lastSyncedAt && ga4.topPages.length > 0) {
      sources.push("ga4");
      const top = ga4.topPages[0];
      candidates.push({
        id: `ga4-top:${top.path}`,
        priority: "medium",
        type: "cro",
        title: t(locale, "server.advice.ga4TopTitle", { path: top.path }),
        summary: t(locale, "server.advice.ga4TopSummary", {
          sessions: top.sessions,
          users: top.users,
        }),
        evidence: {
          path: top.path,
          sessions: top.sessions,
          users: top.users,
          sessions7d: ga4.sessions7d,
          users7d: ga4.users7d,
        },
        suggestedActions: [
          t(locale, "server.advice.ga4ActionAnswer"),
          t(locale, "server.advice.ga4ActionFaq"),
          t(locale, "server.advice.ga4ActionLinks"),
        ],
        score: 0.62,
        href: `/geo?url=${encodeURIComponent(siteUrl)}`,
        ctaLabel: t(locale, "server.advice.viewGeo"),
      });
    }
  } catch (err) {
    warnings.push(
      err instanceof Error
        ? t(locale, "server.advice.ga4FailedPrefixed", {
            message: err.message,
          })
        : t(locale, "server.advice.ga4Failed"),
    );
  }

  if (process.env.PAGESPEED_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim()) {
    try {
      const psi = await runPageSpeed(siteUrl, "mobile");
      sources.push("pagespeed");
      const perf = psi.scores.find((s) => s.id === "performance")?.score;
      const seo = psi.scores.find((s) => s.id === "seo")?.score;
      const topOps = psi.opportunities.slice(0, 3);
      for (const op of topOps) {
        const score =
          op.kind === "fail" ? 0.8 : op.kind === "opportunity" ? 0.65 : 0.45;
        candidates.push({
          id: `psi:${op.id}`,
          priority: priorityFromScore(score),
          type: "tech_seo",
          title: op.title,
          summary: op.description ?? `PageSpeed ${op.categoryTitle}`,
          evidence: {
            category: op.category,
            displayValue: op.displayValue,
            performance: perf,
            seo,
            strategy: "mobile",
          },
          suggestedActions: [t(locale, "server.advice.psiFixAction")],
          score,
          href: `/audit?url=${encodeURIComponent(siteUrl)}`,
          ctaLabel: t(locale, "server.advice.viewAudit"),
        });
      }
    } catch (err) {
      warnings.push(
        err instanceof Error
          ? t(locale, "server.advice.pagespeedFailedPrefixed", {
              message: err.message,
            })
          : t(locale, "server.advice.pagespeedFailed"),
      );
    }
  }

  // de-dupe by id, keep highest score
  const byId = new Map<string, Candidate>();
  for (const c of candidates) {
    const prev = byId.get(c.id);
    if (!prev || c.score > prev.score) byId.set(c.id, c);
  }

  const ranked = [...byId.values()].sort((a, b) => b.score - a.score);
  // recompute priority after final score
  for (const c of ranked) {
    c.priority = priorityFromScore(c.score);
  }

  return {
    candidates: ranked.slice(0, 12),
    sources,
    warning: warnings.length ? warnings.slice(0, 4).join(" · ") : null,
  };
}

const polishSchema = z.object({
  greeting: z.string().min(1),
  headline: z.string().min(1),
  order: z.array(z.string()).optional(),
});

async function polishWithLlm(
  siteUrl: string,
  items: AdviceItemRecord[],
  locale: Locale,
): Promise<{ greeting: string; headline: string; order: string[] | null; model: string | null }> {
  const openCount = items.filter((i) => i.userState === "open").length;
  const fallback = {
    greeting: t(locale, "server.advice.greeting"),
    headline: t(locale, "server.advice.headlineOpen", { count: openCount }),
    order: null as string[] | null,
    model: null as string | null,
  };

  if (!process.env.LLM_API_KEY?.trim()) {
    return fallback;
  }

  try {
    const prompt = `You are the Website Growth Orchestrator. Write a short daily standup for the site owner.
Site: ${siteUrl}
Items JSON: ${JSON.stringify(
      items.map((i) => ({
        id: i.id,
        priority: i.priority,
        type: i.type,
        title: i.title,
        summary: i.summary,
        score: i.score,
      })),
    )}

Return JSON: { "greeting": "...", "headline": "...", "order": ["itemId", ...] }
Rules:
- ${llmLanguageRule(locale)}
- greeting like a colleague standup, not an audit scare.
- headline states how many open items matter today.
- order is optional re-rank of ids (same set).
- JSON only.`;

    const { text, model } = await generateText(prompt);
    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = polishSchema.safeParse(JSON.parse(cleaned));
    if (!parsed.success) throw new Error("advice polish schema invalid");
    return {
      greeting: parsed.data.greeting,
      headline: parsed.data.headline,
      order: parsed.data.order ?? null,
      model,
    };
  } catch {
    return fallback;
  }
}

function applyOrder(
  items: AdviceItemRecord[],
  order: string[] | null,
): AdviceItemRecord[] {
  if (!order?.length) return items;
  const map = new Map(items.map((i) => [i.id, i]));
  const next: AdviceItemRecord[] = [];
  for (const id of order) {
    const item = map.get(id);
    if (item) {
      next.push(item);
      map.delete(id);
    }
  }
  for (const item of map.values()) next.push(item);
  return next;
}

export async function composeDailyAdvice(
  siteUrl: string,
  opts?: { force?: boolean; locale?: Locale },
): Promise<AdviceRunRecord> {
  const force = opts?.force ?? false;
  const locale = opts?.locale ?? DEFAULT_LOCALE;
  const prev = await readAdviceRun(siteUrl);

  if (!force && prev) {
    const ageMs = Date.now() - new Date(prev.generatedAt).getTime();
    const localeMatch = !prev.locale || prev.locale === locale;
    if (ageMs < 30 * 60 * 1000 && localeMatch) {
      return prev;
    }
  }

  const { candidates, sources, warning } = await collectCandidates(
    siteUrl,
    locale,
  );
  let items = mergeUserStates(candidates, prev);

  const polish = await polishWithLlm(siteUrl, items, locale);
  items = applyOrder(items, polish.order);

  const run: AdviceRunRecord = {
    siteUrl: siteKey(siteUrl),
    runId: `advice_${Date.now()}`,
    generatedAt: new Date().toISOString(),
    locale,
    greeting: polish.greeting,
    headline: polish.headline,
    sources,
    warning,
    model: polish.model,
    items,
  };

  await writeAdviceRun(run);
  return run;
}
