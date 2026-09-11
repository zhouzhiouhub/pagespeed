import { z } from "zod";
import { generateText } from "@/server/llm/gemini";
import type { GeoSiteAccess, GeoStructuralSignals } from "@/server/geo/extract";

export type GeoBreakdown = {
  answerability: number;
  structure: number;
  trust: number;
  ai_access: number;
  entity: number;
};

export type GeoMissingItem = {
  code: string;
  label: string;
};

export type GeoSignalChip = {
  key: string;
  label: string;
  ok: boolean;
};

export type GeoOpportunity = {
  id: string;
  type: "geo_readiness" | "geo_asset";
  scope: "page" | "site";
  title: string;
  page: string;
  missing: GeoMissingItem[];
  potential: number;
  rationale: string;
  actions: string[];
};

export type GeoLlmAnalysis = {
  pageKind: string;
  pageKindLabel: string;
  pageKindReason: string;
  expectationLabels: string[];
  breakdown: GeoBreakdown;
  score: number;
  signalChips: GeoSignalChip[];
  items: GeoOpportunity[];
  model: string | null;
  warning: string | null;
};

const missingSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
});

const analysisSchema = z.object({
  pageKind: z.string().min(1),
  pageKindLabel: z.string().min(1),
  pageKindReason: z.string().min(1),
  expectationLabels: z.array(z.string()).min(1).max(12),
  breakdown: z.object({
    answerability: z.number().min(0).max(100),
    structure: z.number().min(0).max(100),
    trust: z.number().min(0).max(100),
    ai_access: z.number().min(0).max(100),
    entity: z.number().min(0).max(100),
  }),
  signalChips: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        ok: z.boolean(),
      }),
    )
    .min(3)
    .max(16),
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        type: z.enum(["geo_readiness", "geo_asset"]),
        scope: z.enum(["page", "site"]),
        title: z.string().min(1),
        page: z.string().min(1),
        missing: z.array(missingSchema).min(1).max(8),
        potential: z.number().min(1).max(5),
        rationale: z.string().min(1),
        actions: z.array(z.string()).min(1).max(6),
      }),
    )
    .max(12),
});

