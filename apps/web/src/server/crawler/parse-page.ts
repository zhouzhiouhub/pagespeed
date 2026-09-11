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

function pickTag(html: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = html.match(re);
  if (!m) return null;
  const text = decodeEntities(m[1].replace(/<[^>]+>/g, " "));
  return text || null;
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

function extractSchemaTypes(html: string): string[] {
  const blocks = [
    ...html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ].map((m) => m[1]);

  const types = new Set<string>();
  for (const raw of blocks) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      const visit = (node: unknown) => {
        if (!node) return;
        if (Array.isArray(node)) {
          node.forEach(visit);
          return;
        }
        if (typeof node !== "object") return;
        const obj = node as Record<string, unknown>;
        const t = obj["@type"];
        if (typeof t === "string") types.add(t);
        if (Array.isArray(t)) {
          for (const x of t) if (typeof x === "string") types.add(x);
        }
        for (const v of Object.values(obj)) visit(v);
      };
      visit(parsed);
    } catch {
      // ignore
    }
  }
  return [...types];
}

export type CrawledPageFields = {
  url: string;
  path: string;
  statusCode: number;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  h1All: string[];
  canonical: string | null;
  indexable: boolean;
  wordCount: number;
  hasSchema: boolean;
  schemaTypes: string[];
  internalLinks: string[];
  rawSignals: Record<string, unknown>;
  geoSignals: Record<string, unknown>;
};

export function extractSameOriginLinks(
  html: string,
  pageUrl: string,
  origin: string,
): string[] {
  const links: string[] = [];
  const re = /<a\s[^>]*href=["']([^"'#]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && links.length < 80) {
    try {
      const abs = new URL(m[1], pageUrl);
      if (abs.origin !== origin) continue;
      abs.hash = "";
      if (/\.(pdf|jpg|jpeg|png|gif|svg|zip|css|js)$/i.test(abs.pathname)) continue;
      links.push(abs.href);
    } catch {
      // skip
    }
  }
  return [...new Set(links)];
}

