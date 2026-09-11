import { composeDailyAdvice } from "@/server/agents/advice";
import { enqueueCrawl } from "@/server/crawler";
import { readGscStore } from "@/server/gsc/store";
import { ensureSite, persistCrawlResult } from "@/server/sites/repo";
import { siteKeyFromUrl } from "@/server/sites/file-store";

export const JOB_NAMES = [
  "crawl.full",
  "crawl.delta",
  "sync.gsc",
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

async function runSyncGsc(payload: Record<string, unknown>): Promise<JobResult> {
  // Token-bound sync stays on /api/gsc/sync; cron refreshes from existing store snapshot.
  const store = await readGscStore();
  const property =
    (typeof payload.property === "string" && payload.property) ||
    store.selectedProperty;
  if (!property) {
    return {
      accepted: true,
      name: "sync.gsc",
      ok: false,
      detail: { hint: "Connect GSC via UI first; cron cannot refresh without OAuth session." },
      error: "no GSC property selected",
    };
  }
  return {
    accepted: true,
    name: "sync.gsc",
    ok: true,
    detail: {
      mode: "snapshot",
      property,
      siteUrl: store.siteUrl,
      lastSyncedAt: store.lastSyncedAt,
      rowCount: store.rows.length,
      opportunityCount: store.opportunities.length,
      note: "Full re-sync requires user OAuth; use POST /api/gsc/sync while signed in.",
    },
  };
}

async function runSyncGa4(payload: Record<string, unknown>): Promise<JobResult> {
  void payload;
  return {
    accepted: true,
    name: "sync.ga4",
    ok: false,
    detail: {
      connected: false,
      note: "GA4 OAuth + Data API wiring is scaffolded; connect GA4 to enable daily sync.",
    },
    error: "ga4 not connected",
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
      case "sync.gsc":
        return await runSyncGsc(payload);
      case "sync.ga4":
        return await runSyncGa4(payload);
      case "insights.opportunities":
        return {
          accepted: true,
          name,
          ok: true,
          detail: {
            note: "Opportunities are derived on-demand from crawl/GSC/GEO APIs in V1.",
          },
        };
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