function clampScore(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function overallFromBreakdown(b: GeoBreakdown): number {
  return Math.round(
    b.answerability * 0.28 +
      b.structure * 0.24 +
      b.trust * 0.18 +
      b.ai_access * 0.15 +
      b.entity * 0.15,
  );
}

function accessScore(access: GeoSiteAccess): number {
  let n = 40;
  if (access.robotsOk) n += 10;
  if (access.aiBotPolicy === "allow") n += 30;
  else if (access.aiBotPolicy === "mixed") n += 10;
  else if (access.aiBotPolicy === "block") n -= 20;
  if (access.llmsTxtPresent) n += 20;
  return clampScore(n);
}

/** Only structural/site facts — no content-language assumptions. */
function structuralFallback(
  pagePath: string,
  signals: GeoStructuralSignals,
  access: GeoSiteAccess,
  warning: string,
): GeoLlmAnalysis {
  const breakdown: GeoBreakdown = {
    answerability: signals.description ? 55 : 40,
    structure: signals.schemaTypes.length ? 55 : 35,
    trust: signals.hasAuthorMeta || signals.hasDateModifiedMeta ? 55 : 40,
    ai_access: accessScore(access),
    entity: signals.schemaTypes.length ? 50 : 35,
  };

  const items: GeoOpportunity[] = [];

  if (!access.llmsTxtPresent) {
    items.push({
      id: "llms-txt",
      type: "geo_asset",
      scope: "site",
      title: "llms.txt missing",
      page: "/llms.txt",
      missing: [{ code: "llms_txt", label: "llms.txt" }],
      potential: 3,
      rationale:
        "Structural check: /llms.txt was not found. Content-type-specific gaps need LLM analysis.",
      actions: ["Add /llms.txt with primary entry URLs"],
    });
  }

  if (access.aiBotPolicy === "block") {
    items.push({
      id: "ai-bots-blocked",
      type: "geo_readiness",
      scope: "site",
      title: "AI bots may be blocked in robots.txt",
      page: "/robots.txt",
      missing: [{ code: "ai_bot_access", label: "AI bot access" }],
      potential: 5,
      rationale: access.aiBotSummary,
      actions: ["Review AI crawler User-agent rules in robots.txt"],
    });
  }

  if (signals.schemaTypes.length === 0) {
    items.push({
      id: `schema::${pagePath}`,
      type: "geo_readiness",
      scope: "page",
      title: "No JSON-LD schema types detected",
      page: pagePath,
      missing: [{ code: "schema", label: "JSON-LD" }],
      potential: 4,
      rationale:
        "Structural check only: page HTML has no parseable JSON-LD @type. Exact entity recommendations require content analysis (LLM).",
      actions: ["Add JSON-LD appropriate to this page’s actual purpose"],
    });
  }

  return {
    pageKind: "unknown",
    pageKindLabel: "pending content analysis",
    pageKindReason:
      "Fallback: only structural HTML/robots signals used; configure LLM for content-aware GEO.",
    expectationLabels: ["content analysis via LLM"],
    breakdown,
    score: overallFromBreakdown(breakdown),
    signalChips: [
      {
        key: "schema",
        label: "JSON-LD",
        ok: signals.schemaTypes.length > 0,
      },
      { key: "table", label: "table", ok: signals.hasTable },
      {
        key: "list",
        label: "list",
        ok: signals.hasOrderedList || signals.hasUnorderedList,
      },
      { key: "author", label: "author meta", ok: signals.hasAuthorMeta },
      {
        key: "dateModified",
        label: "dateModified meta",
        ok: signals.hasDateModifiedMeta,
      },
      { key: "llms", label: "llms.txt", ok: access.llmsTxtPresent },
    ],
    items,
    model: null,
    warning,
  };
}

export async function analyzeGeoWithLlm(
  siteUrl: string,
  pagePath: string,
  signals: GeoStructuralSignals,
  access: GeoSiteAccess,
): Promise<GeoLlmAnalysis> {
  if (!process.env.LLM_API_KEY?.trim()) {
    return structuralFallback(
      pagePath,
      signals,
      access,
      "LLM_API_KEY missing: GEO content judgment disabled; showing structural signals only.",
    );
  }

  const prompt = `You are the GEO (Generative Engine Optimization) analyst for Website Growth Agent.

Task: Infer page purpose from THIS page's content, decide what THIS page should have for AI-citation readiness, then list only gaps that matter for that purpose. Do NOT apply a universal FAQ checklist.

Site URL: ${siteUrl}
Analyzed path: ${pagePath}

Structural signals JSON:
${JSON.stringify(
  {
    url: signals.url,
    title: signals.title,
    description: signals.description,
    h1: signals.h1,
    h2: signals.h2,
    h3: signals.h3,
    navSample: signals.navSample,
    textSample: signals.textSample,
    hasTable: signals.hasTable,
    hasOrderedList: signals.hasOrderedList,
    hasUnorderedList: signals.hasUnorderedList,
    schemaTypes: signals.schemaTypes,
    hasAuthorMeta: signals.hasAuthorMeta,
    hasDateModifiedMeta: signals.hasDateModifiedMeta,
    wordCountApprox: signals.wordCountApprox,
  },
  null,
  2,
)}

Site access JSON:
${JSON.stringify(
  {
    aiBotPolicy: access.aiBotPolicy,
    aiBotSummary: access.aiBotSummary,
    llmsTxtPresent: access.llmsTxtPresent,
  },
  null,
  2,
)}

Return ONE JSON object:
{
  "pageKind": "machine_slug",
  "pageKindLabel": "human label in page language",
  "pageKindReason": "why, citing page evidence",
  "expectationLabels": ["what THIS page should have, short"],
  "breakdown": {
    "answerability": 0-100,
    "structure": 0-100,
    "trust": 0-100,
    "ai_access": 0-100,
    "entity": 0-100
  },
  "signalChips": [{"key":"...","label":"...","ok":true|false}],
  "items": [{
    "id": "stable-id",
    "type": "geo_readiness"|"geo_asset",
    "scope": "page"|"site",
    "title": "...",
    "page": "${pagePath}" or "/llms.txt" or "/robots.txt",
    "missing": [{"code":"...","label":"..."}],
    "potential": 1-5,
    "rationale": "must reference page type + evidence",
    "actions": ["..."]
  }]
}

Rules:
- Match the page language for labels/titles/rationales/actions (Chinese site → Chinese).
- Portfolio/personal home: do NOT require FAQ unless content clearly needs Q&A.
- Product/docs: FAQ/HowTo may be appropriate if questions are likely.
- Only emit gaps that follow from content + purpose.
- Prefer 3-8 items. Include site-level llms/robots only if relevant.
- ai_access score should reflect site access JSON.
- No invented citation metrics. No markdown. JSON only.`;

  try {
    const { text, model } = await generateText(prompt);
    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const raw = JSON.parse(cleaned) as unknown;
    const parsed = analysisSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error("GEO LLM schema invalid");
    }

    const data = parsed.data;
    const breakdown: GeoBreakdown = {
      answerability: clampScore(data.breakdown.answerability),
      structure: clampScore(data.breakdown.structure),
      trust: clampScore(data.breakdown.trust),
      // Prefer measured access for ai_access
      ai_access: accessScore(access),
      entity: clampScore(data.breakdown.entity),
    };

    return {
      pageKind: data.pageKind,
      pageKindLabel: data.pageKindLabel,
      pageKindReason: data.pageKindReason,
      expectationLabels: data.expectationLabels,
      breakdown,
      score: overallFromBreakdown(breakdown),
      signalChips: data.signalChips,
      items: data.items.map((item) => ({
        ...item,
        potential: Math.max(1, Math.min(5, Math.round(item.potential))),
      })),
      model,
      warning: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "LLM failed";
    const locationBlocked = /location is not supported/i.test(message);
    return structuralFallback(
      pagePath,
      signals,
      access,
      locationBlocked
        ? `Gemini unavailable (${message}). Showing structural GEO only.`
        : `Content analysis failed (${message}). Showing structural GEO only.`,
    );
  }
}
