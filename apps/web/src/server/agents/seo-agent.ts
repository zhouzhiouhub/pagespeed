import { runPageSpeed } from "@/server/integrations/pagespeed";
import { getServerEnv } from "@/server/env";
import { readGa4Store } from "@/server/ga4/store";
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
 * SEO Agent — PageSpeed tech opportunities + light GA4 CRO nudge.
 */
export async function runSeoAgent(
  ctx: LightAgentContext,
): Promise<LightAgentResult> {
  const { siteUrl, locale } = ctx;
  const result = emptyAgentResult("seo");
  const candidates: LightAgentCandidate[] = [];

  try {
    const ga4 = await readGa4Store();
    const sameGa =
      ga4.siteUrl &&
      (ga4.siteUrl === siteUrl ||
        siteUrl.includes(ga4.siteUrl) ||
        ga4.siteUrl.includes(new URL(siteUrl).hostname));
    if (sameGa && ga4.lastSyncedAt && ga4.topPages.length > 0) {
      result.sources.push("ga4");
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
          agent: "seo",
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
    result.warnings.push(
      err instanceof Error
        ? t(locale, "server.advice.ga4FailedPrefixed", {
            message: err.message,
          })
        : t(locale, "server.advice.ga4Failed"),
    );
  }

  if (
    (await getServerEnv("PAGESPEED_API_KEY")) ||
    (await getServerEnv("GOOGLE_API_KEY"))
  ) {
    try {
      const psi = await runPageSpeed(siteUrl, "mobile");
      result.sources.push("pagespeed");
      result.sources.push("agent:seo");
      const perf = psi.scores.find((s) => s.id === "performance")?.score;
      const seo = psi.scores.find((s) => s.id === "seo")?.score;
      for (const op of psi.opportunities.slice(0, 3)) {
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
            agent: "seo",
          },
          suggestedActions: [t(locale, "server.advice.psiFixAction")],
          score,
          href: `/audit?url=${encodeURIComponent(siteUrl)}`,
          ctaLabel: t(locale, "server.advice.viewAudit"),
        });
      }
    } catch (err) {
      result.warnings.push(
        err instanceof Error
          ? t(locale, "server.advice.pagespeedFailedPrefixed", {
              message: err.message,
            })
          : t(locale, "server.advice.pagespeedFailed"),
      );
      result.sources.push("agent:seo");
    }
  } else {
    result.sources.push("agent:seo");
  }

  result.candidates = candidates;
  return result;
}
