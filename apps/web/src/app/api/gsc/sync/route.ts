import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { syncGscProperty } from "@/server/gsc/client";
import { readGscStore, writeGscStore } from "@/server/gsc/store";
import { parseSiteUrl } from "@/lib/url";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "未连接 Google 账号" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    property?: string;
    url?: string;
  };

  const property = body.property?.trim();
  if (!property) {
    return NextResponse.json({ error: "缺少 GSC property" }, { status: 400 });
  }

  const parsed = body.url ? parseSiteUrl(body.url) : null;
  const siteUrl = parsed?.ok ? parsed.url : (await readGscStore()).siteUrl;

  try {
    const synced = await syncGscProperty(session.accessToken, property);
    const store = {
      selectedProperty: property,
      siteUrl,
      lastSyncedAt: new Date().toISOString(),
      rows: synced.rows,
      opportunities: synced.opportunities,
    };
    await writeGscStore(store);

    return NextResponse.json({
      ok: true,
      selectedProperty: property,
      lastSyncedAt: store.lastSyncedAt,
      rowCount: store.rows.length,
      opportunityCount: store.opportunities.length,
      items: store.opportunities,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "GSC 同步失败";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
