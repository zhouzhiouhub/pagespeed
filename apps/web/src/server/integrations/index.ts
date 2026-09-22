/**
 * External integrations: PageSpeed / GA4 / GitHub.
 */
import { getServerEnv } from "@/server/env";
import { getGa4Status } from "@/server/integrations/ga4";

export type IntegrationProvider =
  | "pagespeed"
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
