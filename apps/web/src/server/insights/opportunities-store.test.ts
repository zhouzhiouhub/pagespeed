import { describe, expect, it } from "vitest";
import { draftsFromCrawl } from "@/server/insights/opportunities-store";
import {
  buildPageTrafficIndex,
  classifyTrafficBand,
  normalizePathKey,
} from "@/server/insights/traffic-impact";
import type { CrawlResult } from "@/server/crawler";

describe("traffic-impact", () => {
  it("normalizes paths from full URLs", () => {
    expect(normalizePathKey("https://example.com/blog/a/")).toBe("/blog/a");
    expect(normalizePathKey("/about")).toBe("/about");
  });

  it("classifies zero traffic when data exists", () => {
    expect(
      classifyTrafficBand({ sessions: 0, impressions: 0 }, true),
    ).toBe("none");
    expect(
      classifyTrafficBand({ sessions: 0, impressions: 0 }, false),
    ).toBe("unknown");
  });

  it("builds index from GA4 + GSC", () => {
    const index = buildPageTrafficIndex({
      ga4: {
        lastSyncedAt: "2026-01-01",
        rows: [{ pagePath: "/blog", sessions: 12 }],
      },
      gsc: {
        lastSyncedAt: "2026-01-01",
        rows: [{ page: "https://example.com/blog", impressions: 100 }],
      },
    });
    expect(index.hasData).toBe(true);
    expect(index.byPath.get("/blog")).toEqual({
      sessions: 12,
      impressions: 100,
    });
  });
});

describe("draftsFromCrawl", () => {
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
        pageUrl: "https://example.com/dead",
        context: {},
      },
      {
        code: "missing_meta_description",
        severity: "warning",
        message: "缺 description (hot)",
        pageUrl: "https://example.com/hot",
        context: {},
      },
    ],
  } as unknown as CrawlResult;

  it("maps critical/warning issues to opportunity drafts with evidence", () => {
    const drafts = draftsFromCrawl(crawl);
    expect(drafts).toHaveLength(3);
    expect(drafts[0].type).toBe("tech_seo");
    expect(drafts[0].evidence?.[0].kind).toBe("rule");
    expect(drafts[0].payload?.trafficBand).toBe("unknown");
  });

  it("drops zero-traffic warnings when analytics exist", () => {
    const traffic = buildPageTrafficIndex({
      ga4: {
        lastSyncedAt: "2026-01-01",
        rows: [{ pagePath: "/hot", sessions: 40 }],
      },
      gsc: null,
    });
    const drafts = draftsFromCrawl(crawl, traffic);
    const urls = drafts.map((d) => d.pageUrl);
    expect(urls).toContain("https://example.com/");
    expect(urls).toContain("https://example.com/hot");
    expect(urls).not.toContain("https://example.com/dead");
    const home = drafts.find((d) => d.pageUrl === "https://example.com/");
    expect(home?.payload?.trafficBand).toBe("none");
    expect(home?.score).toBeLessThan(5);
  });
});
