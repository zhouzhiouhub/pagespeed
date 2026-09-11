import { z } from "zod";
import type { PageSignals } from "@/server/keywords/extract";
import { generateText, safeParseJsonArray } from "@/server/llm/gemini";

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
): KeywordOpportunity[] {
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
    `${brand} 下载`,
    `${brand} 替代`,
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
      intent: /如何|什么|怎么|how|what|vs|对比|替代/i.test(query)
        ? "informational"
        : "commercial",
      rationale: `从页面 Title/H1/H2 提取的候选词（站点：${host}）。未连接 GSC，排名与趋势为启发式占位，仅用于机会排期；接入 Search Console 后会替换为真实查询数据。`,
      actions: ["优化 Title/H1", "补充 FAQ / 定义段", "加强相关内链", "检查搜索意图覆盖"],
      source: "heuristic" as const,
    };
  });
}

async function aiOpportunities(
  siteUrl: string,
  signals: PageSignals,
): Promise<KeywordOpportunity[]> {
  const prompt = `你是 SEO Keyword Agent。根据站点页面信号，产出「值得抢」的关键词机会（不是词库堆砌）。
站点: ${siteUrl}
页面信号 JSON:
${JSON.stringify(signals, null, 2)}

要求:
1. 输出 JSON 数组，每项字段: query, position(8-25或null), potential(1-5整数), page(路径), trend7d(负数=排名上升, 可为null), intent, rationale, actions(字符串数组)
2. 优先: 产品/品类词、问题型长尾、与现有落地页接近的词
3. 不要编造离谱搜索量数字; position/trend 若无真实 GSC 数据，给合理的「待验证」估计并在 rationale 说明
4. 8-12 条，中文或英文随站点语言
5. 只输出 JSON`;

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
): Promise<{
  items: KeywordOpportunity[];
  source: "ai" | "heuristic";
  model: string | null;
  warning: string | null;
}> {
  const hasLlm = Boolean(process.env.LLM_API_KEY?.trim());
  if (hasLlm) {
    try {
      const items = await aiOpportunities(siteUrl, signals);
      return {
        items,
        source: "ai",
        model: process.env.LLM_MODEL?.trim() || "gemini-2.5-flash",
        warning: "尚未连接 Google Search Console，排名/趋势为 AI 估计，接入 GSC 后替换为真实查询数据。",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "LLM failed";
      const items = heuristicOpportunities(siteUrl, signals);
      return {
        items,
        source: "heuristic",
        model: null,
        warning: `AI 生成失败（${message}），已降级为页面启发式候选。连接 GSC 后可显示真实排名机会。`,
      };
    }
  }

  return {
    items: heuristicOpportunities(siteUrl, signals),
    source: "heuristic",
    model: null,
    warning:
      "未配置 LLM_API_KEY，且尚未连接 GSC。当前为页面标题/标题层级启发式候选。",
  };
}
