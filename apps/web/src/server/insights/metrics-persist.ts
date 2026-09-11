import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { isDatabaseAvailable } from "@/server/db/ready";
import { gscQueryDaily, gaPageDaily } from "@/server/db/schema";
import { ensureSite } from "@/server/sites/repo";
import type { GscStore } from "@/server/gsc/store";
import type { Ga4Store } from "@/server/ga4/store";

export async function persistGscDailyRows(
  siteUrl: string,
  store: GscStore,
): Promise<{ rows: number; persistedTo: "postgres" | "none" }> {
  if (!(await isDatabaseAvailable()) || !store.rows.length) {
    return { rows: 0, persistedTo: "none" };
  }
  try {
    const site = await ensureSite(siteUrl);
    if (!/^[0-9a-f-]{36}$/i.test(site.id)) {
      return { rows: 0, persistedTo: "none" };
    }
    const date = (store.lastSyncedAt ?? new Date().toISOString()).slice(0, 10);
    // replace same-day snapshot for this site
    await db.delete(gscQueryDaily).where(eq(gscQueryDaily.siteId, site.id));

    const chunk = store.rows.slice(0, 250);
    await db.insert(gscQueryDaily).values(
      chunk.map((r) => ({
        siteId: site.id,
        date,
        query: r.query,
        page: r.page,
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: String(r.ctr),
        position: String(r.position),
      })),
    );
    return { rows: chunk.length, persistedTo: "postgres" };
  } catch (err) {
    console.warn("[gsc] persist daily failed", err);
    return { rows: 0, persistedTo: "none" };
  }
}

export async function persistGa4DailyRows(
  siteUrl: string,
  store: Ga4Store,
): Promise<{ rows: number; persistedTo: "postgres" | "none" }> {
  if (!(await isDatabaseAvailable()) || !store.rows.length) {
    return { rows: 0, persistedTo: "none" };
  }
  try {
    const site = await ensureSite(siteUrl);
    if (!/^[0-9a-f-]{36}$/i.test(site.id)) {
      return { rows: 0, persistedTo: "none" };
    }
    await db.delete(gaPageDaily).where(eq(gaPageDaily.siteId, site.id));
    const chunk = store.rows.slice(0, 500);
    await db.insert(gaPageDaily).values(
      chunk.map((r) => ({
        siteId: site.id,
        date: r.date,
        pagePath: r.pagePath,
        sessions: r.sessions,
        users: r.users,
        engagementRate:
          r.engagementRate != null ? String(r.engagementRate) : null,
        avgEngagementTime:
          r.avgEngagementTime != null ? String(r.avgEngagementTime) : null,
        bounceRate: r.bounceRate != null ? String(r.bounceRate) : null,
      })),
    );
    return { rows: chunk.length, persistedTo: "postgres" };
  } catch (err) {
    console.warn("[ga4] persist daily failed", err);
    return { rows: 0, persistedTo: "none" };
  }
}
