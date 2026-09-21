export function isCloudflareRuntime(): boolean {
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
  return false;
}
