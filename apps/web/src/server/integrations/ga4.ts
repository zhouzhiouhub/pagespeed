/**
 * GA4 integration — status from store + OAuth token.
 */
import { readGa4Store } from "@/server/ga4/store";
import { hasScope, readGoogleTokens } from "@/server/google/tokens";

export type Ga4Status = {
  connected: boolean;
  propertyId: string | null;
  propertyName: string | null;
  lastSyncedAt: string | null;
  sessions7d: number | null;
  users7d: number | null;
  topPages: Array<{ path: string; sessions: number; users: number }>;
  note: string;
};

export async function getGa4Status(siteUrl?: string): Promise<Ga4Status> {
  void siteUrl;
  const store = await readGa4Store();
  const tokens = await readGoogleTokens();
  const hasToken = Boolean(tokens?.refreshToken) && hasScope(tokens?.scope, "ga4");
  const synced = Boolean(store.selectedPropertyId && store.lastSyncedAt);

  if (synced) {
    return {
      connected: true,
      propertyId: store.selectedPropertyId,
      propertyName: store.selectedPropertyName,
      lastSyncedAt: store.lastSyncedAt,
      sessions7d: store.sessions7d,
      users7d: store.users7d,
      topPages: store.topPages.slice(0, 5),
      note: "GA4 已同步近 7 天页级数据",
    };
  }

  if (hasToken) {
    return {
      connected: false,
      propertyId: store.selectedPropertyId,
      propertyName: store.selectedPropertyName,
      lastSyncedAt: null,
      sessions7d: null,
      users7d: null,
      topPages: [],
      note: "已授权 Analytics，请在 Dashboard 选择 property 并同步",
    };
  }

  return {
    connected: false,
    propertyId: null,
    propertyName: null,
    lastSyncedAt: null,
    sessions7d: null,
    users7d: null,
    topPages: [],
    note: "连接 Google（含 Analytics 只读）后可同步 GA4",
  };
}

export async function fetchGa4Summary(siteUrl: string) {
  const status = await getGa4Status(siteUrl);
  return {
    ok: status.connected,
    sessions7d: status.sessions7d,
    users7d: status.users7d,
    topPages: status.topPages.map((p) => ({
      path: p.path,
      sessions: p.sessions,
    })),
    warning: status.connected ? null : status.note,
  };
}
