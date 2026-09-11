/**
 * Site crawler — fetch pages, parse SEO/GEO signals (M1).
 */
import { crawlSite, type CrawlOptions, type CrawlResult } from "./crawl";

export type CrawlJobInput = {
  siteId?: string;
  seedUrl: string;
  maxPages?: number;
};

export type { CrawlResult, CrawlOptions };
export { crawlSite };
export { parseRobotsTxt, isPathAllowed } from "./robots";
export { parseSitemapXml } from "./sitemap";
export { parseCrawledHtml, buildPageIssues, scoreAudit } from "./parse-page";

const recentJobs = new Map<string, CrawlResult>();

export async function enqueueCrawl(
  input: CrawlJobInput,
): Promise<{ jobId: string; result: CrawlResult }> {
  const result = await crawlSite({
    siteId: input.siteId,
    seedUrl: input.seedUrl,
    maxPages: input.maxPages,
  });
  recentJobs.set(result.jobId, result);
  // keep last 20 in memory for /api/crawl polling
  if (recentJobs.size > 20) {
    const first = recentJobs.keys().next().value;
    if (first) recentJobs.delete(first);
  }
  return { jobId: result.jobId, result };
}

export function getCrawlJob(jobId: string): CrawlResult | null {
  return recentJobs.get(jobId) ?? null;
}
