import { fetchText } from "@/server/http/fetch";
import {
  buildGeoOpportunities,
  extractGeoPageSignals,
  overallGeoScore,
  parseRobotsAiPolicy,
  scoreGeoBreakdown,
  type GeoBreakdown,
  type GeoOpportunity,
  type GeoPageSignals,
  type GeoSiteAccess,
} from "@/server/geo/readiness";

export type GeoAnalysis = {
  url: string;
  fetchedUrl: string;
  generatedAt: string;
  score: number;
  breakdown: GeoBreakdown;
  access: GeoSiteAccess;
  page: {
    title: string | null;
    description: string | null;
    h1: string[];
    flags: {
      hasFaqHeading: boolean;
      hasDefinitionCue: boolean;
      hasFaqSchema: boolean;
      hasOrgSchema: boolean;
      hasProductSchema: boolean;
      hasAuthor: boolean;
      hasDateModified: boolean;
      hasTable: boolean;
    };
  };
  items: GeoOpportunity[];
  warning: string | null;
};

function originOf(siteUrl: string): string {
  return new URL(siteUrl).origin;
}

async function fetchSiteAccess(siteUrl: string): Promise<GeoSiteAccess> {
  const origin = originOf(siteUrl);
  const robotsUrl = `${origin}/robots.txt`;
  const llmsTxtUrl = `${origin}/llms.txt`;

  const [robots, llms] = await Promise.all([
    fetchText(robotsUrl, { timeoutMs: 12_000 }),
    fetchText(llmsTxtUrl, { timeoutMs: 12_000 }),
  ]);

  let aiBotPolicy: GeoSiteAccess["aiBotPolicy"] = "unknown";
  let aiBotSummary = "未能读取 robots.txt，AI bot 策略未知。";
  if (robots.ok) {
    const parsed = parseRobotsAiPolicy(robots.text);
    aiBotPolicy = parsed.policy;
    aiBotSummary = parsed.summary;
  }

  const llmsTxtPresent = llms.ok && llms.text.trim().length > 0;
  const llmsTxtPreview = llmsTxtPresent
    ? llms.text.trim().slice(0, 280)
    : null;

  return {
    robotsUrl,
    robotsOk: robots.ok,
    aiBotPolicy,
    aiBotSummary,
    llmsTxtUrl,
    llmsTxtPresent,
    llmsTxtPreview,
  };
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return "/";
  }
}

export async function analyzeGeo(siteUrl: string): Promise<GeoAnalysis> {
  const pageRes = await fetchText(siteUrl, { timeoutMs: 25_000 });
  if (!pageRes.ok) {
    throw new Error(`抓取站点失败（HTTP ${pageRes.status}）`);
  }

  const fetchedUrl = pageRes.finalUrl || siteUrl;
  const signals: GeoPageSignals = extractGeoPageSignals(fetchedUrl, pageRes.text);
  const access = await fetchSiteAccess(siteUrl);
  const breakdown = scoreGeoBreakdown(signals, access);
  const score = overallGeoScore(breakdown);

  // Prefer the URL the user asked to analyze (e.g. /en), even if the
  // final fetch redirected to /. Site-level items use their own paths.
  const requestedPath = pathOf(siteUrl);
  const fetchedPath = pathOf(fetchedUrl);
  const pagePath = requestedPath !== "/" ? requestedPath : fetchedPath;

  const items = buildGeoOpportunities(signals, access, breakdown, { pagePath });

  const warning =
    "分数来自 GEO Readiness 规则（页面结构 + robots/llms.txt），不是「已被 ChatGPT 引用」的实测结果。V2 将增加引用探测。V1 目前只分析你输入的这一页，不是全站爬取。";

  return {
    url: siteUrl,
    fetchedUrl,
    generatedAt: new Date().toISOString(),
    score,
    breakdown,
    access,
    page: {
      title: signals.title,
      description: signals.description,
      h1: signals.h1,
      flags: {
        hasFaqHeading: signals.hasFaqHeading,
        hasDefinitionCue: signals.hasDefinitionCue,
        hasFaqSchema: signals.hasFaqSchema,
        hasOrgSchema: signals.hasOrgSchema,
        hasProductSchema: signals.hasProductSchema,
        hasAuthor: signals.hasAuthor,
        hasDateModified: signals.hasDateModified,
        hasTable: signals.hasTable,
      },
    },
    items,
    warning,
  };
}
