export type GeoPageKind =
  | "home_portfolio"
  | "product"
  | "article"
  | "docs"
  | "landing";

export type GeoPageSignals = {
  url: string;
  title: string | null;
  description: string | null;
  h1: string[];
  pageKind: GeoPageKind;
  pageKindReason: string;
  hasFaqHeading: boolean;
  hasDefinitionCue: boolean;
  hasPersonCue: boolean;
  hasHowToCue: boolean;
  hasTable: boolean;
  hasList: boolean;
  hasFaqSchema: boolean;
  hasHowToSchema: boolean;
  hasArticleSchema: boolean;
  hasOrgSchema: boolean;
  hasProductSchema: boolean;
  hasPersonSchema: boolean;
  hasAuthor: boolean;
  hasDateModified: boolean;
  wordCountApprox: number;
};

export type GeoExpectations = {
  needsFaq: boolean;
  needsDefinition: boolean;
  needsHowTo: boolean;
  needsComparison: boolean;
  needsAuthorDate: boolean;
  needsProductSchema: boolean;
  needsOrgOrPerson: boolean;
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
  const h2 = pickAll(html, "h2", 20);
  const h3 = pickAll(html, "h3", 20);
  const navTexts = pickAll(html, "a", 40).filter((t) => t.length <= 24).slice(0, 24);
  const headings = [...h1, ...h2, ...h3];
  const headingBlob = headings.join(" ");
  const navBlob = navTexts.join(" ");

  const hasFaqHeading = /faq|frequently asked|常见问题|问与答/i.test(headingBlob);
  const hasDefinitionCue =
    /什么是|是什么|what is|overview|简介|定义|about\b/i.test(headingBlob) ||
    /什么是|是什么|what is/i.test(title ?? "");
  const hasPersonCue =
    /工程师|开发者|developer|portfolio|简历|resume|关于我|about me|全栈|移动端/i.test(
      `${title ?? ""} ${description ?? ""} ${headingBlob} ${navBlob}`,
    );
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
  const hasPersonSchema = /"@type"\s*:\s*"person"/i.test(ld);

  const hasAuthor =
    /rel=["']author["']|itemprop=["']author["']|"author"\s*:/i.test(html) ||
    Boolean(pickMeta(html, ["author"]));
  const hasDateModified =
    /property=["']article:modified_time["']|itemprop=["']dateModified["']|"dateModified"\s*:/i.test(
      html,
    ) || Boolean(pickMeta(html, ["article:modified_time", "og:updated_time"]));

  const text = decodeEntities(stripScripts(html).replace(/<[^>]+>/g, " "));
  const wordCountApprox = text.split(/\s+/).filter(Boolean).length;

  const { kind: pageKind, reason: pageKindReason } = classifyPageKind({
    url,
    title,
    description,
    headingBlob,
    navBlob,
    hasPersonCue,
    hasHowToCue,
    hasProductSchema,
    hasArticleSchema,
  });

  return {
    url,
    title,
    description,
    h1,
    pageKind,
    pageKindReason,
    hasFaqHeading,
    hasDefinitionCue,
    hasPersonCue,
    hasHowToCue,
    hasTable,
    hasList,
    hasFaqSchema,
    hasHowToSchema,
    hasArticleSchema,
    hasOrgSchema,
    hasProductSchema,
    hasPersonSchema,
    hasAuthor,
    hasDateModified,
    wordCountApprox,
  };
}

export function classifyPageKind(input: {
  url: string;
  title: string | null;
  description: string | null;
  headingBlob: string;
  navBlob: string;
  hasPersonCue: boolean;
  hasHowToCue: boolean;
  hasProductSchema: boolean;
  hasArticleSchema: boolean;
}): { kind: GeoPageKind; reason: string } {
  const path = (() => {
    try {
      return new URL(input.url).pathname.toLowerCase();
    } catch {
      return "/";
    }
  })();
  const blob = `${input.title ?? ""} ${input.description ?? ""} ${input.headingBlob} ${input.navBlob}`.toLowerCase();

  if (
    /\/(blog|posts|article|articles|news)\b/.test(path) ||
    input.hasArticleSchema ||
    /博客|blog\b|article\b/.test(blob)
  ) {
    return { kind: "article", reason: "路径/标题/Schema 显示为文章或博客内容" };
  }

  if (
    /\/(docs|doc|guide|tutorial|help|support)\b/.test(path) ||
    input.hasHowToCue ||
    /文档|教程|guide|docs|how to|快速开始/.test(blob)
  ) {
    return { kind: "docs", reason: "路径/标题显示为文档或教程页" };
  }

  if (
    input.hasProductSchema ||
    /\/(pricing|product|products|features|download|app)\b/.test(path) ||
    /定价|功能|下载|saas|product|pricing|features/.test(blob)
  ) {
    return { kind: "product", reason: "路径/文案/Schema 显示为产品或功能页" };
  }

  const portfolioNav =
    /关于|项目|简历|博客|联系|about|projects|resume|contact|portfolio/.test(
      input.navBlob,
    );
  if (
    input.hasPersonCue ||
    (portfolioNav && (path === "/" || path === "/en" || path === "/zh"))
  ) {
    return {
      kind: "home_portfolio",
      reason: "识别为个人站/作品集首页（角色介绍 + 关于/项目/简历导航）",
    };
  }

  return { kind: "landing", reason: "按落地页处理：先看可摘取答案与实体清晰度" };
}

export function expectationsFor(kind: GeoPageKind): GeoExpectations {
  switch (kind) {
    case "home_portfolio":
      return {
        needsFaq: false,
        needsDefinition: true, // who / what you do
        needsHowTo: false,
        needsComparison: false,
        needsAuthorDate: false,
        needsProductSchema: false,
        needsOrgOrPerson: true,
      };
    case "product":
      return {
        needsFaq: true,
        needsDefinition: true,
        needsHowTo: true,
        needsComparison: true,
        needsAuthorDate: false,
        needsProductSchema: true,
        needsOrgOrPerson: true,
      };
    case "docs":
      return {
        needsFaq: true,
        needsDefinition: true,
        needsHowTo: true,
        needsComparison: false,
        needsAuthorDate: true,
        needsProductSchema: false,
        needsOrgOrPerson: false,
      };
    case "article":
      return {
        needsFaq: false,
        needsDefinition: true,
        needsHowTo: false,
        needsComparison: false,
        needsAuthorDate: true,
        needsProductSchema: false,
        needsOrgOrPerson: false,
      };
    default:
      return {
        needsFaq: false,
        needsDefinition: true,
        needsHowTo: false,
        needsComparison: false,
        needsAuthorDate: false,
        needsProductSchema: false,
        needsOrgOrPerson: true,
      };
  }
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
  const expect = expectationsFor(page.pageKind);

  let answerability = 40;
  if (page.hasDefinitionCue || (page.pageKind === "home_portfolio" && page.hasPersonCue)) {
    answerability += 25;
  }
  if (page.description && page.description.length >= 40) answerability += 15;
  if (page.h1.length === 1) answerability += 10;
  if (page.wordCountApprox >= 300) answerability += 10;
  if (expect.needsHowTo && page.hasHowToCue) answerability += 10;

  let structure = 40;
  if (expect.needsFaq) {
    structure = 25;
    if (page.hasFaqHeading) structure += 20;
    if (page.hasFaqSchema) structure += 20;
  } else if (page.hasFaqHeading || page.hasFaqSchema) {
    structure += 10; // bonus only
  }
  if (page.hasList) structure += 15;
  if (expect.needsComparison && page.hasTable) structure += 15;
  else if (page.hasTable) structure += 8;
  if (expect.needsHowTo && page.hasHowToSchema) structure += 10;

  let trust = 40;
  if (expect.needsAuthorDate) {
    trust = 25;
    if (page.hasAuthor) trust += 25;
    if (page.hasDateModified) trust += 25;
    if (page.hasArticleSchema) trust += 15;
  } else {
    if (page.hasAuthor) trust += 10;
    if (page.hasDateModified) trust += 10;
    if (page.description) trust += 10;
  }
  if (page.wordCountApprox >= 500) trust += 10;

  let ai_access = 40;
  if (access.robotsOk) ai_access += 10;
  if (access.aiBotPolicy === "allow") ai_access += 30;
  else if (access.aiBotPolicy === "mixed") ai_access += 10;
  else if (access.aiBotPolicy === "block") ai_access -= 20;
  if (access.llmsTxtPresent) ai_access += 20;

  let entity = 35;
  if (page.pageKind === "home_portfolio") {
    if (page.hasPersonSchema) entity += 35;
    else if (page.hasOrgSchema) entity += 20;
    if (page.hasPersonCue) entity += 15;
    if (page.title) entity += 10;
  } else {
    if (page.hasOrgSchema) entity += 25;
    if (expect.needsProductSchema && page.hasProductSchema) entity += 30;
    else if (page.hasProductSchema) entity += 15;
    if (page.hasDefinitionCue) entity += 10;
    if (page.title) entity += 10;
  }

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

  const expect = expectationsFor(page.pageKind);
  const kindLabel =
    page.pageKind === "home_portfolio"
      ? "个人站/作品集"
      : page.pageKind === "product"
        ? "产品页"
        : page.pageKind === "docs"
          ? "文档/教程"
          : page.pageKind === "article"
            ? "文章/博客"
            : "落地页";

  const items: GeoOpportunity[] = [];

  // Always explain page classification first as context (soft, not a gap)
  // — skip; show in UI via pageKind instead.

  const hasAnswerBlock =
    page.hasDefinitionCue ||
    (page.pageKind === "home_portfolio" &&
      Boolean(page.description && page.description.length >= 40 && page.hasPersonCue));

  if (expect.needsDefinition && (!hasAnswerBlock || breakdown.answerability < 65)) {
    const isPortfolio = page.pageKind === "home_portfolio";
    items.push({
      id: `def::${path}`,
      type: "geo_readiness",
      scope: "page",
      title: isPortfolio
        ? "缺少可摘取的「我是谁 / 做什么」简介块"
        : "缺少可摘取的定义 / 直接答案段",
      page: path,
      missing: ["definition_block"],
      potential: 5,
      rationale: isPortfolio
        ? `页面类型判定为「${kindLabel}」（${page.pageKindReason}）。对作品集首页，GEO 更看重首屏可引用的人设与能力摘要，而不是 FAQ。`
        : `页面类型判定为「${kindLabel}」（${page.pageKindReason}）。该类型需要首屏直接回答核心问题，当前缺少清晰定义线索。`,
      actions: isPortfolio
        ? [
            "用 2–4 句写清角色、擅长领域与代表成果",
            "避免首屏只有职位口号、缺少可摘事实",
            "可链到关于/项目页并保持命名一致",
          ]
        : ["增加 2–4 句首段直接答案", "H1 下立即给出定义", "避免首屏全是营销口号"],
    });
  }

  if (expect.needsFaq) {
    if (!page.hasFaqHeading && !page.hasFaqSchema) {
      items.push({
        id: `faq::${path}`,
        type: "geo_readiness",
        scope: "page",
        title: "缺少 FAQ 结构与 FAQPage Schema",
        page: path,
        missing: ["faq", "faq_schema"],
        potential: 5,
        rationale: `页面类型为「${kindLabel}」，此类页面通常有高频疑问，FAQ 有助于被生成式引擎摘取。`,
        actions: [
          "增加 3–6 个真实用户问题",
          "答案简洁可独立引用",
          "添加 FAQPage JSON-LD",
        ],
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
        rationale: `已识别 FAQ 文案；「${kindLabel}」建议补 Schema 以提高机器抽取稳定性。`,
        actions: ["为现有 FAQ 补 FAQPage JSON-LD", "核对 question/acceptedAnswer 字段"],
      });
    }
  }

  if (expect.needsOrgOrPerson) {
    if (page.pageKind === "home_portfolio") {
      if (!page.hasPersonSchema && !page.hasOrgSchema) {
        items.push({
          id: `person::${path}`,
          type: "geo_readiness",
          scope: "page",
          title: "缺少 Person / 个人实体 Schema",
          page: path,
          missing: ["person_schema"],
          potential: 4,
          rationale: `「${kindLabel}」应以人物实体被引用。缺少 Person Schema 时，AI 更难把页面与个人品牌绑定。`,
          actions: [
            "添加 Person JSON-LD（name、jobTitle、url、sameAs）",
            "与首页简介中的姓名/角色保持一致",
          ],
        });
      }
    } else if (expect.needsProductSchema) {
      if (!page.hasOrgSchema && !page.hasProductSchema) {
        items.push({
          id: `entity::${path}`,
          type: "geo_readiness",
          scope: "page",
          title: "品牌 / 产品实体 Schema 不足",
          page: path,
          missing: ["organization_schema", "product_schema"],
          potential: 4,
          rationale: `「${kindLabel}」需要清晰产品/组织实体，便于进入推荐与引用池。`,
          actions: [
            "添加 Organization",
            "产品页补 SoftwareApplication/Product",
            "统一品牌命名",
          ],
        });
      } else if (expect.needsProductSchema && !page.hasProductSchema) {
        items.push({
          id: `product::${path}`,
          type: "geo_readiness",
          scope: "page",
          title: "缺少 Product / SoftwareApplication Schema",
          page: path,
          missing: ["product_schema"],
          potential: 4,
          rationale: `「${kindLabel}」已有组织信号但产品实体不足。`,
          actions: ["补充 Product 或 SoftwareApplication JSON-LD"],
        });
      }
    } else if (!page.hasOrgSchema && !page.hasPersonSchema) {
      items.push({
        id: `entity::${path}`,
        type: "geo_readiness",
        scope: "page",
        title: "实体 Schema 不足",
        page: path,
        missing: ["organization_schema"],
        potential: 3,
        rationale: `「${kindLabel}」建议至少有 Organization 或 Person 实体。`,
        actions: ["添加 Organization 或 Person JSON-LD"],
      });
    }
  }

  if (expect.needsAuthorDate && (!page.hasAuthor || !page.hasDateModified)) {
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
      potential: 4,
      rationale: `「${kindLabel}」依赖作者与更新日期提升可验证性。`,
      actions: ["展示作者或编辑信息", "暴露 dateModified（页面 + Schema）"],
    });
  }

  if (expect.needsHowTo && !page.hasHowToCue && !page.hasHowToSchema) {
    items.push({
      id: `howto::${path}`,
      type: "geo_readiness",
      scope: "page",
      title: "缺少步骤型 / HowTo 结构",
      page: path,
      missing: ["howto"],
      potential: 4,
      rationale: `「${kindLabel}」适合分步说明；当前未见 HowTo 线索。`,
      actions: ["用有序列表写清步骤", "必要时加 HowTo JSON-LD"],
    });
  }

  if (expect.needsComparison && !page.hasTable) {
    items.push({
      id: `compare::${path}`,
      type: "geo_asset",
      scope: "page",
      title: "缺少对比表等可引用资产",
      page: path,
      missing: ["comparison_table"],
      potential: 3,
      rationale: `「${kindLabel}」常见选型意图；对比表容易被生成式回答整段摘取。`,
      actions: ["增加功能/方案对比表", "用短列表提炼关键差异"],
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
      potential: page.pageKind === "home_portfolio" ? 2 : 3,
      rationale: "站点级资产：向 AI 爬虫声明核心入口（与当前页类型无关，属可选增强）。",
      actions: ["在站点根路径提供 /llms.txt", "列出核心页面与文档入口"],
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

  return items
    .sort((a, b) => b.potential - a.potential)
    .slice(0, 12);
}
