import { fetchText } from "@/server/http/fetch";
import { parseRobotsAiPolicy } from "@/server/geo/extract";
import { isPathAllowed, parseRobotsTxt, type RobotsRules } from "./robots";
import { discoverSitemapUrls } from "./sitemap";
import {
  buildPageIssues,
  extractSameOriginLinks,
  parseCrawledHtml,
  scoreAudit,
  type AuditIssueDraft,
  type CrawledPageFields,
} from "./parse-page";

export type CrawlResult = {
  jobId: string;
  siteUrl: string;
  origin: string;
  startedAt: string;
  finishedAt: string;
  robots: {
    url: string;
    ok: boolean;
    aiBotPolicy: ReturnType<typeof parseRobotsAiPolicy>["policy"];
    aiBotSummary: string;
    rules: RobotsRules;
  };
  sitemap: {
    sources: string[];
    urlCount: number;
    warning: string | null;
  };
  pages: CrawledPageFields[];
  issues: AuditIssueDraft[];
  scores: Record<string, number>;
  summary: Record<string, number>;
  warning: string | null;
};

function normalizeSeed(seedUrl: string): { siteUrl: string; origin: string } {
  const u = new URL(seedUrl);
  const origin = u.origin;
  const siteUrl = origin + (u.pathname === "/" ? "" : u.pathname.replace(/\/$/, ""));
  return { siteUrl: siteUrl || origin, origin };
}

function sameHost(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

export type CrawlOptions = {
  siteId?: string;
  seedUrl: string;
  maxPages?: number;
};

export async function crawlSite(opts: CrawlOptions): Promise<CrawlResult> {
  const startedAt = new Date().toISOString();
  const jobId = `crawl_${Date.now()}`;
  const { siteUrl, origin } = normalizeSeed(opts.seedUrl);
  const envMax =
    Number.parseInt(process.env.CRAWLER_MAX_PAGES ?? "40", 10) || 40;
  const maxPages = Math.min(opts.maxPages ?? envMax, 200);
  const userAgent =
    process.env.CRAWLER_USER_AGENT ?? "WebagentBot/0.1 (+https://localhost)";

  const robotsUrl = `${origin}/robots.txt`;
  let robotsText = "";
  let robotsOk = false;
  try {
    const robotsRes = await fetchText(robotsUrl, { timeoutMs: 15_000 });
    robotsOk = robotsRes.ok;
    if (robotsRes.ok) robotsText = robotsRes.text;
  } catch {
    robotsOk = false;
  }

  const rules = robotsOk
    ? parseRobotsTxt(robotsText, userAgent)
    : { sitemaps: [], disallows: [], allows: [] };
  const ai = robotsOk
    ? parseRobotsAiPolicy(robotsText)
    : { policy: "unknown" as const, summary: "robots.txt unavailable" };

  const sitemap = await discoverSitemapUrls(origin, rules.sitemaps, {
    maxSitemaps: 5,
    maxUrls: maxPages * 3,
  });

  const seedList: string[] = [siteUrl.startsWith("http") ? siteUrl : origin];
  if (!seedList.includes(origin)) seedList.unshift(origin);

  const candidates: string[] = [];
  for (const u of [...seedList, ...sitemap.urls]) {
    if (!sameHost(u, origin)) continue;
    try {
      const parsed = new URL(u);
      if (!isPathAllowed(parsed.pathname || "/", rules)) continue;
      parsed.hash = "";
      candidates.push(parsed.href);
    } catch {
      // skip
    }
  }

  const queue = [...new Set(candidates)];
  const visited = new Set<string>();
  const pages: CrawledPageFields[] = [];
  const warnings: string[] = [];
  if (sitemap.warning) warnings.push(sitemap.warning);

  // BFS: fetch batches, discover more links from HTML when sitemap is thin
  while (queue.length && pages.length < maxPages) {
    const batch: string[] = [];
    while (queue.length && batch.length < 6 && pages.length + batch.length < maxPages) {
      const next = queue.shift()!;
      if (visited.has(next)) continue;
      visited.add(next);
      batch.push(next);
    }
    if (!batch.length) break;

    const fetched = await mapPool(batch, 4, async (url) => {
      try {
        const res = await fetchText(url, { timeoutMs: 25_000 });
        const finalUrl = res.finalUrl || url;
        const fields = parseCrawledHtml(finalUrl, res.text, res.status);
        const moreLinks =
          sitemap.urls.length < maxPages
            ? extractSameOriginLinks(res.text, finalUrl, origin)
            : [];
        return { fields, moreLinks, error: null as string | null };
      } catch (err) {
        return {
          fields: null as CrawledPageFields | null,
          moreLinks: [] as string[],
          error: err instanceof Error ? err.message : "fetch failed",
        };
      }
    });

    for (const item of fetched) {
      if (item.error) {
        warnings.push(item.error);
        continue;
      }
      if (!item.fields) continue;
      pages.push(item.fields);
      for (const link of item.moreLinks) {
        if (visited.has(link) || queue.includes(link)) continue;
        try {
          const path = new URL(link).pathname || "/";
          if (!isPathAllowed(path, rules)) continue;
        } catch {
          continue;
        }
        if (pages.length + queue.length >= maxPages * 2) break;
        queue.push(link);
      }
    }
  }

  const issues = pages.flatMap(buildPageIssues);
  const scored = scoreAudit(pages, issues);
  const finishedAt = new Date().toISOString();

  return {
    jobId,
    siteUrl,
    origin,
    startedAt,
    finishedAt,
    robots: {
      url: robotsUrl,
      ok: robotsOk,
      aiBotPolicy: ai.policy,
      aiBotSummary: ai.summary,
      rules,
    },
    sitemap: {
      sources: sitemap.sources,
      urlCount: sitemap.urls.length,
      warning: sitemap.warning,
    },
    pages,
    issues,
    scores: scored.scores,
    summary: scored.summary,
    warning: warnings.length ? warnings.slice(0, 5).join(" · ") : null,
  };
}
