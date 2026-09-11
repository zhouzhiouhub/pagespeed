import { describe, expect, it } from "vitest";
import { isPathAllowed, parseRobotsTxt } from "@/server/crawler/robots";
import { parseSitemapXml } from "@/server/crawler/sitemap";
import {
  buildPageIssues,
  parseCrawledHtml,
  scoreAudit,
} from "@/server/crawler/parse-page";

describe("parseRobotsTxt", () => {
  it("collects sitemaps and disallow rules for our UA", () => {
    const robots = `
User-agent: *
Disallow: /admin
Allow: /admin/public

User-agent: WebagentBot
Disallow: /private

Sitemap: https://example.com/sitemap.xml
`;
    const rules = parseRobotsTxt(robots, "WebagentBot/0.1");
    expect(rules.sitemaps).toEqual(["https://example.com/sitemap.xml"]);
    expect(rules.disallows).toContain("/private");
    expect(isPathAllowed("/private/x", rules)).toBe(false);
    expect(isPathAllowed("/blog", rules)).toBe(true);
  });
});

describe("parseSitemapXml", () => {
  it("parses urlset and nested sitemap index", () => {
    const index = `<?xml version="1.0"?>
<sitemapindex>
  <sitemap><loc>https://example.com/s1.xml</loc></sitemap>
</sitemapindex>`;
    expect(parseSitemapXml(index).nestedSitemaps).toEqual([
      "https://example.com/s1.xml",
    ]);

    const urlset = `<?xml version="1.0"?>
<urlset>
  <url><loc>https://example.com/a</loc></url>
  <url><loc>https://example.com/b</loc></url>
</urlset>`;
    expect(parseSitemapXml(urlset).urls).toEqual([
      "https://example.com/a",
      "https://example.com/b",
    ]);
  });
});

describe("parseCrawledHtml", () => {
  it("extracts SEO fields and builds issues/scores", () => {
    const html = `<!doctype html><html><head>
<title>Example Product Guide</title>
<meta name="description" content="A useful description for the page." />
<link rel="canonical" href="https://example.com/guide" />
<script type="application/ld+json">{"@type":"Article"}</script>
</head><body><h1>Guide</h1><h2>FAQ</h2><p>Hello world content here.</p>
<a href="/about">About</a>
</body></html>`;
    const page = parseCrawledHtml("https://example.com/guide", html, 200);
    expect(page.title).toContain("Example");
    expect(page.h1).toBe("Guide");
    expect(page.hasSchema).toBe(true);
    expect(page.internalLinks.some((l) => l.includes("/about"))).toBe(true);

    const issues = buildPageIssues(page);
    const scored = scoreAudit([page], issues);
    expect(scored.scores.seo).toBeGreaterThan(50);
    expect(scored.summary.pages).toBe(1);
  });
});
