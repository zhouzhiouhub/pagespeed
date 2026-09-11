import { Agent, ProxyAgent, fetch as undiciFetch } from "undici";

export type PsiStrategy = "mobile" | "desktop";

export type PsiCategoryScore = {
  id: string;
  title: string;
  score: number | null;
};

export type PsiMetric = {
  id: string;
  title: string;
  displayValue: string | null;
  score: number | null;
};

export type PsiSummary = {
  url: string;
  strategy: PsiStrategy;
  fetchTime: string | null;
  scores: PsiCategoryScore[];
  metrics: PsiMetric[];
  seoAudits: Array<{
    id: string;
    title: string;
    description: string | null;
    score: number | null;
    displayValue: string | null;
  }>;
};

type PsiApiResponse = {
  id?: string;
  lighthouseResult?: {
    fetchTime?: string;
    categories?: Record<
      string,
      { id?: string; title?: string; score?: number | null }
    >;
    audits?: Record<
      string,
      {
        id?: string;
        title?: string;
        description?: string;
        score?: number | null;
        displayValue?: string;
        details?: { type?: string };
      }
    >;
  };
  error?: { message?: string; code?: number };
};

const METRIC_IDS = [
  "first-contentful-paint",
  "largest-contentful-paint",
  "total-blocking-time",
  "cumulative-layout-shift",
  "speed-index",
  "interactive",
] as const;

const SEO_AUDIT_IDS = new Set([
  "meta-description",
  "document-title",
  "crawlable-anchors",
  "is-crawlable",
  "robots-txt",
  "hreflang",
  "canonical",
  "link-text",
  "image-alt",
  "http-status-code",
  "viewport",
]);

const MAX_ATTEMPTS = 3;

function requireApiKey(): string {
  const key = process.env.PAGESPEED_API_KEY?.trim();
  if (!key) {
    throw new Error("PAGESPEED_API_KEY is not configured");
  }
  return key;
}

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

let sharedDispatcher: Dispatcher | null = null;
let sharedDispatcherProxy: string | null | undefined;

function getDispatcher(): Dispatcher {
  const proxy = resolveProxyUrl();
  if (sharedDispatcher && sharedDispatcherProxy === proxy) {
    return sharedDispatcher;
  }

  sharedDispatcher?.close().catch(() => undefined);
  sharedDispatcherProxy = proxy;
  sharedDispatcher = proxy
    ? new ProxyAgent(proxy)
    : new Agent({
        connectTimeout: 60_000,
        headersTimeout: 120_000,
        bodyTimeout: 120_000,
      });
  return sharedDispatcher;
}

function resetDispatcher() {
  sharedDispatcher?.close().catch(() => undefined);
  sharedDispatcher = null;
  sharedDispatcherProxy = undefined;
}

function isTransientNetworkError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error ? err.cause : undefined;
  const causeMessage =
    cause instanceof Error
      ? cause.message
      : typeof cause === "object" && cause && "message" in cause
        ? String((cause as { message?: unknown }).message)
        : "";
  const code =
    typeof cause === "object" && cause && "code" in cause
      ? String((cause as { code?: unknown }).code)
      : err instanceof Error && "code" in err
        ? String((err as Error & { code?: unknown }).code)
        : "";

  const haystack = `${message} ${causeMessage} ${code}`.toLowerCase();
  return (
    haystack.includes("timeout") ||
    haystack.includes("tls") ||
    haystack.includes("socket") ||
    haystack.includes("econnreset") ||
    haystack.includes("econnrefused") ||
    haystack.includes("und_err") ||
    haystack.includes("fetch failed") ||
    haystack.includes("network")
  );
}

function formatFetchError(err: unknown): string {
  if (!(err instanceof Error)) return "PageSpeed 请求失败";
  const cause = err.cause as { code?: string; message?: string } | undefined;
  const detail = cause?.message || err.message || "PageSpeed 请求失败";

  if (/tls|socket disconnected|secure tls/i.test(detail)) {
    return `连接 Google 时 TLS 中断（多为本地代理不稳定）。请确认 Clash 等代理已开启且端口与 .env.local 中 HTTPS_PROXY 一致，然后重试。详情：${detail}`;
  }
  if (
    cause?.code === "UND_ERR_CONNECT_TIMEOUT" ||
    /timeout/i.test(detail)
  ) {
    return "连接 Google PageSpeed API 超时。请检查 HTTPS_PROXY / PAGESPEED_HTTP_PROXY 后重试。";
  }
  return detail;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPageSpeedRaw(url: string, strategy: PsiStrategy) {
  const key = requireApiKey();
  const endpoint = new URL(
    "https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
  );
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("strategy", strategy);
  endpoint.searchParams.set("locale", "zh-CN");
  endpoint.searchParams.set("key", key);
  for (const category of [
    "performance",
    "seo",
    "accessibility",
    "best-practices",
  ]) {
    endpoint.searchParams.append("category", category);
  }

  return undiciFetch(endpoint, {
    method: "GET",
    dispatcher: getDispatcher(),
  });
}

export async function runPageSpeed(
  url: string,
  strategy: PsiStrategy = "mobile",
): Promise<PsiSummary> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetchPageSpeedRaw(url, strategy);
      const data = (await res.json()) as PsiApiResponse;

      if (!res.ok || data.error) {
        throw new Error(
          data.error?.message ?? `PageSpeed API failed (${res.status})`,
        );
      }

      const lighthouse = data.lighthouseResult;
      if (!lighthouse) {
        throw new Error("PageSpeed API returned no lighthouseResult");
      }

      const scores: PsiCategoryScore[] = Object.values(
        lighthouse.categories ?? {},
      ).map((c) => ({
        id: c.id ?? "",
        title: c.title ?? c.id ?? "",
        score: typeof c.score === "number" ? Math.round(c.score * 100) : null,
      }));

      const audits = lighthouse.audits ?? {};
      const metrics: PsiMetric[] = METRIC_IDS.map((id) => {
        const a = audits[id];
        return {
          id,
          title: a?.title ?? id,
          displayValue: a?.displayValue ?? null,
          score: typeof a?.score === "number" ? a.score : null,
        };
      });

      const failedUseful = Object.values(audits)
        .filter(
          (a) =>
            typeof a.score === "number" &&
            a.score < 1 &&
            Boolean(a.title) &&
            a.details?.type !== "debugdata",
        )
        .filter((a) => {
          const id = a.id ?? "";
          return id.includes("seo") || SEO_AUDIT_IDS.has(id);
        })
        .slice(0, 10)
        .map((a) => ({
          id: a.id ?? "",
          title: a.title ?? "",
          description: a.description ?? null,
          score: typeof a.score === "number" ? a.score : null,
          displayValue: a.displayValue ?? null,
        }));

      return {
        url: data.id ?? url,
        strategy,
        fetchTime: lighthouse.fetchTime ?? null,
        scores,
        metrics,
        seoAudits: failedUseful,
      };
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS && isTransientNetworkError(err)) {
        resetDispatcher();
        await sleep(800 * attempt);
        continue;
      }
      break;
    }
  }

  throw new Error(formatFetchError(lastError));
}