export function parseCrawledHtml(
  pageUrl: string,
  html: string,
  statusCode: number,
): CrawledPageFields {
  const parsedUrl = new URL(pageUrl);
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]) : null;
  const metaDescription = pickMeta(html, ["description", "og:description"]);
  const h1All = pickAll(html, "h1", 5);
  const canonicalMatch = html.match(
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>|<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["'][^>]*>/i,
  );
  const canonical = canonicalMatch
    ? decodeEntities(canonicalMatch[1] ?? canonicalMatch[2] ?? "")
    : null;

  const robotsMeta = (
    pickMeta(html, ["robots", "googlebot"]) ?? ""
  ).toLowerCase();
  const noindex = /noindex/.test(robotsMeta);
  const text = decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const schemaTypes = extractSchemaTypes(html);
  const internalLinks = extractSameOriginLinks(html, pageUrl, parsedUrl.origin);

  return {
    url: pageUrl,
    path: parsedUrl.pathname || "/",
    statusCode,
    title,
    metaDescription,
    h1: h1All[0] ?? pickTag(html, "h1"),
    h1All,
    canonical,
    indexable: !noindex && statusCode >= 200 && statusCode < 400,
    wordCount,
    hasSchema: schemaTypes.length > 0,
    schemaTypes,
    internalLinks,
    rawSignals: {
      robotsMeta: robotsMeta || null,
      ogTitle: pickMeta(html, ["og:title"]),
      h2Count: pickAll(html, "h2", 30).length,
      internalLinkCount: internalLinks.length,
    },
    geoSignals: {
      schemaTypes,
      hasAuthorMeta:
        /rel=["']author["']|itemprop=["']author["']/i.test(html) ||
        Boolean(pickMeta(html, ["author"])),
      hasDateModifiedMeta:
        /property=["']article:modified_time["']|itemprop=["']dateModified["']/i.test(
          html,
        ) ||
        Boolean(pickMeta(html, ["article:modified_time", "og:updated_time"])),
      hasFaqHeading: /faq|常见问题|frequently asked/i.test(html),
    },
  };
}

export type AuditIssueDraft = {
  code: string;
  severity: "critical" | "warning" | "info";
  message: string;
  pageUrl: string;
  context: Record<string, unknown>;
};

export function buildPageIssues(page: CrawledPageFields): AuditIssueDraft[] {
  const issues: AuditIssueDraft[] = [];
  if (!page.title) {
    issues.push({
      code: "missing_title",
      severity: "critical",
      message: "缺少 <title>",
      pageUrl: page.url,
      context: {},
    });
  } else if (page.title.length < 15 || page.title.length > 65) {
    issues.push({
      code: "title_length",
      severity: "warning",
      message: `Title 长度 ${page.title.length}（建议 15–65）`,
      pageUrl: page.url,
      context: { length: page.title.length },
    });
  }

  if (!page.metaDescription) {
    issues.push({
      code: "missing_meta_description",
      severity: "warning",
      message: "缺少 meta description",
      pageUrl: page.url,
      context: {},
    });
  }

  if (!page.h1) {
    issues.push({
      code: "missing_h1",
      severity: "warning",
      message: "缺少 H1",
      pageUrl: page.url,
      context: {},
    });
  } else if (page.h1All.length > 1) {
    issues.push({
      code: "multiple_h1",
      severity: "info",
      message: `存在 ${page.h1All.length} 个 H1`,
      pageUrl: page.url,
      context: { h1: page.h1All },
    });
  }

  if (!page.indexable) {
    issues.push({
      code: "not_indexable",
      severity: "critical",
      message: "页面可能不可索引（noindex 或非 2xx）",
      pageUrl: page.url,
      context: { statusCode: page.statusCode, robots: page.rawSignals.robotsMeta },
    });
  }

  if (!page.hasSchema) {
    issues.push({
      code: "missing_schema",
      severity: "info",
      message: "未检测到 JSON-LD Schema",
      pageUrl: page.url,
      context: {},
    });
  }

  if (!(page.geoSignals.hasFaqHeading as boolean)) {
    issues.push({
      code: "geo_missing_faq_signal",
      severity: "info",
      message: "未检测到 FAQ / 常见问题信号（GEO readiness）",
      pageUrl: page.url,
      context: {},
    });
  }

  return issues;
}

export function scoreAudit(pages: CrawledPageFields[], issues: AuditIssueDraft[]) {
  const critical = issues.filter((i) => i.severity === "critical").length;
  const warning = issues.filter((i) => i.severity === "warning").length;
  const info = issues.filter((i) => i.severity === "info").length;
  const pageCount = Math.max(1, pages.length);
  const withTitle = pages.filter((p) => p.title).length;
  const withDesc = pages.filter((p) => p.metaDescription).length;
  const withH1 = pages.filter((p) => p.h1).length;
  const withSchema = pages.filter((p) => p.hasSchema).length;
  const indexable = pages.filter((p) => p.indexable).length;

  const seo = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (withTitle / pageCount) * 25 +
          (withDesc / pageCount) * 20 +
          (withH1 / pageCount) * 20 +
          (indexable / pageCount) * 25 +
          Math.max(0, 10 - critical * 3 - warning),
      ),
    ),
  );
  const geo = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (withSchema / pageCount) * 40 +
          (pages.filter((p) => p.geoSignals.hasFaqHeading).length / pageCount) *
            30 +
          (pages.filter((p) => p.geoSignals.hasAuthorMeta).length / pageCount) *
            15 +
          (pages.filter((p) => p.geoSignals.hasDateModifiedMeta).length /
            pageCount) *
            15,
      ),
    ),
  );

  return {
    scores: { seo, geo, overall: Math.round((seo + geo) / 2) },
    summary: {
      pages: pages.length,
      critical,
      warning,
      info,
      indexable,
      withSchema,
    },
  };
}
