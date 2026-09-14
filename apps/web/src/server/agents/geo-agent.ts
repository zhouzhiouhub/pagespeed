import { analyzeGeo } from "@/server/geo/analyze";
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
 * GEO Agent — readiness score + geo opportunity cards.
 */
export async function runGeoAgent(
  ctx: LightAgentContext,
): Promise<LightAgentResult> {
  const { siteUrl, locale } = ctx;
  const result = emptyAgentResult("geo");
  const candidates: LightAgentCandidate[] = [];

  try {
    const geo = await analyzeGeo(siteUrl);
    result.sources.push("geo");
    result.sources.push("agent:geo");
    if (geo.warning) result.warnings.push(geo.warning);
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
          agent: "geo",
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
          agent: "geo",
        },
        suggestedActions: item.actions,
        score,
        href: `/geo?url=${encodeURIComponent(siteUrl)}`,
        ctaLabel: t(locale, "server.advice.generateGeoPlan"),
      });
    }
  } catch (err) {
    result.warnings.push(
      err instanceof Error
        ? t(locale, "server.advice.geoFailedPrefixed", { message: err.message })
        : t(locale, "server.advice.geoFailed"),
    );
    result.sources.push("agent:geo");
  }

  result.candidates = candidates;
  return result;
}
