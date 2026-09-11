/**
 * GA4 integration scaffold (M2).
 * Full Data API sync lands when OAuth property is connected.
 */
export type Ga4Status = {
  connected: boolean;
  propertyId: string | null;
  lastSyncedAt: string | null;
  sessions7d: number | null;
  users7d: number | null;
  note: string;
};

export async function getGa4Status(_siteUrl?: string): Promise<Ga4Status> {
  const propertyId = process.env.GA4_PROPERTY_ID?.trim() || null;
  const connected = Boolean(
    propertyId &&
      (process.env.GA4_ACCESS_TOKEN?.trim() || process.env.GOOGLE_CLIENT_ID),
  );

  return {
    connected: false, // V1: require explicit OAuth path before claiming connected
    propertyId,
    lastSyncedAt: null,
    sessions7d: null,
    users7d: null,
    note: connected
      ? "GA4 property configured; OAuth sync endpoint not yet enabled."
      : "Connect GA4 (property + OAuth) to unlock Analytics summaries.",
  };
}

export async function fetchGa4Summary(_siteUrl: string): Promise<{
  ok: boolean;
  sessions7d: number | null;
  users7d: number | null;
  topPages: Array<{ path: string; sessions: number }>;
  warning: string | null;
}> {
  const status = await getGa4Status(_siteUrl);
  return {
    ok: false,
    sessions7d: null,
    users7d: null,
    topPages: [],
    warning: status.note,
  };
}
