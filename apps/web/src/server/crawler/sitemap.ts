import { fetchText } from "@/server/http/fetch";

function decodeXml(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export function parseSitemapXml(xml: string): {
  urls: string[];
  nestedSitemaps: string[];
} {
  const nestedSitemaps = [
    ...xml.matchAll(/<sitemap>\s*<loc>\s*([^<]+)\s*<\/loc>/gi),
  ].map((m) => decodeXml(m[1].trim()));

  const urls = [...xml.matchAll(/<url>\s*<loc>\s*([^<]+)\s*<\/loc>/gi)].map(
    (m) => decodeXml(m[1].trim()),
  );

  // Some sitemaps omit <url> wrapper and only have <loc>
  if (!urls.length && !nestedSitemaps.length) {
    const locs = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((m) =>
      decodeXml(m[1].trim()),
    );
    return { urls: locs, nestedSitemaps: [] };
  }

  return { urls, nestedSitemaps };
}

export async function discoverSitemapUrls(
  origin: string,
  robotsSitemaps: string[],
  opts?: { maxSitemaps?: number; maxUrls?: number },
): Promise<{ urls: string[]; sources: string[]; warning: string | null }> {
  const maxSitemaps = opts?.maxSitemaps ?? 5;
  const maxUrls = opts?.maxUrls ?? 500;
  const sources: string[] = [];
  const warnings: string[] = [];
  const queue = [
    ...robotsSitemaps,
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
  ];
  const seenSitemap = new Set<string>();
  const urls: string[] = [];

  while (queue.length && seenSitemap.size < maxSitemaps && urls.length < maxUrls) {
    const next = queue.shift()!;
    if (seenSitemap.has(next)) continue;
    seenSitemap.add(next);

    try {
      const res = await fetchText(next, { timeoutMs: 20_000 });
      if (!res.ok) {
        if (!robotsSitemaps.includes(next)) continue;
        warnings.push(`sitemap ${next} HTTP ${res.status}`);
        continue;
      }
      sources.push(next);
      const parsed = parseSitemapXml(res.text);
      for (const nested of parsed.nestedSitemaps) {
        if (!seenSitemap.has(nested)) queue.push(nested);
      }
      for (const u of parsed.urls) {
        if (urls.length >= maxUrls) break;
        urls.push(u);
      }
    } catch (err) {
      warnings.push(
        err instanceof Error ? `sitemap ${next}: ${err.message}` : `sitemap failed`,
      );
    }
  }

  return {
    urls: [...new Set(urls)],
    sources,
    warning: warnings.length ? warnings.slice(0, 3).join(" · ") : null,
  };
}
