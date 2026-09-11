/**
 * GA4 integration — status from store + OAuth token.
 */
import { readGa4Store } from "@/server/ga4/store";
import { hasScope, readGoogleTokens } from "@/server/google/tokens";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";
import { translate } from "@/lib/i18n/messages";

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

export async function getGa4Status(
  siteUrl?: string,
  locale: Locale = DEFAULT_LOCALE,
): Promise<Ga4Status> {
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
      note: translate(locale, "server.ga4Notes.synced"),
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
      note: translate(locale, "server.ga4Notes.authorized"),
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
    note: translate(locale, "server.ga4Notes.connect"),
  };
}

export async function fetchGa4Summary(siteUrl: string, locale: Locale = DEFAULT_LOCALE) {
  const status = await getGa4Status(siteUrl, locale);
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
