import {
  EnvHttpProxyAgent,
  ProxyAgent,
  setGlobalDispatcher,
} from "undici";
import { isCloudflareRuntime } from "@/server/runtime";

let appliedKey: string | null = null;

export function resolveProxyUrl(): string | null {
  const candidates = [
    process.env.PAGESPEED_HTTP_PROXY,
    process.env.HTTPS_PROXY,
    process.env.HTTP_PROXY,
    process.env.ALL_PROXY,
  ];
  for (const value of candidates) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/**
 * Make Node/undici `fetch` honor HTTPS_PROXY / HTTP_PROXY.
 * Auth.js Google token exchange and other bare `fetch` calls need this.
 * Re-applies if the proxy URL appears after Next.js loads `.env.local`.
 * No-op on Cloudflare Workers (undici TLS options are unsupported).
 */
export function applyProxyDispatcher() {
  if (typeof window !== "undefined") return;
  if (process.env.CLOUDFLARE === "1" || isCloudflareRuntime()) {
    appliedKey = "cloudflare";
    return;
  }

  const explicit = resolveProxyUrl();
  const key = explicit || "env";
  if (appliedKey === key) return;

  try {
    if (explicit) {
      setGlobalDispatcher(new ProxyAgent(explicit));
    } else {
      setGlobalDispatcher(new EnvHttpProxyAgent());
    }
    appliedKey = key;
  } catch (err) {
    console.warn("[proxy] failed to set global dispatcher", err);
  }
}

applyProxyDispatcher();
