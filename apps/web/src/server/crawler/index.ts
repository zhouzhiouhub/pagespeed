/**
 * Site crawler — fetch pages, parse SEO/GEO signals (M1).
 * V1: fetch + cheerio/linkedom; headless browser only when needed.
 */
export type CrawlJobInput = {
  siteId: string;
  seedUrl: string;
  maxPages?: number;
};

export async function enqueueCrawl(_input: CrawlJobInput): Promise<{ jobId: string }> {
  // Placeholder until queue (Inngest / BullMQ) is wired in M1.
  return { jobId: `crawl-stub-${Date.now()}` };
}
