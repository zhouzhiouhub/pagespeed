import { describe, expect, it } from "vitest";
import { draftsFromCrawl } from "@/server/insights/opportunities-store";
import type { CrawlResult } from "@/server/crawler";

describe("draftsFromCrawl", () => {
  it("maps critical/warning issues to opportunity drafts with evidence", () => {
    const crawl = {
      issues: [
        {
          code: "missing_title",
          severity: "critical",
          message: "缺少 title",
          pageUrl: "https://example.com/",
          context: {},
        },
        {
          code: "geo_missing_faq_signal",
          severity: "info",
          message: "faq",
          pageUrl: "https://example.com/a",
          context: {},
        },
        {
          code: "missing_meta_description",
          severity: "warning",
          message: "缺 description",
          pageUrl: "https://example.com/b",
          context: {},
        },
      ],
    } as unknown as CrawlResult;

    const drafts = draftsFromCrawl(crawl);
    expect(drafts).toHaveLength(2);
    expect(drafts[0].type).toBe("tech_seo");
    expect(drafts[0].evidence?.[0].kind).toBe("rule");
  });
});
