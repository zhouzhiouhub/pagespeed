import { buildContentGaps } from "@/server/content/gaps";
import { extractPageSignals } from "@/server/keywords/extract";
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
 * Content Agent — content gap opportunities from page themes.
 */
export async function runContentAgent(
  ctx: LightAgentContext,
  opts?: { pageHtml?: string | null; fetchedUrl?: string },
): Promise<LightAgentResult> {
  const { siteUrl, locale } = ctx;
  const result = emptyAgentResult("content");
  const html = opts?.pageHtml;
  if (!html) {
    result.sources.push("agent:content");
    return result;
  }

  const candidates: LightAgentCandidate[] = [];
  try {
    const signals = extractPageSignals(opts?.fetchedUrl || siteUrl, html);
    const gaps = await buildContentGaps(siteUrl, signals, locale);
    result.sources.push(`content:${gaps.source}`);
    result.sources.push("agent:content");
    if (gaps.warning) result.warnings.push(gaps.warning);
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
          agent: "content",
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
    result.warnings.push(
      err instanceof Error
        ? t(locale, "server.advice.contentFailedPrefixed", {
            message: err.message,
          })
        : t(locale, "server.advice.contentFailed"),
    );
    result.sources.push("agent:content");
  }

  result.candidates = candidates;
  return result;
}
