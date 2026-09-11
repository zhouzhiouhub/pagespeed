import { z } from "zod";
import { applyProxyDispatcher } from "@/server/http/proxy-bootstrap";
import { generateText, safeParseJsonArray } from "@/server/llm/gemini";
import type { KeywordOpportunity } from "@/server/keywords/opportunities";

applyProxyDispatcher();

export type ActionPlanStep = {
  order: number;
  kind: string;
  title: string;
  content: string;
};

export type ActionPlan = {
  query: string;
  page: string;
  summary: string;
  estimatedLift: string;
  titleOptions: string[];
  metaDescription: string;
  definitionBlock: string;
  faq: Array<{ question: string; answer: string }>;
  outline: string[];
  internalLinks: string[];
  schemaHints: string[];
  steps: ActionPlanStep[];
  source: "ai" | "heuristic";
  model: string | null;
  warning: string | null;
};

const planSchema = z.object({
  summary: z.string().min(1),
  estimatedLift: z.string().min(1),
  titleOptions: z.array(z.string()).min(1).max(5),
  metaDescription: z.string().min(1),
  definitionBlock: z.string().min(1),
  faq: z
    .array(
      z.object({
        question: z.string(),
        answer: z.string(),
      }),
    )
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

function heuristicPlan(
  siteUrl: string,
  item: KeywordOpportunity,
): ActionPlan {
  const pos = item.position ?? 15;
  const lift = `#${pos} → #${Math.max(3, Math.round(pos - 8))}~${Math.max(5, Math.round(pos - 4))}`;
  return {
    query: item.query,
    page: item.page,
    summary: `围绕「${item.query}」优化落地页 ${item.page}：先对齐搜索意图，再补答案段与 FAQ，最后用内链与结构化数据增强可发现性。`,
    estimatedLift: lift,
    titleOptions: [
      `${item.query}：完整指南与实践建议`,
      `${item.query}是什么？功能、场景与选型`,
      `如何做好 ${item.query}（步骤与清单）`,
    ],
    metaDescription: `了解 ${item.query} 的核心要点、适用场景与落地步骤。本文给出可执行清单，帮助你更快决策与实施。`,
    definitionBlock: `${item.query} 是指面向该需求的核心解决方案/能力。一句话：它帮助用户在相关场景下更快完成目标，并降低试错成本。`,
    faq: [
      {
        question: `${item.query} 适合谁？`,
        answer: `适合有明确需求、希望快速验证效果的个人或团队。若你的场景与页面核心能力匹配，可优先试用。`,
      },
      {
        question: `${item.query} 和常见替代方案有何区别？`,
        answer: `差异通常在上手成本、功能深度与集成方式。建议按你的核心场景对比 2–3 个关键能力后再决定。`,
      },
      {
        question: `如何开始使用 ${item.query}？`,
        answer: `先明确目标场景，再按页面提供的步骤完成基础配置，最后用一个真实任务验证效果。`,
      },
    ],
    outline: [
      `什么是 ${item.query}`,
      "核心能力与适用场景",
      "快速开始步骤",
      "常见问题 FAQ",
      "相关资源与下一步",
    ],
    internalLinks: [
      "从首页/产品页链到本落地页，锚文本包含目标词",
      "从相关博客/文档回链，补充语义关联",
      "在本页底部推荐 2–3 个相关功能页",
    ],
    schemaHints: [
      "添加 FAQPage JSON-LD（对上方 FAQ）",
      "补充 WebPage/Article 的 dateModified",
      "若有品牌实体，补充 Organization/SoftwareApplication",
    ],
    steps: [
      {
        order: 1,
        kind: "edit_title",
        title: "改写 Title / H1",
        content: `把主关键词「${item.query}」放入 Title 前半与唯一 H1，避免堆砌。`,
      },
      {
        order: 2,
        kind: "add_definition",
        title: "增加首段直接答案",
        content: "在首屏用 2–4 句给出定义与价值，便于搜索与 AI 引用。",
      },
      {
        order: 3,
        kind: "add_faq",
        title: "补充 FAQ",
        content: "至少 3 个用户真实问题，问答简洁可引用。",
      },
      {
        order: 4,
        kind: "add_internal_link",
        title: "布置内链",
        content: "从相关高权页引入，并在本页链出 complementary 页面。",
      },
      {
        order: 5,
        kind: "add_schema",
        title: "加结构化数据",
        content: "优先 FAQPage，再视情况补产品/组织实体。",
      },
    ],
    source: "heuristic",
    model: null,
    warning: `基于规则模板生成（站点 ${siteUrl}）。若 Gemini 可用，可刷新为更贴合页面的 AI 方案。`,
  };
}

async function aiPlan(siteUrl: string, item: KeywordOpportunity): Promise<ActionPlan> {
  const prompt = `你是 Website Growth Agent 的执行策划。根据关键词机会，输出可落地的优化方案 JSON（不要 markdown）。
站点: ${siteUrl}
机会: ${JSON.stringify(item)}

输出单个 JSON 对象，字段:
summary, estimatedLift, titleOptions(数组), metaDescription, definitionBlock,
faq([{question,answer}]), outline(H2数组), internalLinks(数组), schemaHints(数组),
steps([{order,kind,title,content}])

要求:
- 中文
- 可执行、具体到字段/模块
- kind 可用: edit_title, add_definition, add_faq, add_section, add_internal_link, add_schema
- 禁止编造精确流量数字；排名提升用区间表述`;

  const { text, model } = await generateText(prompt);
  // generateText may return object or we parse as object
  let raw: unknown;
  try {
    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    raw = JSON.parse(cleaned);
  } catch {
    // sometimes model wraps in array
    const arr = safeParseJsonArray<unknown>(text);
    raw = arr[0];
  }

  const parsed = planSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("AI action plan schema invalid");
  }

  const p = parsed.data;
  return {
    query: item.query,
    page: item.page,
    summary: p.summary,
    estimatedLift: p.estimatedLift,
    titleOptions: p.titleOptions,
    metaDescription: p.metaDescription,
    definitionBlock: p.definitionBlock,
    faq: p.faq,
    outline: p.outline,
    internalLinks: p.internalLinks,
    schemaHints: p.schemaHints,
    steps: p.steps,
    source: "ai",
    model,
    warning: null,
  };
}

export async function generateKeywordActionPlan(
  siteUrl: string,
  item: KeywordOpportunity,
): Promise<ActionPlan> {
  if (!process.env.LLM_API_KEY?.trim()) {
    return heuristicPlan(siteUrl, item);
  }
  try {
    return await aiPlan(siteUrl, item);
  } catch (err) {
    const message = err instanceof Error ? err.message : "LLM failed";
    const plan = heuristicPlan(siteUrl, item);
    const locationBlocked = /location is not supported/i.test(message);
    plan.warning = locationBlocked
      ? `Gemini 地区不可用，已用规则模板生成方案。可切换海外代理节点后重试。原文：${message}`
      : `AI 生成失败（${message}），已用规则模板生成可执行方案。`;
    return plan;
  }
}
