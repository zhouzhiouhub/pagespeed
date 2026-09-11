import { Agent, ProxyAgent, fetch as undiciFetch } from "undici";
import { applyProxyDispatcher } from "@/server/http/proxy-bootstrap";
import { isCloudflareRuntime } from "@/server/runtime";

applyProxyDispatcher();

function resolveProxyUrl(): string | null {
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

type Dispatcher = Agent | ProxyAgent;
let shared: Dispatcher | null = null;
let sharedProxy: string | null | undefined;

export function resetHttpDispatcher() {
  shared?.close().catch(() => undefined);
  shared = null;
  sharedProxy = undefined;
}

export function getHttpDispatcher(): Dispatcher | undefined {
  if (isCloudflareRuntime()) return undefined;

  const proxy = resolveProxyUrl();
  if (shared && sharedProxy === proxy) return shared;
  resetHttpDispatcher();
  sharedProxy = proxy;
  shared = proxy
    ? new ProxyAgent({
        uri: proxy,
        requestTls: { timeout: 60_000 },
        proxyTls: { timeout: 60_000 },
      })
    : new Agent({
        connectTimeout: 60_000,
        headersTimeout: 120_000,
        bodyTimeout: 120_000,
      });
  return shared;
}

function isTransient(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.message} ${err.cause ?? ""}` : String(err);
  return /tls|socket|timeout|econnreset|econnrefused|und_err|fetch failed|network|alpn/i.test(
    msg,
  );
}

export async function proxiedFetch(
  url: string | URL,
  init?: RequestInit & { dispatcher?: Dispatcher },
) {
  // Workers: use platform fetch (no undici TLS / ALPNProtocols).
  if (isCloudflareRuntime()) {
    return fetch(url, init);
  }

  applyProxyDispatcher();
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const dispatcher = getHttpDispatcher();
      return await undiciFetch(url, {
        ...init,
        ...(dispatcher ? { dispatcher } : {}),
      } as Parameters<typeof undiciFetch>[1]);
    } catch (err) {
      lastError = err;
      if (attempt < 3 && isTransient(err)) {
        resetHttpDispatcher();
        await new Promise((r) => setTimeout(r, 700 * attempt));
        continue;
      }
      break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function fetchText(
  url: string,
  init?: { timeoutMs?: number },
): Promise<{ ok: boolean; status: number; text: string; finalUrl: string }> {
  const timeoutMs = init?.timeoutMs ?? 25_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await proxiedFetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          process.env.CRAWLER_USER_AGENT ??
          "WebagentBot/0.1 (+https://localhost)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      text,
      finalUrl: res.url || url,
    };
  } finally {
    clearTimeout(timer);
  }
}
