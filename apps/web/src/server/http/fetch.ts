import { Agent, ProxyAgent, fetch as undiciFetch } from "undici";

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

export function getHttpDispatcher(): Dispatcher {
  const proxy = resolveProxyUrl();
  if (shared && sharedProxy === proxy) return shared;
  shared?.close().catch(() => undefined);
  sharedProxy = proxy;
  shared = proxy
    ? new ProxyAgent(proxy)
    : new Agent({
        connectTimeout: 30_000,
        headersTimeout: 60_000,
        bodyTimeout: 60_000,
      });
  return shared;
}

export async function fetchText(
  url: string,
  init?: { timeoutMs?: number },
): Promise<{ ok: boolean; status: number; text: string; finalUrl: string }> {
  const timeoutMs = init?.timeoutMs ?? 25_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await undiciFetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      dispatcher: getHttpDispatcher(),
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
