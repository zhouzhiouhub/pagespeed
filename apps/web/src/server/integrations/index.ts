/**
 * External integrations: GSC / GA4 / GitHub (M2+).
 */
export type IntegrationProvider = "gsc" | "ga4" | "github" | "cloudflare";

export async function getIntegrationStatus(
  _siteId: string,
  provider: IntegrationProvider,
): Promise<{ connected: boolean; provider: IntegrationProvider }> {
  return { connected: false, provider };
}
