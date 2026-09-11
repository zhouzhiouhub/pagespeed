import { fetchText } from "@/server/http/fetch";
import {
  extractStructuralSignals,
  parseRobotsAiPolicy,
  type GeoSiteAccess,
  type GeoStructuralSignals,
} from "@/server/geo/extract";
import {
  analyzeGeoWithLlm,
  type GeoBreakdown,
  type GeoOpportunity,
  type GeoSignalChip,
} from "@/server/geo/llm-analyze";

export type GeoAnalysis = {
  url: string;
  fetchedUrl: string;
  generatedAt: string;
  score: number;
  breakdown: GeoBreakdown;
  access: GeoSiteAccess;
  model: string | null;
  page: {
    title: string | null;
    description: string | null;
    h1: string[];
    pageKind: string;
    pageKindLabel: string;
    pageKindReason: string;
    expectationLabels: string[];
    signalChips: GeoSignalChip[];
    schemaTypes: string[];
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
  let aiBotSummary = "robots.txt unread; AI bot policy unknown";
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
  const signals: GeoStructuralSignals = extractStructuralSignals(
    fetchedUrl,
    pageRes.text,
  );
  const access = await fetchSiteAccess(siteUrl);

  const requestedPath = pathOf(siteUrl);
  const fetchedPath = pathOf(fetchedUrl);
  const pagePath = requestedPath !== "/" ? requestedPath : fetchedPath;

  const llm = await analyzeGeoWithLlm(siteUrl, pagePath, signals, access);

  const warningParts = [
    "Pipeline: fetch URL → structural extract → LLM content judgment → gaps.",
    "Scores are GEO Readiness, not live AI citation.",
    "V1 analyzes the URL you entered only.",
  ];
  if (llm.warning) warningParts.unshift(llm.warning);

  return {
    url: siteUrl,
    fetchedUrl,
    generatedAt: new Date().toISOString(),
    score: llm.score,
    breakdown: llm.breakdown,
    access,
    model: llm.model,
    page: {
      title: signals.title,
      description: signals.description,
      h1: signals.h1,
      pageKind: llm.pageKind,
      pageKindLabel: llm.pageKindLabel,
      pageKindReason: llm.pageKindReason,
      expectationLabels: llm.expectationLabels,
      signalChips: llm.signalChips,
      schemaTypes: signals.schemaTypes,
    },
    items: llm.items,
    warning: warningParts.join(" "),
  };
}

// Re-export types used by API/plan
export type { GeoOpportunity, GeoBreakdown, GeoSignalChip };
