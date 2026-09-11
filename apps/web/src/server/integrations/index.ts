/**
 * External integrations: PageSpeed / GSC / GA4 / GitHub.
 */
export type IntegrationProvider =
  | "pagespeed"
  | "gsc"
  | "ga4"
  | "github"
  | "cloudflare";

export async function getIntegrationStatus(
  _siteId: string,
  provider: IntegrationProvider,
): Promise<{ connected: boolean; provider: IntegrationProvider }> {
  if (provider === "pagespeed") {
    return {
      connected: Boolean(
        process.env.PAGESPEED_API_KEY?.trim() ||
          process.env.GOOGLE_API_KEY?.trim(),
      ),
      provider,
    };
  }
  return { connected: false, provider };
}

export { runPageSpeed } from "./pagespeed";
