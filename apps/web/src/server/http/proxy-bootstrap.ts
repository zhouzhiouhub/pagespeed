import {
  EnvHttpProxyAgent,
  ProxyAgent,
  setGlobalDispatcher,
} from "undici";
import { isCloudflareRuntime } from "@/server/runtime";

let applied = false;

/**
 * Make Node/undici `fetch` honor HTTPS_PROXY / HTTP_PROXY.
 * Auth.js Google token exchange and other bare `fetch` calls need this.
 * No-op on Cloudflare Workers (undici TLS options are unsupported).
 */
export function applyProxyDispatcher() {
  if (applied) return;
  if (typeof window !== "undefined") return;
  if (isCloudflareRuntime()) {
    applied = true;
    return;
  }

  const explicit =
    process.env.PAGESPEED_HTTP_PROXY?.trim() ||
    process.env.HTTPS_PROXY?.trim() ||
    process.env.HTTP_PROXY?.trim() ||
    process.env.ALL_PROXY?.trim();

  try {
    if (explicit) {
      setGlobalDispatcher(new ProxyAgent(explicit));
    } else {
      setGlobalDispatcher(new EnvHttpProxyAgent());
    }
    applied = true;
  } catch (err) {
    console.warn("[proxy] failed to set global dispatcher", err);
  }
}

applyProxyDispatcher();
