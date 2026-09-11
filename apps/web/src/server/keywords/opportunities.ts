import { z } from "zod";
import type { PageSignals } from "@/server/keywords/extract";
import { generateText, safeParseJsonArray } from "@/server/llm/gemini";
import {
  DEFAULT_LOCALE,
  llmLanguageRule,
  type Locale,
} from "@/lib/i18n/locale";
import { translate } from "@/lib/i18n/messages";

export type KeywordOpportunity = {
  query: string;
  position: number | null;
  potential: number;
  page: string;
  trend7d: number | null;
  intent: string | null;
  rationale: string;
  actions: string[];
  source: "gsc" | "ai" | "heuristic";
};

const llmItemSchema = z.object({
  query: z.string().min(1),
  position: z.number().min(1).max(100).nullable().optional(),
  potential: z.number().min(1).max(5),
  page: z.string().min(1),
  trend7d: z.number().nullable().optional(),
  intent: z.string().nullable().optional(),
  rationale: z.string().min(1),
  actions: z.array(z.string()).min(1).max(6),
});

function normalizePage(pathOrUrl: string, siteUrl: string): string {
  try {
    if (pathOrUrl.startsWith("http")) {
      return new URL(pathOrUrl).pathname || "/";
    }
    return pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  } catch {
    try {
      return new URL(siteUrl).pathname || "/";
    } catch {
      return "/";
    }
  }
}

function heuristicOpportunities(
  siteUrl: string,
  signals: PageSignals,
  locale: Locale,
): KeywordOpportunity[] {
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
    translate(locale, key, params);

  const host = (() => {
    try {
      return new URL(siteUrl).hostname.replace(/^www\./, "");
    } catch {
      return siteUrl;
    }
  })();
  const brand = host.split(".")[0] ?? host;

  const titleParts = (signals.title ?? "")
    .split(/[|\-–—·•]/g)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3 && s.length <= 48);

  const noisy =
    /cookie|login|sign in|subscribe|windows recommended|classic|beta|apple silicon|intel|download|privacy|terms|copyright|©/i;

  const seeds = [
    ...titleParts,
    ...signals.h1,
    ...signals.h2.slice(0, 10),
    brand,
    `${brand} remote desktop`,
    t("server.keywords.seedDownload", { brand }),
    t("server.keywords.seedAlt", { brand }),
  ]
    .filter(Boolean)
    .map((s) => String(s).trim())
    .filter((s) => s.length >= 2 && s.length <= 48 && !noisy.test(s));

  const unique = [...new Set(seeds)].slice(0, 10);
  return unique.map((query, index) => {
    const position = 8 + ((index * 3) % 13);
    const potential = Math.max(2, 5 - Math.floor(index / 2));
    return {
      query,
      position,
      potential,
      page: normalizePage(signals.url, siteUrl),
      trend7d: index % 2 === 0 ? -(1 + (index % 5)) : index % 3,
      intent: /如何|什么|怎么|how|what|vs|对比|替代|alternatives|download/i.test(
        query,
      )
        ? "informational"
        : "commercial",
      rationale: t("server.keywords.rationale", { host }),
      actions: [
        t("server.keywords.actionTitle"),
        t("server.keywords.actionFaq"),
        t("server.keywords.actionLinks"),
        t("server.keywords.actionIntent"),
      ],
      source: "heuristic" as const,
    };
  });
}

async function aiOpportunities(
  siteUrl: string,
  signals: PageSignals,
  locale: Locale,
): Promise<KeywordOpportunity[]> {
  const prompt = `You are an SEO Keyword Agent. From page signals, produce keyword opportunities worth winning (not a keyword dump).
Site: ${siteUrl}
Page signals JSON:
${JSON.stringify(signals, null, 2)}

Requirements:
1. Output a JSON array; each item fields: query, position(8-25 or null), potential(1-5 int), page(path), trend7d(negative = rank improving, nullable), intent, rationale, actions(string array)
2. Prefer: product/category terms, question long-tails, terms close to existing landing pages
3. Do not invent absurd search-volume numbers; if no real GSC data, give reasonable "to verify" estimates and say so in rationale
4. 8-12 items
5. ${llmLanguageRule(locale)}
6. JSON only`;

  const { text } = await generateText(prompt);
  const raw = safeParseJsonArray<unknown>(text);
  const items: KeywordOpportunity[] = [];

  for (const row of raw) {
    const parsed = llmItemSchema.safeParse(row);
    if (!parsed.success) continue;
    const item = parsed.data;
    items.push({
      query: item.query.trim(),
      position: item.position ?? null,
      potential: Math.round(item.potential),
      page: normalizePage(item.page, siteUrl),
      trend7d: item.trend7d ?? null,
      intent: item.intent ?? null,
      rationale: item.rationale.trim(),
      actions: item.actions,
      source: "ai",
    });
  }

  if (items.length === 0) {
    throw new Error("AI returned no valid keyword opportunities");
  }
  return items.slice(0, 12);
}

export async function buildKeywordOpportunities(
  siteUrl: string,
  signals: PageSignals,
  locale: Locale = DEFAULT_LOCALE,
): Promise<{
  items: KeywordOpportunity[];
  source: "ai" | "heuristic";
  model: string | null;
  warning: string | null;
}> {
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
    translate(locale, key, params);

  const hasLlm = Boolean(process.env.LLM_API_KEY?.trim());
  if (hasLlm) {
    try {
      const items = await aiOpportunities(siteUrl, signals, locale);
      return {
        items,
        source: "ai",
        model: process.env.LLM_MODEL?.trim() || "gemini-3.6-flash",
        warning: t("server.keywords.warnAiEstimate"),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "LLM failed";
      const items = heuristicOpportunities(siteUrl, signals, locale);
      const locationBlocked = /location is not supported/i.test(message);
      const warning = locationBlocked
        ? t("server.keywords.warnLocation")
        : t("server.keywords.warnAiFail", { message });
      return {
        items,
        source: "heuristic",
        model: null,
        warning,
      };
    }
  }

  return {
    items: heuristicOpportunities(siteUrl, signals, locale),
    source: "heuristic",
    model: null,
    warning: t("server.keywords.warnNoLlm"),
  };
}
