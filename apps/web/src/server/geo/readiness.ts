export type GeoPageSignals = {
  url: string;
  title: string | null;
  description: string | null;
  h1: string[];
  hasFaqHeading: boolean;
  hasDefinitionCue: boolean;
  hasHowToCue: boolean;
  hasTable: boolean;
  hasList: boolean;
  hasFaqSchema: boolean;
  hasHowToSchema: boolean;
  hasArticleSchema: boolean;
  hasOrgSchema: boolean;
  hasProductSchema: boolean;
  hasAuthor: boolean;
  hasDateModified: boolean;
  wordCountApprox: number;
};

export type GeoSiteAccess = {
  robotsUrl: string;
  robotsOk: boolean;
  aiBotPolicy: "allow" | "block" | "mixed" | "unknown";
  aiBotSummary: string;
  llmsTxtUrl: string;
  llmsTxtPresent: boolean;
  llmsTxtPreview: string | null;
};

export type GeoBreakdown = {
  answerability: number;
  structure: number;
  trust: number;
  ai_access: number;
  entity: number;
};

export type GeoOpportunity = {
  id: string;
  type: "geo_readiness" | "geo_asset";
  scope: "page" | "site";
  title: string;
  page: string;
  missing: string[];
  potential: number;
  rationale: string;
  actions: string[];
};

function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickMeta(html: string, names: string[]): string | null {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>|<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["'][^>]*>`,
      "i",
    );
    const m = html.match(re);
    const value = m?.[1] ?? m?.[2];
    if (value) return decodeEntities(value);
  }
  return null;
}

function pickAll(html: string, tag: string, limit = 12): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < limit) {
    const text = decodeEntities(m[1].replace(/<[^>]+>/g, " "));
    if (text && text.length >= 2 && text.length <= 160) out.push(text);
  }
  return [...new Set(out)];
}

function stripScripts(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
}

export function extractGeoPageSignals(url: string, html: string): GeoPageSignals {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]) : null;
  const description = pickMeta(html, ["description", "og:description"]);
  const h1 = pickAll(html, "h1", 5);
  const headings = [...h1, ...pickAll(html, "h2", 20), ...pickAll(html, "h3", 20)];
  const headingBlob = headings.join(" ");

  const hasFaqHeading = /faq|frequently asked|常见问题|问与答/i.test(headingBlob);
  const hasDefinitionCue =
    /什么是|是什么|what is|overview|简介|定义|about\b/i.test(headingBlob) ||
    /什么是|是什么|what is/i.test(title ?? "");
  const hasHowToCue = /如何|怎么|how to|步骤|getting started|快速开始|教程/i.test(
    headingBlob,
  );
  const hasTable = /<table[\s>]/i.test(html);
  const hasList = /<(ul|ol)[\s>]/i.test(html);

  const ldBlocks = [
    ...html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ].map((m) => m[1]);
  const ld = ldBlocks.join("\n").toLowerCase();

  const hasFaqSchema = /faqpage|"@type"\s*:\s*"faqpage"/i.test(ld);
  const hasHowToSchema = /howto|"@type"\s*:\s*"howto"/i.test(ld);
  const hasArticleSchema = /"@type"\s*:\s*"(article|blogposting|webpage)"/i.test(ld);
  const hasOrgSchema = /"@type"\s*:\s*"organization"/i.test(ld);
  const hasProductSchema =
    /"@type"\s*:\s*"(product|softwareapplication)"/i.test(ld);

  const hasAuthor =
    /rel=["']author["']|itemprop=["']author["']|"author"\s*:/i.test(html) ||
    Boolean(pickMeta(html, ["author"]));
  const hasDateModified =
    /property=["']article:modified_time["']|itemprop=["']dateModified["']|"dateModified"\s*:/i.test(
      html,
    ) || Boolean(pickMeta(html, ["article:modified_time", "og:updated_time"]));

  const text = decodeEntities(stripScripts(html).replace(/<[^>]+>/g, " "));
  const wordCountApprox = text.split(/\s+/).filter(Boolean).length;

  return {
    url,
    title,
    description,
    h1,
    hasFaqHeading,
    hasDefinitionCue,
    hasHowToCue,
    hasTable,
    hasList,
    hasFaqSchema,
    hasHowToSchema,
    hasArticleSchema,
    hasOrgSchema,
    hasProductSchema,
    hasAuthor,
    hasDateModified,
    wordCountApprox,
  };
}

const AI_BOTS = [
  "GPTBot",
  "ChatGPT-User",
  "Google-Extended",
  "PerplexityBot",
  "ClaudeBot",
  "anthropic-ai",
  "Bytespider",
];

