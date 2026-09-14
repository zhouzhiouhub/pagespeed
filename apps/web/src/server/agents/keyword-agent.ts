import { extractPageSignals } from "@/server/keywords/extract";
import { buildKeywordOpportunities } from "@/server/keywords/opportunities";
import { readGscStore } from "@/server/gsc/store";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locale";
import {
  emptyAgentResult,
  priorityFromScore,
  type LightAgentCandidate,
  type LightAgentContext,
  type LightAgentResult,
} from "@/server/agents/light-types";

function t(
  locale: Locale,
  key: MessageKey,
  params?: Record<string, string | number>,
) {
  return translate(locale, key, params);
}

/**
 * Keyword Agent — GSC opportunities first, else page-signal heuristics.
 */
export async function runKeywordAgent(
  ctx: LightAgentContext,
  opts?: { pageHtml?: string | null; fetchedUrl?: string },
): Promise<LightAgentResult> {
  const { siteUrl, locale } = ctx;
  const result = emptyAgentResult("keyword");
  const candidates: LightAgentCandidate[] = [];

  const gsc = await readGscStore();
  const sameSite =
    gsc.siteUrl &&
    (gsc.siteUrl === siteUrl ||
      siteUrl.startsWith(gsc.siteUrl) ||
      gsc.siteUrl.includes(new URL(siteUrl).hostname));

  if (sameSite && gsc.opportunities.length > 0) {
    result.sources.push("gsc");
    result.sources.push("agent:keyword");
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
          agent: "keyword",
        },
        suggestedActions: op.actions,
        score,
        href: `/keywords?url=${encodeURIComponent(siteUrl)}`,
        ctaLabel: t(locale, "server.advice.viewKeywords"),
      });
    }
    result.candidates = candidates;
    return result;
  }

  const html = opts?.pageHtml;
  if (!html) {
    result.sources.push("agent:keyword");
    return result;
  }

  try {
    const signals = extractPageSignals(opts?.fetchedUrl || siteUrl, html);
    const kw = await buildKeywordOpportunities(siteUrl, signals, locale);
    result.sources.push(`keywords:${kw.source}`);
    result.sources.push("agent:keyword");
    if (kw.warning) result.warnings.push(kw.warning);
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
          agent: "keyword",
        },
        suggestedActions: op.actions,
        score,
        href: `/keywords?url=${encodeURIComponent(siteUrl)}`,
        ctaLabel: t(locale, "server.advice.viewKeywords"),
      });
    }
  } catch (err) {
    result.warnings.push(
      err instanceof Error
        ? t(locale, "server.advice.kwFailedPrefixed", { message: err.message })
        : t(locale, "server.advice.kwFailed"),
    );
    result.sources.push("agent:keyword");
  }

  result.candidates = candidates;
  return result;
}
