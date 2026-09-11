import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  listGa4Properties,
  matchGa4Property,
  runGa4PageReport,
} from "@/server/ga4/client";
import { readGa4Store, writeGa4Store } from "@/server/ga4/store";
import { getGoogleAccessToken, hasScope, readGoogleTokens } from "@/server/google/tokens";
import { persistGa4DailyRows } from "@/server/insights/metrics-persist";
import { parseSiteUrl } from "@/lib/url";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const session = await auth();
  const store = await readGa4Store();
  const saved = await readGoogleTokens();
  const token = await getGoogleAccessToken({
    sessionAccessToken: session?.accessToken,
    requireScope: "ga4",
  });

  const url = new URL(request.url).searchParams.get("url");
  let suggestedPropertyId: string | null = store.selectedPropertyId;
  let properties: Awaited<ReturnType<typeof listGa4Properties>> = [];

  if (token.accessToken) {
    try {
      properties = await listGa4Properties(token.accessToken);
      if (url) {
        const parsed = parseSiteUrl(url);
        if (parsed.ok) {
          suggestedPropertyId =
            matchGa4Property(parsed.url, properties)?.propertyId ??
            suggestedPropertyId;
        }
      }
    } catch {
      // status still returns store
    }
  }

  return NextResponse.json({
    connected:
      (Boolean(session?.accessToken) && !session?.error) ||
      Boolean(saved?.refreshToken && hasScope(saved.scope, "ga4")),
    email: session?.user?.email ?? saved?.email ?? null,
    hasGa4Scope: Boolean(session?.hasGa4Scope) || hasScope(saved?.scope, "ga4"),
    hasOfflineToken: Boolean(saved?.refreshToken),
    selectedPropertyId: store.selectedPropertyId,
    selectedPropertyName: store.selectedPropertyName,
    lastSyncedAt: store.lastSyncedAt,
    sessions7d: store.sessions7d,
    users7d: store.users7d,
    topPages: store.topPages.slice(0, 8),
    properties,
    suggestedPropertyId,
    error: token.error ?? session?.error ?? null,
  });
}

export async function POST(request: Request) {
  const session = await auth();
  const token = await getGoogleAccessToken({
    sessionAccessToken: session?.accessToken,
    requireScope: "ga4",
  });
  if (!token.accessToken) {
    return NextResponse.json(
      { error: token.error ?? "未连接 Google Analytics" },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    propertyId?: string;
    url?: string;
  };
  const storePrev = await readGa4Store();
  const propertyId =
    body.propertyId?.trim() || storePrev.selectedPropertyId || "";
  if (!propertyId) {
    return NextResponse.json({ error: "缺少 GA4 propertyId" }, { status: 400 });
  }

  const parsed = body.url ? parseSiteUrl(body.url) : null;
  const siteUrl = parsed?.ok ? parsed.url : storePrev.siteUrl;

  try {
    const report = await runGa4PageReport(token.accessToken, propertyId, 7);
    let displayName = storePrev.selectedPropertyName;
    try {
      const props = await listGa4Properties(token.accessToken);
      displayName =
        props.find((p) => p.propertyId === propertyId)?.displayName ??
        displayName;
    } catch {
      // ignore
    }

    const store = {
      selectedPropertyId: propertyId,
      selectedPropertyName: displayName,
      siteUrl,
      lastSyncedAt: new Date().toISOString(),
      sessions7d: report.sessions7d,
      users7d: report.users7d,
      rows: report.rows,
      topPages: report.topPages,
    };
    await writeGa4Store(store);

    const metricsPersist = siteUrl
      ? await persistGa4DailyRows(siteUrl, store)
      : { rows: 0, persistedTo: "none" as const };

    return NextResponse.json({
      ok: true,
      ...store,
      topPages: store.topPages.slice(0, 10),
      tokenSource: token.source,
      metricsPersist,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "GA4 同步失败";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