export function parseRobotsAiPolicy(robotsText: string): {
  policy: GeoSiteAccess["aiBotPolicy"];
  summary: string;
} {
  const lines = robotsText.split(/\r?\n/);
  let currentAgents: string[] = [];
  const agentRules = new Map<
    string,
    { disallowAll: boolean; allowSome: boolean }
  >();

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const ua = line.match(/^user-agent:\s*(.+)$/i);
    if (ua) {
      currentAgents = [ua[1].trim()];
      continue;
    }
    const dis = line.match(/^disallow:\s*(.*)$/i);
    if (dis && currentAgents.length) {
      const path = dis[1].trim();
      for (const agent of currentAgents) {
        const prev = agentRules.get(agent) ?? {
          disallowAll: false,
          allowSome: false,
        };
        if (path === "/" || path === "/*") prev.disallowAll = true;
        agentRules.set(agent, prev);
      }
      continue;
    }
    const allow = line.match(/^allow:\s*(.+)$/i);
    if (allow && currentAgents.length) {
      for (const agent of currentAgents) {
        const prev = agentRules.get(agent) ?? {
          disallowAll: false,
          allowSome: false,
        };
        prev.allowSome = true;
        agentRules.set(agent, prev);
      }
    }
  }

  const relevant = AI_BOTS.map((bot) => {
    const rule = agentRules.get(bot) ?? agentRules.get("*");
    if (!rule) return { bot, status: "default-allow" as const };
    if (rule.disallowAll && !rule.allowSome)
      return { bot, status: "blocked" as const };
    if (rule.disallowAll && rule.allowSome)
      return { bot, status: "partial" as const };
    return { bot, status: "allowed" as const };
  });

  const blocked = relevant.filter((r) => r.status === "blocked").map((r) => r.bot);
  const allowed = relevant.filter(
    (r) => r.status === "allowed" || r.status === "default-allow",
  );
  const partial = relevant.filter((r) => r.status === "partial");

  let policy: GeoSiteAccess["aiBotPolicy"] = "allow";
  if (blocked.length >= 3) policy = "block";
  else if (blocked.length && allowed.length) policy = "mixed";
  else if (blocked.length) policy = "mixed";
  else policy = "allow";

  const summaryParts: string[] = [];
  if (blocked.length) summaryParts.push(`拦截：${blocked.join(", ")}`);
  if (partial.length) {
    summaryParts.push(`部分限制：${partial.map((p) => p.bot).join(", ")}`);
  }
  if (!blocked.length && !partial.length) {
    summaryParts.push("主要 AI bot 未见全站 Disallow（按 * 或缺省视为可抓）");
  }

  return { policy, summary: summaryParts.join("；") };
}

export function scoreGeoBreakdown(
  page: GeoPageSignals,
  access: GeoSiteAccess,
): GeoBreakdown {
  let answerability = 35;
  if (page.hasDefinitionCue) answerability += 25;
  if (page.description && page.description.length >= 40) answerability += 10;
  if (page.h1.length === 1) answerability += 10;
  if (page.wordCountApprox >= 400) answerability += 10;
  if (page.hasHowToCue) answerability += 10;

  let structure = 25;
  if (page.hasFaqHeading) structure += 20;
  if (page.hasFaqSchema) structure += 20;
  if (page.hasList) structure += 10;
  if (page.hasTable) structure += 15;
  if (page.hasHowToSchema) structure += 10;

  let trust = 30;
  if (page.hasAuthor) trust += 20;
  if (page.hasDateModified) trust += 25;
  if (page.hasArticleSchema) trust += 15;
  if (page.wordCountApprox >= 800) trust += 10;

  let ai_access = 40;
  if (access.robotsOk) ai_access += 10;
  if (access.aiBotPolicy === "allow") ai_access += 30;
  else if (access.aiBotPolicy === "mixed") ai_access += 10;
  else if (access.aiBotPolicy === "block") ai_access -= 20;
  if (access.llmsTxtPresent) ai_access += 20;

  let entity = 30;
  if (page.hasOrgSchema) entity += 30;
  if (page.hasProductSchema) entity += 25;
  if (page.title) entity += 10;
  if (page.hasDefinitionCue) entity += 5;

  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  return {
    answerability: clamp(answerability),
    structure: clamp(structure),
    trust: clamp(trust),
    ai_access: clamp(ai_access),
    entity: clamp(entity),
  };
}

export function overallGeoScore(breakdown: GeoBreakdown): number {
  const weights = {
    answerability: 0.28,
    structure: 0.24,
    trust: 0.18,
    ai_access: 0.15,
    entity: 0.15,
  };
  const sum =
    breakdown.answerability * weights.answerability +
    breakdown.structure * weights.structure +
    breakdown.trust * weights.trust +
    breakdown.ai_access * weights.ai_access +
    breakdown.entity * weights.entity;
  return Math.round(sum);
}

