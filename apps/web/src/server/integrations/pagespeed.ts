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

function createDispatcher() {
  const proxy = resolveProxyUrl();
  if (proxy) {
    return new ProxyAgent(proxy);
  }
  return new Agent({
    connectTimeout: 60_000,
    headersTimeout: 120_000,
    bodyTimeout: 120_000,
  });
}

function formatFetchError(err: unknown): string {
  if (!(err instanceof Error)) return "PageSpeed 请求失败";
  const cause = err.cause as { code?: string; message?: string } | undefined;
  const code = cause?.code ?? (err as Error & { code?: string }).code;
  if (code === "UND_ERR_CONNECT_TIMEOUT" || /timeout/i.test(err.message)) {
    return "连接 Google PageSpeed API 超时。若在国内网络，请在 .env.local 设置 HTTPS_PROXY（或 PAGESPEED_HTTP_PROXY）后重启。";
  }
  return cause?.message || err.message || "PageSpeed 请求失败";
}

export async function runPageSpeed(
  url: string,
  strategy: PsiStrategy = "mobile",
): Promise<PsiSummary> {
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

  let res: Awaited<ReturnType<typeof undiciFetch>>;
  try {
    res = await undiciFetch(endpoint, {
      method: "GET",
      dispatcher: createDispatcher(),
    });
  } catch (err) {
    throw new Error(formatFetchError(err));
  }

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
}
