import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { readGscStore } from "@/server/gsc/store";
import { hasScope, readGoogleTokens } from "@/server/google/tokens";

export async function GET() {
  const session = await auth();
  const store = await readGscStore();
  const saved = await readGoogleTokens();
  const scope = saved?.scope ?? null;
  const sessionConnected = Boolean(session?.accessToken) && !session?.error;
  const storeReady = Boolean(saved?.refreshToken) && hasScope(scope, "gsc");

  return NextResponse.json({
    connected: sessionConnected || storeReady,
    email: session?.user?.email ?? saved?.email ?? null,
    hasGscScope: Boolean(session?.hasGscScope) || hasScope(scope, "gsc"),
    hasOfflineToken: Boolean(saved?.refreshToken),
    error: session?.error ?? null,
    selectedProperty: store.selectedProperty,
    siteUrl: store.siteUrl,
    lastSyncedAt: store.lastSyncedAt,
    opportunityCount: store.opportunities.length,
  });
}
