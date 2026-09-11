import { z } from "zod";
import { generateText, safeParseJsonArray } from "@/server/llm/gemini";
import type { AdviceItemRecord } from "@/server/advice/store";
import {
  generateKeywordActionPlan,
  type ActionPlan,
} from "@/server/agents/action-plan";

const advicePlanSchema = z.object({
  summary: z.string().min(1),
  estimatedLift: z.string().min(1),
  titleOptions: z.array(z.string()).min(1).max(5),
  metaDescription: z.string().min(1),
  definitionBlock: z.string().min(1),
  faq: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .min(2)
    .max(6),
  outline: z.array(z.string()).min(3).max(10),
  internalLinks: z.array(z.string()).min(1).max(8),
  schemaHints: z.array(z.string()).min(1).max(6),
  steps: z
    .array(
      z.object({
        order: z.number(),
        kind: z.string(),
        title: z.string(),
        content: z.string(),
      }),
    )
    .min(3)
    .max(10),
});

function asQuery(item: AdviceItemRecord): string {
  const ev = item.evidence;
  if (typeof ev.query === "string" && ev.query) return ev.query;
  if (typeof ev.targetKeyword === "string" && ev.targetKeyword)
    return ev.targetKeyword;
  return item.title.slice(0, 48);
}

function asPage(item: AdviceItemRecord, siteUrl: string): string {
  const ev = item.evidence;
  if (typeof ev.page === "string" && ev.page) return ev.page;
  if (typeof ev.suggestedPath === "string" && ev.suggestedPath) {
    try {
      return new URL(ev.suggestedPath, siteUrl).href;
    } catch {
      return siteUrl;
    }
  }
  return siteUrl;
}

function heuristicAdvicePlan(
  siteUrl: string,
  item: AdviceItemRecord,
): ActionPlan {
  const query = asQuery(item);
  const page = asPage(item, siteUrl);
  return {
    query,
    page,
    summary: item.summary || `围绕「${item.title}」制定可执行优化方案。`,
    estimatedLift: "落地后可提升可发现性与转化路径清晰度（定性）",
    titleOptions: [
      `${query}：完整说明与行动清单`,
      `如何做好 ${query}`,
      `${query} 实践指南`,
    ],
    metaDescription: `${item.summary.slice(0, 120)}`,
    definitionBlock: `针对「${query}」：先用 2–4 句直接回答用户意图，再展开步骤与证据。`,
    faq: [
      {
        question: `为什么现在要处理「${item.title}」？`,
        answer: item.summary || "该机会对当前增长优先级较高。",
      },
      {
        question: "建议先做哪三步？",
        answer: (item.suggestedActions.slice(0, 3).join("；") ||
          "对齐意图、补答案块、加 FAQ/Schema。"),
      },
      {
        question: "如何验收？",
        answer: "检查页面是否覆盖答案块/FAQ/内链，并观察 GSC 展现与点击变化。",
      },
    ],
    outline: [
      `问题：${item.title}`,
      "直接答案",
      "执行步骤",
      "FAQ",
      "相关内链",
    ],
    internalLinks: item.suggestedActions.slice(0, 3).length
      ? item.suggestedActions.slice(0, 3)
      : ["从相关高流量页引入本页", "本页链出 complementary 内容"],
    schemaHints: [
      "FAQPage JSON-LD",
      "WebPage dateModified",
      "按页面类型补充实体 Schema",
    ],
    steps: (item.suggestedActions.length
      ? item.suggestedActions
      : ["改写标题与首段", "补充 FAQ", "加 Schema", "布置内链"]
    )
      .slice(0, 6)
      .map((content, index) => ({
        order: index + 1,
        kind: index === 0 ? "edit_title" : index === 1 ? "add_faq" : "add_section",
        title: `步骤 ${index + 1}`,
        content,
      })),
    source: "heuristic",
    model: null,
    warning: `基于建议卡「${item.title}」的规则方案（${siteUrl}）。`,
  };
}

async function aiAdvicePlan(
  siteUrl: string,
  item: AdviceItemRecord,
): Promise<ActionPlan> {
  const prompt = `你是 Website Growth Agent。根据今日增长建议卡，输出可落地 Action Plan JSON（不要 markdown）。
站点: ${siteUrl}
建议卡: ${JSON.stringify({
    id: item.id,
    type: item.type,
    title: item.title,
    summary: item.summary,
    evidence: item.evidence,
    suggestedActions: item.suggestedActions,
  })}

输出单个 JSON 对象，字段:
summary, estimatedLift, titleOptions, metaDescription, definitionBlock,
faq([{question,answer}]), outline, internalLinks, schemaHints,
steps([{order,kind,title,content}])
要求：中文、可执行；禁止编造精确流量数字。`;

  const { text, model } = await generateText(prompt);
  let raw: unknown;
  try {
    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    raw = JSON.parse(cleaned);
  } catch {
    raw = safeParseJsonArray<unknown>(text)[0];
  }
  const parsed = advicePlanSchema.safeParse(raw);
  if (!parsed.success) throw new Error("advice plan schema invalid");
  const p = parsed.data;
  return {
    query: asQuery(item),
    page: asPage(item, siteUrl),
    ...p,
    source: "ai",
    model,
    warning: null,
  };
}

export async function generateAdviceActionPlan(
  siteUrl: string,
  item: AdviceItemRecord,
): Promise<ActionPlan> {
  // Keyword-shaped cards can reuse keyword planner
  if (
    (item.type === "keyword" || item.type === "content_gap") &&
    typeof item.evidence.query === "string"
  ) {
    return generateKeywordActionPlan(siteUrl, {
      query: String(item.evidence.query),
      position:
        typeof item.evidence.position === "number"
          ? item.evidence.position
          : null,
      potential:
        typeof item.evidence.potential === "number"
          ? item.evidence.potential
          : item.score * 10,
      page: asPage(item, siteUrl),
      trend7d: null,
      intent: null,
      rationale: item.summary,
      actions: item.suggestedActions,
      source: "heuristic",
    });
  }

  if (!process.env.LLM_API_KEY?.trim()) {
    return heuristicAdvicePlan(siteUrl, item);
  }
  try {
    return await aiAdvicePlan(siteUrl, item);
  } catch (err) {
    const message = err instanceof Error ? err.message : "LLM failed";
    const plan = heuristicAdvicePlan(siteUrl, item);
    plan.warning = `AI 生成失败（${message}），已用规则模板。`;
    return plan;
  }
}
