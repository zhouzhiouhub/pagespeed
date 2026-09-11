import { z } from "zod";
import { generateText } from "@/server/llm/gemini";
import {
  runAgentTools,
  type AgentToolResult,
} from "@/server/agents/tools";

export type AnalyticsNarrative = {
  headline: string;
  summary: string;
  bullets: string[];
  risks: string[];
  nextActions: string[];
  source: "ai" | "heuristic";
  model: string | null;
  warning: string | null;
  tools: AgentToolResult[];
};

const schema = z.object({
  headline: z.string().min(1),
  summary: z.string().min(1),
  bullets: z.array(z.string()).min(2).max(8),
  risks: z.array(z.string()).min(0).max(5),
  nextActions: z.array(z.string()).min(1).max(6),
});

function heuristic(tools: AgentToolResult[]): AnalyticsNarrative {
  const ga = tools.find((t) => t.tool === "read_ga");
  const gsc = tools.find((t) => t.tool === "read_gsc");
  const audit = tools.find((t) => t.tool === "read_audit");

  const sessions = Number(ga?.data.sessions7d ?? 0);
  const users = Number(ga?.data.users7d ?? 0);
  const oppCount = Array.isArray(gsc?.data.topOpportunities)
    ? gsc!.data.topOpportunities.length
    : 0;
  const seo = (audit?.data.scores as Record<string, number> | undefined)?.seo;
  const geo = (audit?.data.scores as Record<string, number> | undefined)?.geo;

  const bullets: string[] = [];
  if (ga?.ok) {
    bullets.push(`近 7 天 GA4：${sessions} sessions / ${users} users`);
    const top = (ga.data.topPages as Array<{ path: string; sessions: number }>)?.[0];
    if (top) bullets.push(`流量最高页：${top.path}（${top.sessions} sessions）`);
  } else {
    bullets.push("GA4 尚未同步，暂用审计与 GSC 信号");
  }
  if (gsc?.ok) bullets.push(`GSC 关键词机会 ${oppCount} 条`);
  if (audit?.ok) {
    bullets.push(
      `最近审计 SEO ${seo ?? "—"} / GEO ${geo ?? "—"}，issues ${audit.data.issueCount ?? 0}`,
    );
  }

  return {
    headline:
      sessions > 0
        ? `近 7 天有 ${sessions} 次会话，优先守住高流量页并推进 GSC 抢位`
        : "先接通 GA4/GSC，再用审计机会驱动本周动作",
    summary:
      "综合 GA / GSC / 审计结果，给出本周增长叙事。未连接的数据源已降级说明。",
    bullets,
    risks: [
      ...(ga?.ok ? [] : ["缺少 GA4，无法判断流量与互动质量"]),
      ...(gsc?.ok ? [] : ["缺少 GSC，关键词抢位证据不足"]),
    ],
    nextActions: [
      ga?.ok ? "检查 top pages 的 GEO readiness 与内链" : "连接并同步 GA4",
      gsc?.ok ? "处理 Top GSC 机会的 Title/FAQ" : "连接并同步 GSC",
      "在 Dashboard 运行多页爬取刷新 SEO/GEO 分",
    ],
    source: "heuristic",
    model: null,
    warning: tools.filter((t) => !t.ok).map((t) => t.warning).filter(Boolean).join(" · ") || null,
    tools,
  };
}

export async function runAnalyticsAgent(
  siteUrl: string,
): Promise<AnalyticsNarrative> {
  const tools = await runAgentTools(siteUrl, [
    "read_ga",
    "read_gsc",
    "read_audit",
    "read_opportunities",
  ]);
  const base = heuristic(tools);

  if (!process.env.LLM_API_KEY?.trim()) return base;

  try {
    const prompt = `你是 Website Growth Analytics Agent。根据工具结果写一份简短增长叙事 JSON（不要 markdown）。
站点: ${siteUrl}
工具结果: ${JSON.stringify(
      tools.map((t) => ({ tool: t.tool, ok: t.ok, data: t.data, warning: t.warning })),
    )}

输出字段: headline, summary, bullets[], risks[], nextActions[]
要求：中文、具体、可执行；不要编造精确未给出的数字。`;

    const { text, model } = await generateText(prompt);
    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = schema.safeParse(JSON.parse(cleaned));
    if (!parsed.success) throw new Error("analytics schema invalid");
    return {
      ...parsed.data,
      source: "ai",
      model,
      warning: base.warning,
      tools,
    };
  } catch (err) {
    return {
      ...base,
      warning:
        (base.warning ? `${base.warning} · ` : "") +
        (err instanceof Error ? err.message : "LLM analytics failed"),
    };
  }
}
