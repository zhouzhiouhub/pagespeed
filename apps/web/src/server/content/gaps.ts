import { z } from "zod";
import type { PageSignals } from "@/server/keywords/extract";
import { generateText, safeParseJsonArray } from "@/server/llm/gemini";
import { readGscStore } from "@/server/gsc/store";

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

function heuristicGaps(siteUrl: string, signals: PageSignals): ContentGap[] {
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
      .filter((t) => t.length >= 2 && t.length <= 32 && !noisy.test(t))
      .slice(0, 8),
  ]
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && !noisy.test(s));

  const uniqueTopics = [...new Set(topicSeeds)].slice(0, 6);

  const templates: Array<Omit<ContentGap, "id">> = [
    {
      title: `${brand} 使用指南 / Getting Started`,
      targetKeyword: `${brand} 教程`,
      potential: 5,
      suggestedPath: `/blog/${slugify(`${brand}-guide`)}`,
      intent: "informational",
      rationale: `首页有产品信号，但缺少面向「如何上手」的独立指南页。答案型长文可同时服务 SEO 与 GEO 引用。`,
      geoHint: "首段直接答案 + 分步清单 + FAQPage",
      source: "heuristic",
    },
    {
      title: `${brand} vs 常见替代方案`,
      targetKeyword: `${brand} 替代`,
      potential: 4,
      suggestedPath: `/blog/${slugify(`${brand}-vs-alternatives`)}`,
      intent: "commercial",
      rationale: `对比意图搜索常见且转化高；当前页面未覆盖清晰对比结构。`,
      geoHint: "用表格对比关键维度，便于 AI 摘录",
      source: "heuristic",
    },
    {
      title: `什么是 ${brand}？功能与适用场景`,
      targetKeyword: `${brand} 是什么`,
      potential: 4,
      suggestedPath: `/blog/${slugify(`what-is-${brand}`)}`,
      intent: "informational",
      rationale: `定义型查询适合首段直接答案结构；有利于搜索摘要与生成式引擎引用。`,
      geoHint: "定义段 2–4 句 + Entity/SoftwareApplication Schema",
      source: "heuristic",
    },
  ];

  const fromPage = uniqueTopics.map((topic, index) => {
    const path = `/blog/${slugify(topic)}`;
    const isQuestion = /如何|什么|怎么|why|how|what|\?|？/i.test(topic);
    return {
      title: isQuestion ? topic : `关于「${topic}」的完整说明`,
      targetKeyword: topic,
      potential: Math.max(2, 5 - Math.floor(index / 2)),
      suggestedPath: path,
      intent: isQuestion ? "informational" : "commercial",
      rationale: `从首页 H2/导航提取主题「${topic}」，未见独立内容页覆盖。建议写成答案型专页。`,
      geoHint: isQuestion
        ? "问题型：首段直接答 + FAQ 3+"
        : "主题型：定义 + 场景 + 步骤",
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
): Promise<ContentGap[]> {
  const prompt = `你是 Website Growth 的 Content Agent。根据站点首页信号，找出「该写但还没写」的内容缺口（不是改现有页）。
站点: ${siteUrl}
页面信号:
${JSON.stringify(signals, null, 2)}

输出 JSON 数组，每项字段:
title, targetKeyword, potential(1-5), suggestedPath(/blog/... 或 /docs/...), intent, rationale, geoHint(可null)

要求:
1. 6-10 条，优先答案型/指南/对比/FAQ 主题
2. suggestedPath 用英文 slug，合理且不重复
3. 说明为何是缺口（有主题信号但无专页）
4. geoHint 提示如何做成可被 AI 引用的结构
5. 中文或英文随站点语言；只输出 JSON`;

  const { text } = await generateText(prompt);
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
  return items.slice(0, 12);
}

export async function buildContentGaps(
  siteUrl: string,
  signals: PageSignals,
): Promise<{
  items: ContentGap[];
  source: "gsc" | "ai" | "heuristic";
  model: string | null;
  warning: string | null;
}> {
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
          title: `为「${r.query}」创建专页`,
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
          rationale: `GSC：查询「${r.query}」展示 ${r.impressions}、点击 ${r.clicks}，但落地偏首页/浅路径。适合拆成独立内容页承接意图。`,
          geoHint: "专页首段直接回答查询意图 + FAQ",
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
      const items = await aiGaps(siteUrl, signals);
      return {
        items,
        source: "ai",
        model: process.env.LLM_MODEL?.trim() || "gemini-3.6-flash",
        warning:
          "尚未用 GSC 校验内容缺口。当前为 AI 基于首页主题推断；接入并同步 GSC 后，会优先展示「有展现、无专页」的真实缺口。",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "LLM failed";
      const items = heuristicGaps(siteUrl, signals);
      const locationBlocked = /location is not supported/i.test(message);
      return {
        items,
        source: "heuristic",
        model: null,
        warning: locationBlocked
          ? "Gemini 地区不可用，已用规则模板生成内容缺口。可切换海外代理后重试。"
          : `AI 生成失败（${message}），已降级为启发式内容缺口。`,
      };
    }
  }

  return {
    items: heuristicGaps(siteUrl, signals),
    source: "heuristic",
    model: null,
    warning:
      "未配置 LLM_API_KEY。当前为首页标题层级/导航启发式内容缺口；配置 LLM 或连接 GSC 后更准。",
  };
}
