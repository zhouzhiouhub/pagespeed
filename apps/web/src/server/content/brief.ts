import { z } from "zod";
import { applyProxyDispatcher } from "@/server/http/proxy-bootstrap";
import { generateText } from "@/server/llm/gemini";
import type { ContentGap } from "@/server/content/gaps";

applyProxyDispatcher();

export type ContentBrief = {
  gapId: string;
  title: string;
  targetKeyword: string;
  suggestedPath: string;
  intent: string;
  summary: string;
  definitionBlock: string;
  outline: string[];
  faq: Array<{ question: string; answer: string }>;
  internalLinks: string[];
  schemaHints: string[];
  geoChecklist: string[];
  source: "ai" | "heuristic";
  model: string | null;
  warning: string | null;
};

const briefSchema = z.object({
  intent: z.string().min(1),
  summary: z.string().min(1),
  definitionBlock: z.string().min(1),
  outline: z.array(z.string()).min(3).max(12),
  faq: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .min(2)
    .max(8),
  internalLinks: z.array(z.string()).min(1).max(8),
  schemaHints: z.array(z.string()).min(1).max(6),
  geoChecklist: z.array(z.string()).min(2).max(8),
});

function heuristicBrief(siteUrl: string, gap: ContentGap): ContentBrief {
  const kw = gap.targetKeyword;
  return {
    gapId: gap.id,
    title: gap.title,
    targetKeyword: kw,
    suggestedPath: gap.suggestedPath,
    intent: gap.intent ?? "informational",
    summary: `为「${kw}」新建内容页 ${gap.suggestedPath}：用首段直接答案承接搜索意图，再用大纲与 FAQ 做成可引用结构。`,
    definitionBlock: `${kw} 是指用户在该主题下最关心的核心问题解答。一句话：帮助读者快速理解是什么、适不适合自己、下一步怎么做。`,
    outline: [
      `什么是 ${kw}`,
      "谁适合 / 适用场景",
      "核心要点与步骤",
      "常见误区",
      "FAQ",
      "相关资源与下一步",
    ],
    faq: [
      {
        question: `${kw} 适合谁？`,
        answer: "适合有明确需求、希望快速验证效果的个人或团队。",
      },
      {
        question: `开始 ${kw} 需要准备什么？`,
        answer: "先明确目标场景与成功标准，再按页面步骤完成基础配置并做一次真实任务验证。",
      },
      {
        question: `${kw} 和常见替代方案怎么选？`,
        answer: "按上手成本、功能深度、集成方式对比 2–3 个关键能力后再决定。",
      },
    ],
    internalLinks: [
      "从首页相关模块链到本页，锚文本含目标词",
      "从产品/功能页回链本指南",
      "本页底部推荐 2–3 个相关功能或文档页",
    ],
    schemaHints: [
      "FAQPage JSON-LD",
      "Article/WebPage + dateModified",
      "如有产品实体，补充 SoftwareApplication / Organization",
    ],
    geoChecklist: [
      "首屏 2–4 句直接答案（可被摘录）",
      "FAQ 至少 3 条，问答简洁",
      "关键事实可核对（版本/日期/来源）",
      gap.geoHint ?? "结构清晰：H2 分节 + 列表/表格",
    ],
    source: "heuristic",
    model: null,
    warning: `基于规则模板生成 Brief（站点 ${siteUrl}）。若 Gemini 可用，可重新生成更贴合站点的版本。`,
  };
}

async function aiBrief(siteUrl: string, gap: ContentGap): Promise<ContentBrief> {
  const prompt = `你是 Website Growth 的 Content Agent。为内容缺口生成可执行 Brief（不是全文草稿）。
站点: ${siteUrl}
缺口: ${JSON.stringify(gap)}

输出单个 JSON 对象，字段:
intent, summary, definitionBlock(首段直接答案), outline(H2数组),
faq([{question,answer}]), internalLinks(数组), schemaHints(数组), geoChecklist(数组)

要求:
- 中文（除非站点明显为英文）
- 面向新建页面 ${gap.suggestedPath}，目标词「${gap.targetKeyword}」
- 强调答案型/可引用结构（GEO）
- 禁止编造精确流量数字
- 只输出 JSON`;

  const { text, model } = await generateText(prompt);
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const raw = JSON.parse(cleaned) as unknown;
  const parsed = briefSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("AI content brief schema invalid");
  }

  const p = parsed.data;
  return {
    gapId: gap.id,
    title: gap.title,
    targetKeyword: gap.targetKeyword,
    suggestedPath: gap.suggestedPath,
    intent: p.intent,
    summary: p.summary,
    definitionBlock: p.definitionBlock,
    outline: p.outline,
    faq: p.faq,
    internalLinks: p.internalLinks,
    schemaHints: p.schemaHints,
    geoChecklist: p.geoChecklist,
    source: "ai",
    model,
    warning: null,
  };
}

export async function generateContentBrief(
  siteUrl: string,
  gap: ContentGap,
): Promise<ContentBrief> {
  if (!process.env.LLM_API_KEY?.trim()) {
    return heuristicBrief(siteUrl, gap);
  }
  try {
    return await aiBrief(siteUrl, gap);
  } catch (err) {
    const message = err instanceof Error ? err.message : "LLM failed";
    const brief = heuristicBrief(siteUrl, gap);
    const locationBlocked = /location is not supported/i.test(message);
    brief.warning = locationBlocked
      ? `Gemini 地区不可用，已用规则模板生成 Brief。可切换海外代理后重试。原文：${message}`
      : `AI 生成失败（${message}），已用规则模板生成 Brief。`;
    return brief;
  }
}
