import { z } from "zod";
import type { PageSignals } from "@/server/keywords/extract";
import { generateText, safeParseJsonArray } from "@/server/llm/gemini";
import { readGscStore } from "@/server/gsc/store";
import {
  DEFAULT_LOCALE,
  llmLanguageRule,
  type Locale,
} from "@/lib/i18n/locale";
import { translate } from "@/lib/i18n/messages";

export type ContentGap = {
  id: string;
  title: string;
  targetKeyword: string;
  potential: number;
  suggestedPath: string;
  intent: string | null;
  rationale: string;
  geoHint: string | null;
  source: "gsc" | "ai" | "heuristic";
};

const llmGapSchema = z.object({
  title: z.string().min(1),
  targetKeyword: z.string().min(1),
  potential: z.number().min(1).max(5),
  suggestedPath: z.string().min(1),
  intent: z.string().nullable().optional(),
  rationale: z.string().min(1),
  geoHint: z.string().nullable().optional(),
});

function slugify(input: string): string {
  const ascii = input
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (ascii) return ascii;
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  return `topic-${Math.abs(h) % 10000}`;
}

function makeId(keyword: string, path: string): string {
  return `${slugify(keyword)}::${path}`;
}

function normalizePath(pathOrUrl: string): string {
  try {
    if (pathOrUrl.startsWith("http")) {
      return new URL(pathOrUrl).pathname || "/";
    }
    return pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  } catch {
    return "/blog/new-page";
  }
}

function heuristicGaps(
  siteUrl: string,
  signals: PageSignals,
  locale: Locale,
): ContentGap[] {
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

  const noisy =
    /cookie|login|sign in|subscribe|privacy|terms|copyright|©|windows recommended/i;

  const topicSeeds = [
    ...signals.h2.slice(0, 8),
    ...signals.navTexts
      .filter((x) => x.length >= 2 && x.length <= 32 && !noisy.test(x))
      .slice(0, 8),
  ]
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && !noisy.test(s));

  const uniqueTopics = [...new Set(topicSeeds)].slice(0, 6);

  const templates: Array<Omit<ContentGap, "id">> = [
    {
      title: t("server.content.guideTitle", { brand }),
      targetKeyword: t("server.content.guideKeyword", { brand }),
      potential: 5,
      suggestedPath: `/blog/${slugify(`${brand}-guide`)}`,
      intent: "informational",
      rationale: t("server.content.guideRationale"),
      geoHint: t("server.content.guideGeo"),
      source: "heuristic",
    },
    {
      title: t("server.content.vsTitle", { brand }),
      targetKeyword: t("server.content.vsKeyword", { brand }),
      potential: 4,
      suggestedPath: `/blog/${slugify(`${brand}-vs-alternatives`)}`,
      intent: "commercial",
      rationale: t("server.content.vsRationale"),
      geoHint: t("server.content.vsGeo"),
      source: "heuristic",
    },
    {
      title: t("server.content.whatTitle", { brand }),
      targetKeyword: t("server.content.whatKeyword", { brand }),
      potential: 4,
      suggestedPath: `/blog/${slugify(`what-is-${brand}`)}`,
      intent: "informational",
      rationale: t("server.content.whatRationale"),
      geoHint: t("server.content.whatGeo"),
      source: "heuristic",
    },
  ];

  const fromPage = uniqueTopics.map((topic, index) => {
    const path = `/blog/${slugify(topic)}`;
    const isQuestion = /如何|什么|怎么|why|how|what|\?|？/i.test(topic);
    return {
      title: isQuestion ? topic : t("server.content.topicTitle", { topic }),
      targetKeyword: topic,
      potential: Math.max(2, 5 - Math.floor(index / 2)),
      suggestedPath: path,
      intent: isQuestion ? "informational" : "commercial",
      rationale: t("server.content.topicRationale", { topic }),
      geoHint: isQuestion
        ? t("server.content.topicGeoQuestion")
        : t("server.content.topicGeoTheme"),
      source: "heuristic" as const,
    };
  });

  const merged = [...templates, ...fromPage]
    .filter(
      (g, i, arr) =>
        arr.findIndex((x) => x.targetKeyword === g.targetKeyword) === i,
    )
    .slice(0, 10);

  return merged.map((g) => ({
    ...g,
    id: makeId(g.targetKeyword, g.suggestedPath),
  }));
}

