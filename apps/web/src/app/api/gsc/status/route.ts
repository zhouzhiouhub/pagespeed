import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { readGscStore } from "@/server/gsc/store";

export async function GET() {
  const session = await auth();
  const store = await readGscStore();
  return NextResponse.json({
    connected: Boolean(session?.accessToken) && !session?.error,
    email: session?.user?.email ?? null,
    hasGscScope: Boolean(session?.hasGscScope),
    error: session?.error ?? null,
    selectedProperty: store.selectedProperty,
    siteUrl: store.siteUrl,
    lastSyncedAt: store.lastSyncedAt,
    opportunityCount: store.opportunities.length,
  });
}
