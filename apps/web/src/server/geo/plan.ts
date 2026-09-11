import { z } from "zod";
import { applyProxyDispatcher } from "@/server/http/proxy-bootstrap";
import { generateText } from "@/server/llm/gemini";
import type { GeoOpportunity } from "@/server/geo/analyze";

applyProxyDispatcher();

export type GeoPlan = {
  opportunityId: string;
  title: string;
  page: string;
  summary: string;
  sections: Array<{ heading: string; body: string }>;
  copyBlocks: Array<{ label: string; content: string }>;
  schemaSnippet: string | null;
  llmsTxtSnippet: string | null;
  steps: Array<{ order: number; title: string; content: string }>;
  checklist: string[];
  source: "ai" | "heuristic";
  model: string | null;
  warning: string | null;
};

const planSchema = z.object({
  summary: z.string().min(1),
  sections: z
    .array(z.object({ heading: z.string(), body: z.string() }))
    .min(1)
    .max(8),
  copyBlocks: z
    .array(z.object({ label: z.string(), content: z.string() }))
    .min(1)
    .max(8),
  schemaSnippet: z.string().nullable().optional(),
  llmsTxtSnippet: z.string().nullable().optional(),
  steps: z
    .array(
      z.object({
        order: z.number(),
        title: z.string(),
        content: z.string(),
      }),
    )
    .min(2)
    .max(10),
  checklist: z.array(z.string()).min(2).max(10),
});

function heuristicPlan(siteUrl: string, item: GeoOpportunity): GeoPlan {
  return {
    opportunityId: item.id,
    title: item.title,
    page: item.page,
    summary: item.rationale,
    sections: [
      {
        heading: item.title,
        body: item.actions.join("\n"),
      },
    ],
    copyBlocks: item.missing.map((m) => ({
      label: m.label,
      content: `Address missing: ${m.label} (${m.code}) on ${item.page}`,
    })),
    schemaSnippet: null,
    llmsTxtSnippet: item.missing.some((m) => m.code === "llms_txt")
      ? `# ${siteUrl}\n> Add site summary for AI systems\n`
      : null,
    steps: item.actions.map((content, i) => ({
      order: i + 1,
      title: `Step ${i + 1}`,
      content,
    })),
    checklist: item.missing.map((m) => m.label),
    source: "heuristic",
    model: null,
    warning:
      "LLM unavailable: plan is derived from the opportunity payload only (no canned templates).",
  };
}

async function aiPlan(siteUrl: string, item: GeoOpportunity): Promise<GeoPlan> {
  const prompt = `You are the GEO Agent. Create an actionable plan for ONE opportunity.
Infer needed artifacts from the opportunity itself (do not force FAQ if the gap is not about FAQ).

Site: ${siteUrl}
Opportunity JSON: ${JSON.stringify(item)}

Return JSON:
{
  "summary": "...",
  "sections": [{"heading":"...","body":"..."}],
  "copyBlocks": [{"label":"...","content":"draft text to copy"}],
  "schemaSnippet": "JSON-LD string or null",
  "llmsTxtSnippet": "string or null",
  "steps": [{"order":1,"title":"...","content":"..."}],
  "checklist": ["..."]
}

Rules:
- Use the same language as the opportunity title/rationale.
- Only include FAQ drafts if the opportunity is about Q&A/FAQ.
- Only include llms.txt if relevant to missing codes.
- schemaSnippet only if structured data is relevant.
- No fake citation metrics. JSON only.`;

  const { text, model } = await generateText(prompt);
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const raw = JSON.parse(cleaned) as unknown;
  const parsed = planSchema.safeParse(raw);
  if (!parsed.success) throw new Error("AI geo plan schema invalid");

  const p = parsed.data;
  return {
    opportunityId: item.id,
    title: item.title,
    page: item.page,
    summary: p.summary,
    sections: p.sections,
    copyBlocks: p.copyBlocks,
    schemaSnippet: p.schemaSnippet ?? null,
    llmsTxtSnippet: p.llmsTxtSnippet ?? null,
    steps: p.steps,
    checklist: p.checklist,
    source: "ai",
    model,
    warning: null,
  };
}

export async function generateGeoPlan(
  siteUrl: string,
  item: GeoOpportunity,
): Promise<GeoPlan> {
  if (!process.env.LLM_API_KEY?.trim()) {
    return heuristicPlan(siteUrl, item);
  }
  try {
    return await aiPlan(siteUrl, item);
  } catch (err) {
    const message = err instanceof Error ? err.message : "LLM failed";
    const plan = heuristicPlan(siteUrl, item);
    plan.warning = `Plan LLM failed (${message}); using opportunity-derived fallback.`;
    return plan;
  }
}
