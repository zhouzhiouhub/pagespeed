import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { syncGscProperty } from "@/server/gsc/client";
import { readGscStore, writeGscStore } from "@/server/gsc/store";
import { getGoogleAccessToken } from "@/server/google/tokens";
import { persistGscDailyRows } from "@/server/insights/metrics-persist";
import {
  draftsFromGsc,
  persistOpportunities,
} from "@/server/insights/opportunities-store";
import { parseSiteUrl, localeFromRequest } from "@/lib/url";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const locale = localeFromRequest(request);
  const session = await auth();
  const token = await getGoogleAccessToken({
    sessionAccessToken: session?.accessToken,
    requireScope: "gsc",
  });

  if (!token.accessToken) {
    return NextResponse.json(
      {
        error: token.error ?? "未连接 Google 账号（或 refresh token 不可用）",
      },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    property?: string;
    url?: string;
  };

  const property =
    body.property?.trim() || (await readGscStore()).selectedProperty || "";
  if (!property) {
    return NextResponse.json({ error: "缺少 GSC property" }, { status: 400 });
  }

  const parsed = body.url ? parseSiteUrl(body.url) : null;
  const siteUrl = parsed?.ok ? parsed.url : (await readGscStore()).siteUrl;

  try {
    const synced = await syncGscProperty(token.accessToken, property, locale);
    const store = {
      selectedProperty: property,
      siteUrl,
      lastSyncedAt: new Date().toISOString(),
      rows: synced.rows,
      opportunities: synced.opportunities,
    };
    await writeGscStore(store);

    let metricsPersist: { rows: number; persistedTo: "postgres" | "none" } = {
      rows: 0,
      persistedTo: "none",
    };
    let oppPersist: { count: number; persistedTo: "postgres" | "file" } = {
      count: 0,
      persistedTo: "file",
    };
    if (siteUrl) {
      metricsPersist = await persistGscDailyRows(siteUrl, store);
      oppPersist = await persistOpportunities(siteUrl, draftsFromGsc(store));
    }

    return NextResponse.json({
      ok: true,
      selectedProperty: property,
      lastSyncedAt: store.lastSyncedAt,
      rowCount: store.rows.length,
      opportunityCount: store.opportunities.length,
      items: store.opportunities,
      tokenSource: token.source,
      metricsPersist,
      opportunitiesPersist: oppPersist,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "GSC 同步失败";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
