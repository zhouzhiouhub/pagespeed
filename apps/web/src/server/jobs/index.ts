import { composeDailyAdvice } from "@/server/agents/advice";
import { enqueueCrawl } from "@/server/crawler";
import { runGa4PageReport } from "@/server/ga4/client";
import { readGa4Store, writeGa4Store } from "@/server/ga4/store";
import { getGoogleAccessToken } from "@/server/google/tokens";
import { persistGa4DailyRows } from "@/server/insights/metrics-persist";
import {
  draftsFromCrawl,
  draftsFromKeywordOps,
  persistOpportunities,
} from "@/server/insights/opportunities-store";
import { buildPageTrafficIndex } from "@/server/insights/traffic-impact";
import { buildKeywordOpportunities } from "@/server/keywords/opportunities";
import { extractPageSignals } from "@/server/keywords/extract";
import { fetchText } from "@/server/http/fetch";
import { ensureSite, persistCrawlResult } from "@/server/sites/repo";
import { siteKeyFromUrl } from "@/server/sites/file-store";

export const JOB_NAMES = [
  "crawl.full",
  "crawl.delta",
  "sync.ga4",
  "insights.opportunities",
  "advice.daily",
] as const;

export type JobName = (typeof JOB_NAMES)[number];

export type JobResult = {
  accepted: boolean;
  name: JobName;
  ok: boolean;
  detail: Record<string, unknown>;
  error?: string;
};

async function runCrawlFull(payload: Record<string, unknown>): Promise<JobResult> {
  const seedUrl = String(payload.seedUrl ?? payload.url ?? "");
  if (!seedUrl) {
    return {
      accepted: true,
      name: "crawl.full",
      ok: false,
      detail: {},
      error: "missing seedUrl",
    };
  }
  const maxPages =
    typeof payload.maxPages === "number" ? payload.maxPages : undefined;
  const site = await ensureSite(seedUrl);
  const { jobId, result } = await enqueueCrawl({
    siteId: site.id,
    seedUrl,
    maxPages,
  });
  const persisted = await persistCrawlResult(site, result);

  const ga4 = await readGa4Store();
  const traffic = buildPageTrafficIndex({ ga4 });
  const opp = await persistOpportunities(
    seedUrl,
    draftsFromCrawl(result, traffic),
  );
  return {
    accepted: true,
    name: "crawl.full",
    ok: true,
    detail: {
      jobId,
      siteId: persisted.audit.siteId,
      auditId: persisted.audit.id,
      persistedTo: persisted.persistedTo,
      pages: result.pages.length,
      issues: result.issues.length,
      scores: result.scores,
      warning: result.warning,
      opportunitiesPersist: opp,
    },
  };
}

async function runAdviceDaily(
  payload: Record<string, unknown>,
): Promise<JobResult> {
  const url = String(payload.url ?? payload.siteUrl ?? "");
  if (!url) {
    return {
      accepted: true,
      name: "advice.daily",
      ok: false,
      detail: {},
      error: "missing url",
    };
  }
  const run = await composeDailyAdvice(url, { force: Boolean(payload.force) });
  return {
    accepted: true,
    name: "advice.daily",
    ok: true,
    detail: {
      runId: run.runId,
      siteUrl: run.siteUrl,
      itemCount: run.items.length,
      headline: run.headline,
      sources: run.sources,
    },
  };
}

async function runSyncGa4(payload: Record<string, unknown>): Promise<JobResult> {
  const store = await readGa4Store();
  const propertyId =
    (typeof payload.propertyId === "string" && payload.propertyId) ||
    store.selectedPropertyId;
  if (!propertyId) {
    return {
      accepted: true,
      name: "sync.ga4",
      ok: false,
      detail: { hint: "Select a GA4 property in Dashboard first." },
      error: "no GA4 property selected",
    };
  }

  const token = await getGoogleAccessToken({ requireScope: "ga4" });
  if (!token.accessToken) {
    return {
      accepted: true,
      name: "sync.ga4",
      ok: false,
      detail: {},
      error: token.error ?? "no offline google token",
    };
  }

  const siteUrl =
    (typeof payload.url === "string" && payload.url) || store.siteUrl;
  const report = await runGa4PageReport(token.accessToken, propertyId, 7);
  const next = {
    selectedPropertyId: propertyId,
    selectedPropertyName: store.selectedPropertyName,
    siteUrl,
    lastSyncedAt: new Date().toISOString(),
    sessions7d: report.sessions7d,
    users7d: report.users7d,
    rows: report.rows,
    topPages: report.topPages,
  };
  await writeGa4Store(next);

  const metricsPersist = siteUrl
    ? await persistGa4DailyRows(siteUrl, next)
    : { rows: 0, persistedTo: "none" as const };

  return {
    accepted: true,
    name: "sync.ga4",
    ok: true,
    detail: {
      propertyId,
      siteUrl,
      lastSyncedAt: next.lastSyncedAt,
      sessions7d: next.sessions7d,
      users7d: next.users7d,
      rowCount: next.rows.length,
      tokenSource: token.source,
      metricsPersist,
    },
  };
}

async function runInsightsOpportunities(
  payload: Record<string, unknown>,
): Promise<JobResult> {
  const url = String(payload.url ?? "");
  if (!url) {
    return {
      accepted: true,
      name: "insights.opportunities",
      ok: false,
      detail: {},
      error: "missing url",
    };
  }

  const drafts = [];

  try {
    const page = await fetchText(url, { timeoutMs: 25_000 });
    if (page.ok) {
      const signals = extractPageSignals(page.finalUrl || url, page.text);
      const kw = await buildKeywordOpportunities(url, signals);
      drafts.push(...draftsFromKeywordOps(kw.items));
    }
  } catch {
    // ignore page fetch
  }

  const persisted = await persistOpportunities(url, drafts);
  return {
    accepted: true,
    name: "insights.opportunities",
    ok: true,
    detail: {
      count: persisted.count,
      persistedTo: persisted.persistedTo,
    },
  };
}

/**
 * In-process job runner (M1–M2). Swap body for Inngest/BullMQ later.
 */
export async function enqueueJob(
  name: JobName,
  payload: Record<string, unknown> = {},
): Promise<JobResult> {
  console.info("[jobs] run", name, {
    ...payload,
    url: payload.url ? siteKeyFromUrl(String(payload.url)) : undefined,
  });

  try {
    switch (name) {
      case "crawl.full":
      case "crawl.delta":
        return await runCrawlFull(payload);
      case "advice.daily":
        return await runAdviceDaily(payload);
      case "sync.ga4":
        return await runSyncGa4(payload);
      case "insights.opportunities":
        return await runInsightsOpportunities(payload);
      default:
        return {
          accepted: false,
          name,
          ok: false,
          detail: {},
          error: "unknown job",
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[jobs] failed", name, message);
    return {
      accepted: true,
      name,
      ok: false,
      detail: {},
      error: message,
    };
  }
}
