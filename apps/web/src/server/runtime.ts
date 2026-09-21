/**
 * Detect Cloudflare Workers / workerd (OpenNext production).
 *
 * Order matters:
 * - `CLOUDFLARE=1` is a wrangler var and is set at Worker module load.
 * - `next dev` must still use Clash (`HTTPS_PROXY`); OpenNext shims
 *   (WebSocketPair, etc.) are not workerd.
 */
export function isCloudflareRuntime(): boolean {
  if (process.env.CLOUDFLARE === "1") return true;
  if (process.env.NEXT_RUNTIME_CLOUDFLARE === "1") return true;

  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.userAgent === "Cloudflare-Workers"
    ) {
      return true;
    }
  } catch {
    // ignore
  }

  // Next.js Node server (local `next dev` / `next start`).
  if (process.env.NEXT_RUNTIME === "nodejs") return false;

  if ((globalThis as Record<symbol, unknown>)[Symbol.for("__cloudflare-context__")]) {
    return true;
  }
  if (typeof (globalThis as { Cloudflare?: unknown }).Cloudflare !== "undefined") {
    return true;
  }
  if (typeof (globalThis as { WebSocketPair?: unknown }).WebSocketPair !== "undefined") {
    return true;
  }
  return false;
}
