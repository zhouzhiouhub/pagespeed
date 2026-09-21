/**
 * Detect Cloudflare Workers / workerd (OpenNext production).
 *
 * `next dev` still loads `@opennextjs/cloudflare` shims and may even inherit
 * wrangler `vars.CLOUDFLARE=1`. Those must NOT disable HTTPS_PROXY / Clash.
 */
export function isCloudflareRuntime(): boolean {
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

  if (process.env.CLOUDFLARE === "1") return true;
  if (process.env.NEXT_RUNTIME_CLOUDFLARE === "1") return true;
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