export function buildGeoOpportunities(
  page: GeoPageSignals,
  access: GeoSiteAccess,
  breakdown: GeoBreakdown,
  opts?: { pagePath?: string },
): GeoOpportunity[] {
  const path = (() => {
    if (opts?.pagePath?.trim()) return opts.pagePath;
    try {
      return new URL(page.url).pathname || "/";
    } catch {
      return "/";
    }
  })();

  const items: GeoOpportunity[] = [];

  if (!page.hasDefinitionCue || breakdown.answerability < 70) {
    items.push({
      id: `def::${path}`,
      type: "geo_readiness",
      scope: "page",
      title: "缺少可摘取的定义 / 直接答案段",
      page: path,
      missing: ["definition_block"],
      potential: 5,
      rationale:
        "生成式引擎偏好首屏就能回答「是什么 / 适不适合」的短答案块。当前页面缺少清晰定义线索。",
      actions: ["增加 2–4 句首段直接答案", "H1 下立即给出定义", "避免首屏全是营销口号"],
    });
  }

  if (!page.hasFaqHeading && !page.hasFaqSchema) {
    items.push({
      id: `faq::${path}`,
      type: "geo_readiness",
      scope: "page",
      title: "缺少 FAQ 结构与 FAQPage Schema",
      page: path,
      missing: ["faq", "faq_schema"],
      potential: 5,
      rationale: "FAQ 是最易被 AI 引用的问答单元；缺 FAQ 会显著降低 answerability。",
      actions: ["增加 3–6 个真实用户问题", "答案简洁可独立引用", "添加 FAQPage JSON-LD"],
    });
  } else if (page.hasFaqHeading && !page.hasFaqSchema) {
    items.push({
      id: `faq-schema::${path}`,
      type: "geo_readiness",
      scope: "page",
      title: "有 FAQ 文案但缺少 FAQPage 结构化数据",
      page: path,
      missing: ["faq_schema"],
      potential: 4,
      rationale: "可见 FAQ 有助于人类阅读，Schema 能提高机器抽取稳定性。",
      actions: ["为现有 FAQ 补 FAQPage JSON-LD", "核对 question/acceptedAnswer 字段"],
    });
  }

  if (!page.hasOrgSchema && !page.hasProductSchema) {
    items.push({
      id: `entity::${path}`,
      type: "geo_readiness",
      scope: "page",
      title: "品牌 / 产品实体 Schema 不足",
      page: path,
      missing: ["organization_schema", "product_schema"],
      potential: 4,
      rationale: "实体不清时，AI 更难把页面与品牌绑定并作为推荐来源。",
      actions: ["添加 Organization", "产品页补 SoftwareApplication/Product", "统一品牌命名"],
    });
  }

  if (!page.hasAuthor || !page.hasDateModified) {
    const missing = [
      ...(!page.hasAuthor ? ["author"] : []),
      ...(!page.hasDateModified ? ["dateModified"] : []),
    ];
    items.push({
      id: `trust::${path}`,
      type: "geo_readiness",
      scope: "page",
      title: "可引用信任信号不足（作者 / 更新日期）",
      page: path,
      missing,
      potential: 3,
      rationale: "作者与更新日期是「可验证」信号，有助于进入引用池。",
      actions: ["展示作者或编辑信息", "暴露 dateModified（页面 + Schema）"],
    });
  }

  if (!access.llmsTxtPresent) {
    items.push({
      id: "llms-txt",
      type: "geo_asset",
      scope: "site",
      title: "站点缺少 llms.txt",
      page: "/llms.txt",
      missing: ["llms_txt"],
      potential: 3,
      rationale: "llms.txt 可向 AI 爬虫声明站点要点与推荐入口，属于低成本 GEO 资产。",
      actions: ["在站点根路径提供 /llms.txt", "列出核心产品页与文档入口"],
    });
  }

  if (access.aiBotPolicy === "block") {
    items.push({
      id: "ai-bots-blocked",
      type: "geo_readiness",
      scope: "site",
      title: "robots.txt 可能拦截主要 AI bot",
      page: "/robots.txt",
      missing: ["ai_bot_access"],
      potential: 5,
      rationale: access.aiBotSummary,
      actions: ["复查 GPTBot / PerplexityBot 等规则", "确认是否有意屏蔽", "按需放行关键路径"],
    });
  }

  if (!page.hasTable && page.hasDefinitionCue === false) {
    items.push({
      id: `compare::${path}`,
      type: "geo_asset",
      scope: "page",
      title: "缺少对比表 / 要点列表等可引用资产",
      page: path,
      missing: ["comparison_table", "key_points"],
      potential: 3,
      rationale: "对比表与要点列表容易被生成式回答整段摘取。",
      actions: ["增加功能对比表", "用短列表提炼关键卖点"],
    });
  }

  return items
    .sort((a, b) => b.potential - a.potential)
    .slice(0, 12);
}
