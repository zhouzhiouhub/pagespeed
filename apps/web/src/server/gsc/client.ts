import { proxiedFetch } from "@/server/http/fetch";
import type { KeywordOpportunity } from "@/server/keywords/opportunities";
import type { GscSite } from "@/server/gsc/store";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";
import { translate } from "@/lib/i18n/messages";

type SearchAnalyticsRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

function encodeSiteUrl(siteUrl: string) {
  return encodeURIComponent(siteUrl);
}

async function gscFetch<T>(
  accessToken: string,
  url: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await proxiedFetch(url, {
    method: init?.method ?? "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(data.error?.message ?? `GSC API failed (${res.status})`);
  }
  return data;
}

export async function listGscSites(accessToken: string): Promise<GscSite[]> {
  const data = await gscFetch<{ siteEntry?: GscSite[] }>(
    accessToken,
    "https://www.googleapis.com/webmasters/v3/sites",
  );
  return data.siteEntry ?? [];
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function querySearchAnalytics(
  accessToken: string,
  property: string,
  startDate: string,
  endDate: string,
): Promise<SearchAnalyticsRow[]> {
  const data = await gscFetch<{ rows?: SearchAnalyticsRow[] }>(
    accessToken,
    `https://www.googleapis.com/webmasters/v3/sites/${encodeSiteUrl(property)}/searchAnalytics/query`,
    {
      method: "POST",
      body: {
        startDate,
        endDate,
        dimensions: ["query", "page"],
        rowLimit: 250,
        startRow: 0,
      },
    },
  );
  return data.rows ?? [];
}

function expectedCtr(position: number): number {
  // Rough CTR curve for opportunity scoring
  if (position <= 1) return 0.28;
  if (position <= 3) return 0.15;
  if (position <= 5) return 0.08;
  if (position <= 10) return 0.04;
  if (position <= 20) return 0.015;
  return 0.005;
}

export function buildGscKeywordOpportunities(
  current: SearchAnalyticsRow[],
  previous: SearchAnalyticsRow[],
  locale: Locale = DEFAULT_LOCALE,
): {
  rows: Array<{
    query: string;
    page: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
    prevPosition: number | null;
  }>;
  opportunities: KeywordOpportunity[];
} {
  const prevMap = new Map<string, number>();
  for (const row of previous) {
    const query = row.keys?.[0];
    const page = row.keys?.[1];
    if (!query || !page || row.position == null) continue;
    prevMap.set(`${query}||${page}`, row.position);
  }

  const rows = current
    .map((row) => {
      const query = row.keys?.[0] ?? "";
      const page = row.keys?.[1] ?? "";
      const position = row.position ?? 0;
      const impressions = row.impressions ?? 0;
      const clicks = row.clicks ?? 0;
      const ctr = row.ctr ?? (impressions ? clicks / impressions : 0);
      const prevPosition = prevMap.get(`${query}||${page}`) ?? null;
      return { query, page, clicks, impressions, ctr, position, prevPosition };
    })
    .filter((r) => r.query && r.page);

  const opportunities: KeywordOpportunity[] = rows
    .filter((r) => r.impressions >= 10 && r.position >= 4.5 && r.position <= 30)
    .map((r) => {
      const gap = Math.max(0, expectedCtr(r.position) - r.ctr);
      const lift = r.impressions * gap;
      let potential = 2;
      if (lift > 20 || (r.position >= 8 && r.position <= 20 && r.impressions >= 50)) {
        potential = 5;
      } else if (lift > 8 || r.impressions >= 30) {
        potential = 4;
      } else if (r.impressions >= 15) {
        potential = 3;
      }

      const trend7d =
        r.prevPosition != null ? Number((r.position - r.prevPosition).toFixed(1)) : null;

      let path = r.page;
      try {
        path = new URL(r.page).pathname || r.page;
      } catch {
        // keep raw
      }

      const position = Number(r.position.toFixed(1));
      const ctrPct = (r.ctr * 100).toFixed(2);
      const inWinZone = r.position >= 8 && r.position <= 20;
      const rationale = translate(
        locale,
        inWinZone
          ? "server.gscOpp.rationaleWin"
          : "server.gscOpp.rationaleWatch",
        {
          impressions: r.impressions,
          clicks: r.clicks,
          position,
          ctr: ctrPct,
        },
      );

      return {
        query: r.query,
        position,
        potential,
        page: path,
        trend7d,
        intent: /如何|什么|怎么|how|what|vs|对比/i.test(r.query)
          ? "informational"
          : "commercial",
        rationale,
        actions: [
          translate(locale, "server.gscOpp.actionTitle"),
          translate(locale, "server.gscOpp.actionFaq"),
          translate(locale, "server.gscOpp.actionLinks"),
          translate(locale, "server.gscOpp.actionIntent"),
        ],
        source: "gsc" as const,
      };
    })
    .sort((a, b) => b.potential - a.potential || (a.position ?? 99) - (b.position ?? 99))
    .slice(0, 50);

  return { rows, opportunities };
}

export async function syncGscProperty(
  accessToken: string,
  property: string,
  locale: Locale = DEFAULT_LOCALE,
) {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 3); // GSC delay
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 27);
  const prevEnd = new Date(start);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - 27);

  const [current, previous] = await Promise.all([
    querySearchAnalytics(accessToken, property, isoDate(start), isoDate(end)),
    querySearchAnalytics(accessToken, property, isoDate(prevStart), isoDate(prevEnd)),
  ]);

  return buildGscKeywordOpportunities(current, previous, locale);
}

/** Match analyzed site URL to a GSC property when possible. */
export function matchProperty(siteUrl: string, sites: GscSite[]): string | null {
  const normalized = siteUrl.replace(/\/$/, "");
  const host = (() => {
    try {
      return new URL(normalized).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();

  const exact = sites.find((s) => s.siteUrl.replace(/\/$/, "") === normalized);
  if (exact) return exact.siteUrl;

  const prefix = sites.find((s) => {
    const u = s.siteUrl.replace(/\/$/, "");
    return normalized.startsWith(u) || u.startsWith(normalized);
  });
  if (prefix) return prefix.siteUrl;

  const scDomain = sites.find(
    (s) => s.siteUrl.startsWith("sc-domain:") && s.siteUrl.includes(host),
  );
  if (scDomain) return scDomain.siteUrl;

  const hostMatch = sites.find((s) => s.siteUrl.includes(host));
  return hostMatch?.siteUrl ?? null;
}
