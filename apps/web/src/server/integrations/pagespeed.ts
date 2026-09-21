import { getServerEnv } from "@/server/env";
import {
  proxiedFetch,
  resetHttpDispatcher,
} from "@/server/http/fetch";
import { applyProxyDispatcher } from "@/server/http/proxy-bootstrap";

applyProxyDispatcher();

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

export type PsiOpportunity = {
  id: string;
  title: string;
  description: string | null;
  displayValue: string | null;
  score: number | null;
  category: string;
  categoryTitle: string;
  kind: "opportunity" | "diagnostic" | "fail";
  savingsMs: number | null;
};

export type PsiSummary = {
  url: string;
  strategy: PsiStrategy;
  fetchTime: string | null;
  scores: PsiCategoryScore[];
  metrics: PsiMetric[];
  /** @deprecated use opportunities */
  seoAudits: PsiOpportunity[];
  opportunities: PsiOpportunity[];
};

type LighthouseAudit = {
  id?: string;
  title?: string;
  description?: string;
  score?: number | null;
  scoreDisplayMode?: string;
  displayValue?: string;
  details?: {
    type?: string;
    overallSavingsMs?: number;
  };
};

type LighthouseCategory = {
  id?: string;
  title?: string;
  score?: number | null;
  auditRefs?: Array<{ id?: string; weight?: number; group?: string }>;
};

type PsiApiResponse = {
  id?: string;
  lighthouseResult?: {
    fetchTime?: string;
    categories?: Record<string, LighthouseCategory>;
    audits?: Record<string, LighthouseAudit>;
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

const SKIP_SCORE_MODES = new Set([
  "informative",
  "manual",
  "notApplicable",
  "error",
]);

const MAX_ATTEMPTS = 3;

async function requireApiKey(): Promise<string> {
  const key =
    (await getServerEnv("PAGESPEED_API_KEY")) ||
    (await getServerEnv("GOOGLE_API_KEY"));
  if (!key) {
    throw new Error("PAGESPEED_API_KEY or GOOGLE_API_KEY is not configured");
  }
  return key;
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
    return `连接 Google 时 TLS 中断（多为本地代理不稳定）。请确认 Clash 系统代理/TUN 已开，端口与 .env.local 的 HTTPS_PROXY（当前多为 7897）一致，然后重启 npm run dev 再试。详情：${detail}`;
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

function stripMarkdownLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\s+/g, " ").trim();
}

function collectOpportunities(
  categories: Record<string, LighthouseCategory>,
  audits: Record<string, LighthouseAudit>,
): PsiOpportunity[] {
  const seen = new Set<string>();
  const items: PsiOpportunity[] = [];

  for (const category of Object.values(categories)) {
    const categoryId = category.id ?? "other";
    const categoryTitle = category.title ?? categoryId;

    for (const ref of category.auditRefs ?? []) {
      const auditId = ref.id;
      if (!auditId || seen.has(auditId)) continue;

      const audit = audits[auditId];
      if (!audit?.title) continue;

      const mode = audit.scoreDisplayMode ?? "";
      if (SKIP_SCORE_MODES.has(mode)) continue;

      const group = ref.group ?? "";
      const detailsType = audit.details?.type ?? "";
      const score = typeof audit.score === "number" ? audit.score : null;
      const savingsMs =
        typeof audit.details?.overallSavingsMs === "number"
          ? Math.round(audit.details.overallSavingsMs)
          : null;

      const isOpportunity =
        detailsType === "opportunity" ||
        group === "load-opportunities" ||
        group === "opportunities";
      const isDiagnostic = group === "diagnostics";
      const isFail = score !== null && score < 1;

      // Keep actionable items: savings opportunities, diagnostics, or failed checks
      if (!isOpportunity && !isDiagnostic && !isFail) continue;
      // Skip perfect binary passes
      if (score === 1 && !isOpportunity) continue;
      // Metrics already shown above
      if (group === "metrics" || METRIC_IDS.includes(auditId as (typeof METRIC_IDS)[number])) {
        continue;
      }

      let kind: PsiOpportunity["kind"] = "fail";
      if (isOpportunity) kind = "opportunity";
      else if (isDiagnostic) kind = "diagnostic";

      seen.add(auditId);
      items.push({
        id: auditId,
        title: audit.title,
        description: audit.description
          ? stripMarkdownLinks(audit.description)
          : null,
        displayValue: audit.displayValue ?? null,
        score,
        category: categoryId,
        categoryTitle,
        kind,
        savingsMs,
      });
    }
  }

  const kindRank = { opportunity: 0, diagnostic: 1, fail: 2 } as const;
  items.sort((a, b) => {
    const kindDiff = kindRank[a.kind] - kindRank[b.kind];
    if (kindDiff !== 0) return kindDiff;
    const saveDiff = (b.savingsMs ?? 0) - (a.savingsMs ?? 0);
    if (saveDiff !== 0) return saveDiff;
    return (a.score ?? 1) - (b.score ?? 1);
  });

  return items.slice(0, 40);
}

async function fetchPageSpeedRaw(
  url: string,
  strategy: PsiStrategy,
  locale = "zh-CN",
) {
  const key = await requireApiKey();
  const endpoint = new URL(
    "https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
  );
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("strategy", strategy);
  endpoint.searchParams.set("locale", locale);
  endpoint.searchParams.set("key", key);
  for (const category of [
    "performance",
    "seo",
    "accessibility",
    "best-practices",
  ]) {
    endpoint.searchParams.append("category", category);
  }

  return proxiedFetch(endpoint, {
    method: "GET",
  });
}

export async function runPageSpeed(
  url: string,
  strategy: PsiStrategy = "mobile",
  locale = "zh-CN",
): Promise<PsiSummary> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetchPageSpeedRaw(url, strategy, locale);
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

      const categories = lighthouse.categories ?? {};
      const audits = lighthouse.audits ?? {};

      const scores: PsiCategoryScore[] = Object.values(categories).map((c) => ({
        id: c.id ?? "",
        title: c.title ?? c.id ?? "",
        score: typeof c.score === "number" ? Math.round(c.score * 100) : null,
      }));

      const metrics: PsiMetric[] = METRIC_IDS.map((id) => {
        const a = audits[id];
        return {
          id,
          title: a?.title ?? id,
          displayValue: a?.displayValue ?? null,
          score: typeof a?.score === "number" ? a.score : null,
        };
      });

      const opportunities = collectOpportunities(categories, audits);
      const seoAudits = opportunities.filter((o) => o.category === "seo");

      return {
        url: data.id ?? url,
        strategy,
        fetchTime: lighthouse.fetchTime ?? null,
        scores,
        metrics,
        seoAudits,
        opportunities,
      };
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS && isTransientNetworkError(err)) {
        resetHttpDispatcher();
        await sleep(800 * attempt);
        continue;
      }
      break;
    }
  }

  throw new Error(formatFetchError(lastError));
}
