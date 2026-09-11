import { proxiedFetch } from "@/server/http/fetch";
import type { Ga4PageRow, Ga4Property } from "@/server/ga4/store";

async function gaFetch<T>(
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
    throw new Error(data.error?.message ?? `GA4 API failed (${res.status})`);
  }
  return data;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function listGa4Properties(
  accessToken: string,
): Promise<Ga4Property[]> {
  // Account Summaries includes property list without needing account id up front.
  const data = await gaFetch<{
    accountSummaries?: Array<{
      propertySummaries?: Array<{
        property?: string;
        displayName?: string;
      }>;
    }>;
  }>(
    accessToken,
    "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200",
  );

  const out: Ga4Property[] = [];
  for (const account of data.accountSummaries ?? []) {
    for (const p of account.propertySummaries ?? []) {
      const name = p.property ?? "";
      const propertyId = name.replace(/^properties\//, "");
      if (!propertyId) continue;
      out.push({
        name,
        displayName: p.displayName ?? propertyId,
        propertyId,
      });
    }
  }
  return out;
}

export async function runGa4PageReport(
  accessToken: string,
  propertyId: string,
  days = 7,
): Promise<{
  rows: Ga4PageRow[];
  sessions7d: number;
  users7d: number;
  topPages: Array<{ path: string; sessions: number; users: number }>;
}> {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  const data = await gaFetch<{
    rows?: Array<{
      dimensionValues?: Array<{ value?: string }>;
      metricValues?: Array<{ value?: string }>;
    }>;
  }>(
    accessToken,
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      body: {
        dateRanges: [
          { startDate: isoDate(start), endDate: isoDate(end) },
        ],
        dimensions: [{ name: "date" }, { name: "pagePath" }],
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "engagementRate" },
          { name: "averageSessionDuration" },
          { name: "bounceRate" },
        ],
        limit: 500,
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      },
    },
  );

  const rows: Ga4PageRow[] = (data.rows ?? []).map((row) => {
    const date = row.dimensionValues?.[0]?.value ?? "";
    const pagePath = row.dimensionValues?.[1]?.value ?? "/";
    const sessions = Number(row.metricValues?.[0]?.value ?? 0);
    const users = Number(row.metricValues?.[1]?.value ?? 0);
    const engagementRate = Number(row.metricValues?.[2]?.value ?? NaN);
    const avgEngagementTime = Number(row.metricValues?.[3]?.value ?? NaN);
    const bounceRate = Number(row.metricValues?.[4]?.value ?? NaN);
    return {
      date: date.includes("-")
        ? date
        : `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
      pagePath,
      sessions,
      users,
      engagementRate: Number.isFinite(engagementRate) ? engagementRate : null,
      avgEngagementTime: Number.isFinite(avgEngagementTime)
        ? avgEngagementTime
        : null,
      bounceRate: Number.isFinite(bounceRate) ? bounceRate : null,
    };
  });

  const byPath = new Map<string, { sessions: number; users: number }>();
  let sessions7d = 0;
  let users7d = 0;
  for (const row of rows) {
    sessions7d += row.sessions;
    users7d += row.users;
    const prev = byPath.get(row.pagePath) ?? { sessions: 0, users: 0 };
    prev.sessions += row.sessions;
    prev.users += row.users;
    byPath.set(row.pagePath, prev);
  }

  const topPages = [...byPath.entries()]
    .map(([path, v]) => ({ path, sessions: v.sessions, users: v.users }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 20);

  return { rows, sessions7d, users7d, topPages };
}

export function matchGa4Property(
  siteUrl: string,
  properties: Ga4Property[],
): Ga4Property | null {
  const host = (() => {
    try {
      return new URL(siteUrl).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  if (!host) return properties[0] ?? null;
  const hit = properties.find((p) =>
    p.displayName.toLowerCase().includes(host.split(".")[0] ?? host),
  );
  return hit ?? properties[0] ?? null;
}
