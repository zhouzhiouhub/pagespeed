/**
 * External integrations: PageSpeed / GSC / GA4 / GitHub.
 */
import { getServerEnv } from "@/server/env";
import { getGa4Status } from "@/server/integrations/ga4";
import { readGscStore } from "@/server/gsc/store";

export type IntegrationProvider =
  | "pagespeed"
  | "gsc"
  | "ga4"
  | "github"
  | "cloudflare";

export async function getIntegrationStatus(
  _siteId: string,
  provider: IntegrationProvider,
): Promise<{ connected: boolean; provider: IntegrationProvider; note?: string }> {
  if (provider === "pagespeed") {
    const key =
      (await getServerEnv("PAGESPEED_API_KEY")) ||
      (await getServerEnv("GOOGLE_API_KEY"));
    return {
      connected: Boolean(key),
      provider,
    };
  }
  if (provider === "gsc") {
    const store = await readGscStore();
    return {
      connected: Boolean(store.selectedProperty && store.lastSyncedAt),
      provider,
      note: store.selectedProperty ?? undefined,
    };
  }
  if (provider === "ga4") {
    const status = await getGa4Status();
    return {
      connected: status.connected,
      provider,
      note: status.note,
    };
  }
  return { connected: false, provider };
}

export { runPageSpeed } from "./pagespeed";
export { getGa4Status, fetchGa4Summary } from "./ga4";
