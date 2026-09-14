/**
 * Map GA4 sessions / GSC impressions onto crawled pages so tech issues
 * on zero-traffic URLs can be demoted (M3: 无流量低优).
 */

export type TrafficBand = "unknown" | "none" | "low" | "mid" | "high";

export type PageTrafficStats = {
  sessions: number;
  impressions: number;
};

export type PageTrafficIndex = {
  hasData: boolean;
  byPath: Map<string, PageTrafficStats>;
};

export function normalizePathKey(urlOrPath: string): string {
  try {
    if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
      const u = new URL(urlOrPath);
      let p = u.pathname || "/";
      if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
      return p || "/";
    }
  } catch {
    // fall through
  }
  let p = urlOrPath.trim() || "/";
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p || "/";
}

export function buildPageTrafficIndex(input: {
  ga4?: {
    lastSyncedAt: string | null;
    rows: Array<{ pagePath: string; sessions: number }>;
  } | null;
  gsc?: {
    lastSyncedAt: string | null;
    rows: Array<{ page: string; impressions: number }>;
  } | null;
}): PageTrafficIndex {
  const byPath = new Map<string, PageTrafficStats>();
  let hasData = false;

  if (input.ga4?.lastSyncedAt && input.ga4.rows.length > 0) {
    hasData = true;
    for (const row of input.ga4.rows) {
      const key = normalizePathKey(row.pagePath);
      const prev = byPath.get(key) ?? { sessions: 0, impressions: 0 };
      prev.sessions += row.sessions || 0;
      byPath.set(key, prev);
    }
  }

  if (input.gsc?.lastSyncedAt && input.gsc.rows.length > 0) {
    hasData = true;
    for (const row of input.gsc.rows) {
      const key = normalizePathKey(row.page);
      const prev = byPath.get(key) ?? { sessions: 0, impressions: 0 };
      prev.impressions += row.impressions || 0;
      byPath.set(key, prev);
    }
  }

  return { hasData, byPath };
}

export function lookupPageTraffic(
  index: PageTrafficIndex,
  pageUrl: string,
): PageTrafficStats {
  const key = normalizePathKey(pageUrl);
  return index.byPath.get(key) ?? { sessions: 0, impressions: 0 };
}

export function classifyTrafficBand(
  stats: PageTrafficStats,
  hasData: boolean,
): TrafficBand {
  if (!hasData) return "unknown";
  const { sessions, impressions } = stats;
  if (sessions <= 0 && impressions <= 0) return "none";
  if (sessions < 5 && impressions < 50) return "low";
  if (sessions < 30 && impressions < 500) return "mid";
  return "high";
}

/**
 * Multiplier applied to tech opportunity score/impact.
 * Zero-traffic pages are heavily demoted when analytics exist.
 */
export function trafficScoreMultiplier(band: TrafficBand): number {
  switch (band) {
    case "none":
      return 0.3;
    case "low":
      return 0.55;
    case "mid":
      return 0.85;
    case "high":
      return 1.1;
    case "unknown":
    default:
      return 1;
  }
}

/**
 * When we have traffic data, drop low-severity issues on zero-traffic pages.
 */
export function shouldKeepTechIssue(opts: {
  severity: "critical" | "warning" | "info";
  band: TrafficBand;
}): boolean {
  if (opts.band === "none" && opts.severity === "warning") return false;
  return true;
}