async function aiGaps(
  siteUrl: string,
  signals: PageSignals,
  locale: Locale,
): Promise<{ items: ContentGap[]; model: string }> {
  const prompt = `You are the Website Growth Content Agent. From homepage signals, find content gaps that should be written but are missing (not edits to existing pages).
Site: ${siteUrl}
Page signals:
${JSON.stringify(signals, null, 2)}

Output a JSON array; each item fields:
title, targetKeyword, potential(1-5), suggestedPath(/blog/... or /docs/...), intent, rationale, geoHint(nullable)

Requirements:
1. 6-10 items; prefer answer/guide/comparison/FAQ topics
2. suggestedPath must use English slugs, reasonable and unique
3. Explain why it is a gap (topic signal without a dedicated page)
4. geoHint should say how to make it citable by AI
5. ${llmLanguageRule(locale)}
6. JSON only`;

  const { text, model } = await generateText(prompt);
  const raw = safeParseJsonArray<unknown>(text);
  const items: ContentGap[] = [];

  for (const row of raw) {
    const parsed = llmGapSchema.safeParse(row);
    if (!parsed.success) continue;
    const item = parsed.data;
    const path = normalizePath(item.suggestedPath);
    items.push({
      id: makeId(item.targetKeyword, path),
      title: item.title.trim(),
      targetKeyword: item.targetKeyword.trim(),
      potential: Math.round(item.potential),
      suggestedPath: path,
      intent: item.intent ?? null,
      rationale: item.rationale.trim(),
      geoHint: item.geoHint ?? null,
      source: "ai",
    });
  }

  if (items.length === 0) {
    throw new Error("AI returned no valid content gaps");
  }
  return { items: items.slice(0, 12), model };
}

export async function buildContentGaps(
  siteUrl: string,
  signals: PageSignals,
  locale: Locale = DEFAULT_LOCALE,
): Promise<{
  items: ContentGap[];
  source: "gsc" | "ai" | "heuristic";
  model: string | null;
  warning: string | null;
}> {
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
    translate(locale, key, params);

  const store = await readGscStore();
  const sameSite =
    store.siteUrl &&
    (store.siteUrl === siteUrl ||
      siteUrl.startsWith(store.siteUrl) ||
      store.siteUrl.includes(new URL(siteUrl).hostname));

  if (sameSite && store.rows.length > 0) {
    const fromGsc: ContentGap[] = store.rows
      .filter((r) => {
        const path = (() => {
          try {
            return new URL(r.page).pathname || "/";
          } catch {
            return r.page.startsWith("/") ? r.page : "/";
          }
        })();
        const thinLanding =
          path === "/" ||
          path === "/index" ||
          path === "/home" ||
          path.split("/").filter(Boolean).length <= 1;
        return r.impressions >= 20 && thinLanding;
      })
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 12)
      .map((r) => {
        const path = `/blog/${slugify(r.query)}`;
        return {
          id: makeId(r.query, path),
          title: t("server.content.gscTitle", { query: r.query }),
          targetKeyword: r.query,
          potential:
            r.impressions >= 200
              ? 5
              : r.impressions >= 80
                ? 4
                : r.impressions >= 40
                  ? 3
                  : 2,
          suggestedPath: path,
          intent: /如何|什么|怎么|how|what|vs|对比/i.test(r.query)
            ? "informational"
            : "commercial",
          rationale: t("server.content.gscRationale", {
            query: r.query,
            impressions: r.impressions,
            clicks: r.clicks,
          }),
          geoHint: t("server.content.gscGeo"),
          source: "gsc" as const,
        };
      });

    if (fromGsc.length > 0) {
      return {
        items: fromGsc,
        source: "gsc",
        model: null,
        warning: null,
      };
    }
  }

  const hasLlm = Boolean(process.env.LLM_API_KEY?.trim());
  if (hasLlm) {
    try {
      const { items, model } = await aiGaps(siteUrl, signals, locale);
      return {
        items,
        source: "ai",
        model,
        warning: t("server.content.warnAi"),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "LLM failed";
      const items = heuristicGaps(siteUrl, signals, locale);
      const locationBlocked = /location is not supported/i.test(message);
      const fsStub = /unenv|fs\.mkdir|not implemented/i.test(message);
      return {
        items,
        source: "heuristic",
        model: null,
        warning: locationBlocked
          ? t("server.content.warnLocation")
          : fsStub
            ? t("server.content.warnAi")
            : t("server.content.warnAiFail", { message }),
      };
    }
  }

  return {
    items: heuristicGaps(siteUrl, signals, locale),
    source: "heuristic",
    model: null,
    warning: t("server.content.warnNoLlm"),
  };
}
