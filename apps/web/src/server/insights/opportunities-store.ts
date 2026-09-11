import { eq } from "drizzle-orm";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/server/db";
import { isDatabaseAvailable } from "@/server/db/ready";
import {
  opportunities,
  opportunityEvidence,
} from "@/server/db/schema";
import { ensureSite } from "@/server/sites/repo";
import type { CrawlResult } from "@/server/crawler";
import type { KeywordOpportunity } from "@/server/keywords/opportunities";
import type { GscStore } from "@/server/gsc/store";

export type OpportunityDraft = {
  type:
    | "keyword"
    | "content_gap"
    | "tech_seo"
    | "geo_readiness"
    | "geo_citation"
    | "geo_asset"
    | "cro"
    | "competitor";
  title: string;
  description: string;
  query?: string | null;
  pageUrl?: string | null;
  score?: number | null;
  impact?: number | null;
  confidence?: number | null;
  effort?: number | null;
  payload?: Record<string, unknown>;
  evidence?: Array<{
    kind:
      | "gsc_row"
      | "ga_row"
      | "page_snapshot"
      | "geo_signal"
      | "geo_probe"
      | "rule"
      | "competitor_url";
    ref: Record<string, unknown>;
  }>;
};

type FileOppStore = {
  bySite: Record<
    string,
    {
      updatedAt: string;
      items: Array<OpportunityDraft & { id: string }>;
    }
  >;
};

function filePath() {
  return path.join(process.cwd(), ".data", "opportunities-store.json");
}

async function readFileStore(): Promise<FileOppStore> {
  try {
    const raw = await readFile(filePath(), "utf8");
    return { bySite: {}, ...(JSON.parse(raw) as Partial<FileOppStore>) };
  } catch {
    return { bySite: {} };
  }
}

async function writeFileStore(next: FileOppStore) {
  const dir = path.dirname(filePath());
  await mkdir(dir, { recursive: true });
  await writeFile(filePath(), JSON.stringify(next, null, 2), "utf8");
}

export function draftsFromGsc(store: GscStore): OpportunityDraft[] {
  return store.opportunities.map((op) => ({
    type: "keyword" as const,
    title: `关键词「${op.query}」可抢位`,
    description: op.rationale,
    query: op.query,
    pageUrl: op.page,
    score: op.potential,
    impact: op.potential,
    confidence: 0.7,
    effort: 3,
    payload: { ...op },
    evidence: [
      {
        kind: "gsc_row" as const,
        ref: {
          query: op.query,
          page: op.page,
          position: op.position,
          source: "gsc",
        },
      },
    ],
  }));
}

export function draftsFromKeywordOps(
  items: KeywordOpportunity[],
): OpportunityDraft[] {
  return items.map((op) => ({
    type: "keyword" as const,
    title: `关键词机会「${op.query}」`,
    description: op.rationale,
    query: op.query,
    pageUrl: op.page,
    score: op.potential,
    impact: op.potential,
    confidence: op.source === "gsc" ? 0.75 : 0.45,
    effort: 3,
    payload: { ...op },
    evidence: [
      {
        kind: op.source === "gsc" ? ("gsc_row" as const) : ("rule" as const),
        ref: { query: op.query, page: op.page, source: op.source },
      },
    ],
  }));
}

export function draftsFromCrawl(crawl: CrawlResult): OpportunityDraft[] {
  return crawl.issues
    .filter((i) => i.severity === "critical" || i.severity === "warning")
    .slice(0, 40)
    .map((issue) => ({
      type: (issue.code.startsWith("geo_")
        ? "geo_readiness"
        : "tech_seo") as OpportunityDraft["type"],
      title: issue.message,
      description: `${issue.code} on ${issue.pageUrl}`,
      pageUrl: issue.pageUrl,
      score: issue.severity === "critical" ? 5 : 3,
      impact: issue.severity === "critical" ? 4 : 2,
      confidence: 0.8,
      effort: 2,
      payload: { code: issue.code, severity: issue.severity, ...issue.context },
      evidence: [
        {
          kind: "rule" as const,
          ref: { code: issue.code, page: issue.pageUrl, context: issue.context },
        },
      ],
    }));
}

export async function persistOpportunities(
  siteUrl: string,
  drafts: OpportunityDraft[],
): Promise<{ count: number; persistedTo: "postgres" | "file" }> {
  const items = drafts.slice(0, 80);
  const file = await readFileStore();
  file.bySite[siteUrl] = {
    updatedAt: new Date().toISOString(),
    items: items.map((d, i) => ({
      ...d,
      id: `opp_${Date.now()}_${i}`,
    })),
  };
  await writeFileStore(file);

  if (!(await isDatabaseAvailable())) {
    return { count: items.length, persistedTo: "file" };
  }

  try {
    const site = await ensureSite(siteUrl);
    if (!/^[0-9a-f-]{36}$/i.test(site.id)) {
      return { count: items.length, persistedTo: "file" };
    }

    // Replace open auto-detected opps for this site (keep planned/done/dismissed)
    const existing = await db
      .select({ id: opportunities.id, status: opportunities.status })
      .from(opportunities)
      .where(eq(opportunities.siteId, site.id));
    const openIds = existing.filter((e) => e.status === "open").map((e) => e.id);
    for (const id of openIds) {
      await db.delete(opportunityEvidence).where(eq(opportunityEvidence.opportunityId, id));
      await db.delete(opportunities).where(eq(opportunities.id, id));
    }

    for (const draft of items) {
      const [row] = await db
        .insert(opportunities)
        .values({
          siteId: site.id,
          type: draft.type,
          status: "open",
          title: draft.title,
          description: draft.description,
          query: draft.query ?? null,
          score: draft.score != null ? String(draft.score) : null,
          impact: draft.impact != null ? String(draft.impact) : null,
          confidence: draft.confidence != null ? String(draft.confidence) : null,
          effort: draft.effort != null ? String(draft.effort) : null,
          payload: {
            ...(draft.payload ?? {}),
            pageUrl: draft.pageUrl ?? null,
          },
        })
        .returning({ id: opportunities.id });

      if (row && draft.evidence?.length) {
        await db.insert(opportunityEvidence).values(
          draft.evidence.map((e) => ({
            opportunityId: row.id,
            kind: e.kind,
            ref: e.ref,
          })),
        );
      }
    }

    return { count: items.length, persistedTo: "postgres" };
  } catch (err) {
    console.warn("[opportunities] db persist failed", err);
    return { count: items.length, persistedTo: "file" };
  }
}

export async function listPersistedOpportunities(siteUrl: string) {
  const file = await readFileStore();
  const local = file.bySite[siteUrl] ?? null;

  if (await isDatabaseAvailable()) {
    try {
      const site = await ensureSite(siteUrl);
      if (/^[0-9a-f-]{36}$/i.test(site.id)) {
        const rows = await db
          .select()
          .from(opportunities)
          .where(eq(opportunities.siteId, site.id));
        if (rows.length) {
          return {
            source: "postgres" as const,
            updatedAt: new Date().toISOString(),
            items: rows.map((r) => ({
              id: r.id,
              type: r.type,
              status: r.status,
              title: r.title,
              description: r.description,
              query: r.query,
              score: r.score,
              payload: r.payload,
            })),
          };
        }
      }
    } catch {
      // fall through
    }
  }

  return {
    source: "file" as const,
    updatedAt: local?.updatedAt ?? null,
    items: local?.items ?? [],
  };
}
