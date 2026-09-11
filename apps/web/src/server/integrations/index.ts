/**
 * External integrations: PageSpeed / GSC / GA4 / GitHub.
 */
import { readGscStore } from "@/server/gsc/store";
import { getGa4Status } from "@/server/integrations/ga4";

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
    return {
      connected: Boolean(
        process.env.PAGESPEED_API_KEY?.trim() ||
          process.env.GOOGLE_API_KEY?.trim(),
      ),
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
