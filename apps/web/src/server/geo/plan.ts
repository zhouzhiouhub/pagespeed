import { z } from "zod";
import { applyProxyDispatcher } from "@/server/http/proxy-bootstrap";
import { generateText } from "@/server/llm/gemini";
import type { GeoOpportunity } from "@/server/geo/readiness";

applyProxyDispatcher();

export type GeoPlan = {
  opportunityId: string;
  title: string;
  page: string;
  summary: string;
  definitionBlock: string;
  faq: Array<{ question: string; answer: string }>;
  schemaSnippet: string;
  llmsTxtSnippet: string | null;
  steps: Array<{ order: number; title: string; content: string }>;
  checklist: string[];
  source: "ai" | "heuristic";
  model: string | null;
  warning: string | null;
};

const planSchema = z.object({
  summary: z.string().min(1),
  definitionBlock: z.string().min(1),
  faq: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .min(2)
    .max(8),
  schemaSnippet: z.string().min(1),
  llmsTxtSnippet: z.string().nullable().optional(),
  steps: z
    .array(
      z.object({
        order: z.number(),
        title: z.string(),
        content: z.string(),
      }),
    )
    .min(3)
    .max(10),
  checklist: z.array(z.string()).min(2).max(10),
});

function heuristicPlan(siteUrl: string, item: GeoOpportunity): GeoPlan {
  const host = (() => {
    try {
      return new URL(siteUrl).hostname.replace(/^www\./, "");
    } catch {
      return siteUrl;
    }
  })();
  const brand = host.split(".")[0] ?? host;

  const needsLlms = item.missing.includes("llms_txt");
  const faq = [
    {
      question: `${brand} 是什么？`,
      answer: `${brand} 是面向该需求的产品/服务。一句话：帮助用户更快完成核心任务并降低试错成本。`,
    },
    {
      question: `${brand} 适合谁？`,
      answer: "适合有明确场景、希望快速验证效果的个人或团队。",
    },
    {
      question: `如何开始使用 ${brand}？`,
      answer: "明确目标场景 → 完成基础配置 → 用一个真实任务验证效果。",
    },
  ];

  const schemaSnippet = `{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "${faq[0].question}",
      "acceptedAnswer": { "@type": "Answer", "text": "${faq[0].answer}" }
    }
  ]
}`;

  return {
    opportunityId: item.id,
    title: item.title,
    page: item.page,
    summary: `针对「${item.title}」提升页面 ${item.page} 的 GEO Readiness：补可摘取答案、FAQ/Schema，并核对 AI 可访问性。`,
    definitionBlock: `${brand} 是什么：面向目标场景的核心解决方案。价值：更快完成任务、降低集成与试错成本。下一步：按页面步骤完成首次配置并验证。`,
    faq,
    schemaSnippet,
    llmsTxtSnippet: needsLlms
      ? `# ${brand}\n> ${brand} product overview for AI systems\n\n## Docs\n- ${siteUrl}\n- ${siteUrl.replace(/\/$/, "")}/docs\n`
      : null,
    steps: [
      {
        order: 1,
        title: "写入首段直接答案",
        content: "在 H1 下用 2–4 句回答「是什么 / 适不适合 / 核心价值」，避免纯口号。",
      },
      {
        order: 2,
        title: "补 FAQ",
        content: "至少 3 个真实问题，答案可独立引用；与 Schema 字段一一对应。",
      },
      {
        order: 3,
        title: "加结构化数据",
        content: "优先 FAQPage；再视情况补 Organization / SoftwareApplication。",
      },
      {
        order: 4,
        title: "核对 AI 访问与 llms.txt",
        content: "检查 robots 对 GPTBot 等策略；缺失则添加 /llms.txt 指向核心入口。",
      },
    ],
    checklist: [
      "首屏有可摘取定义段",
      "FAQ ≥ 3 且含 FAQPage",
      "作者或 dateModified 可见",
      "实体 Schema（品牌/产品）",
      "AI bot 策略明确、llms.txt 可选落地",
    ],
    source: "heuristic",
    model: null,
    warning: `基于规则模板生成（站点 ${siteUrl}）。Gemini 可用时可生成更贴合页面的文案。`,
  };
}

async function aiPlan(siteUrl: string, item: GeoOpportunity): Promise<GeoPlan> {
  const prompt = `你是 Website Growth 的 GEO Agent。为 GEO readiness 机会生成可执行方案（可复制文案）。
站点: ${siteUrl}
机会: ${JSON.stringify(item)}

输出单个 JSON:
summary, definitionBlock, faq([{question,answer}]), schemaSnippet(JSON-LD字符串),
llmsTxtSnippet(可null), steps([{order,title,content}]), checklist(数组)

要求:
- 中文（除非站点明显英文）
- 强调可被生成式引擎摘取/引用
- schemaSnippet 必须是合法 JSON-LD 文本
- 禁止编造「已被 ChatGPT 引用」之类实测结论
- 只输出 JSON`;

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
    definitionBlock: p.definitionBlock,
    faq: p.faq,
    schemaSnippet: p.schemaSnippet,
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
    const locationBlocked = /location is not supported/i.test(message);
    plan.warning = locationBlocked
      ? `Gemini 地区不可用，已用规则模板。可切换海外代理后重试。原文：${message}`
      : `AI 生成失败（${message}），已用规则模板生成 GEO 方案。`;
    return plan;
  }
}
