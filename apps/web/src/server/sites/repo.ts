import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { isDatabaseAvailable } from "@/server/db/ready";
import {
  audits,
  auditIssues,
  pages,
  sites,
  workspaces,
} from "@/server/db/schema";
import type { CrawlResult } from "@/server/crawler";
import {
  fileEnsureSite,
  fileGetSite,
  fileGetSiteByUrl,
  fileLatestAudit,
  fileListSites,
  fileSaveAudit,
  siteKeyFromUrl,
  type AuditRecord,
  type SiteRecord,
} from "./file-store";

async function ensureWorkspaceId(): Promise<string | null> {
  if (!(await isDatabaseAvailable())) return null;
  const existing = await db.select().from(workspaces).limit(1);
  if (existing[0]) return existing[0].id;
  const [row] = await db
    .insert(workspaces)
    .values({ name: "Default" })
    .returning({ id: workspaces.id });
  return row?.id ?? null;
}

export async function ensureSite(
  url: string,
  name?: string,
): Promise<SiteRecord> {
  const key = siteKeyFromUrl(url);
  const displayName = name ?? (() => {
    try {
      return new URL(key).hostname;
    } catch {
      return key;
    }
  })();

  if (await isDatabaseAvailable()) {
    try {
      const workspaceId = await ensureWorkspaceId();
      if (workspaceId) {
        const found = await db.select().from(sites).where(eq(sites.url, key)).limit(1);
        if (found[0]) {
          const row = found[0];
          return {
            id: row.id,
            workspaceId: row.workspaceId,
            url: row.url,
            name: row.name,
            status: row.status,
            settings: (row.settings as Record<string, unknown>) ?? {},
            createdAt: row.createdAt.toISOString(),
            lastCrawlAt: null,
            lastAuditId: null,
            lastScores: null,
          };
        }
        const [row] = await db
          .insert(sites)
          .values({
            workspaceId,
            url: key,
            name: displayName,
            status: "pending",
          })
          .returning();
        if (row) {
          // also mirror to file for dashboard when db later drops
          await fileEnsureSite(key, displayName);
          return {
            id: row.id,
            workspaceId: row.workspaceId,
            url: row.url,
            name: row.name,
            status: row.status,
            settings: (row.settings as Record<string, unknown>) ?? {},
            createdAt: row.createdAt.toISOString(),
            lastCrawlAt: null,
            lastAuditId: null,
            lastScores: null,
          };
        }
      }
    } catch (err) {
      console.warn("[sites] db ensureSite failed, using file store", err);
    }
  }

  return fileEnsureSite(key, displayName);
}

export async function getSiteByUrl(url: string): Promise<SiteRecord | null> {
  const key = siteKeyFromUrl(url);
  if (await isDatabaseAvailable()) {
    try {
      const found = await db.select().from(sites).where(eq(sites.url, key)).limit(1);
      if (found[0]) {
        const row = found[0];
        return {
          id: row.id,
          workspaceId: row.workspaceId,
          url: row.url,
          name: row.name,
          status: row.status,
          settings: (row.settings as Record<string, unknown>) ?? {},
          createdAt: row.createdAt.toISOString(),
          lastCrawlAt: null,
          lastAuditId: null,
          lastScores: null,
        };
      }
    } catch {
      // fall through
    }
  }
  return fileGetSiteByUrl(key);
}

export async function listSites(): Promise<SiteRecord[]> {
  if (await isDatabaseAvailable()) {
    try {
      const rows = await db.select().from(sites);
      if (rows.length) {
        return rows.map((row) => ({
          id: row.id,
          workspaceId: row.workspaceId,
          url: row.url,
          name: row.name,
          status: row.status,
          settings: (row.settings as Record<string, unknown>) ?? {},
          createdAt: row.createdAt.toISOString(),
          lastCrawlAt: null,
          lastAuditId: null,
          lastScores: null,
        }));
      }
    } catch {
      // fall through
    }
  }
  return fileListSites();
}

export async function persistCrawlResult(
  site: SiteRecord,
  crawl: CrawlResult,
): Promise<{ audit: AuditRecord; persistedTo: "postgres" | "file" }> {
  const auditId = `audit_${Date.now()}`;

  if (await isDatabaseAvailable()) {
    try {
      // Prefer UUID site ids from postgres
      let siteId = site.id;
      if (!/^[0-9a-f-]{36}$/i.test(siteId)) {
        const ensured = await ensureSite(site.url, site.name);
        siteId = ensured.id;
      }

      const [auditRow] = await db
        .insert(audits)
        .values({
          siteId,
          type: "full",
          status: "done",
          scores: crawl.scores,
          summary: crawl.summary,
          startedAt: new Date(crawl.startedAt),
          finishedAt: new Date(crawl.finishedAt),
        })
        .returning();

      if (!auditRow) throw new Error("audit insert failed");

      for (const page of crawl.pages) {
        await db
          .insert(pages)
          .values({
            siteId,
            url: page.url,
            path: page.path,
            statusCode: page.statusCode,
            title: page.title,
            metaDescription: page.metaDescription,
            h1: page.h1,
            canonical: page.canonical,
            indexable: page.indexable,
            wordCount: page.wordCount,
            hasSchema: page.hasSchema,
            lastCrawledAt: new Date(crawl.finishedAt),
            rawSignals: page.rawSignals,
            geoSignals: page.geoSignals,
          })
          .onConflictDoUpdate({
            target: [pages.siteId, pages.url],
            set: {
              statusCode: page.statusCode,
              title: page.title,
              metaDescription: page.metaDescription,
              h1: page.h1,
              canonical: page.canonical,
              indexable: page.indexable,
              wordCount: page.wordCount,
              hasSchema: page.hasSchema,
              lastCrawledAt: new Date(crawl.finishedAt),
              rawSignals: page.rawSignals,
              geoSignals: page.geoSignals,
            },
          });
      }

      const pageRows = await db
        .select({ id: pages.id, url: pages.url })
        .from(pages)
        .where(eq(pages.siteId, siteId));
      const pageIdByUrl = new Map(pageRows.map((p) => [p.url, p.id]));

      if (crawl.issues.length) {
        await db.insert(auditIssues).values(
          crawl.issues.map((issue) => ({
            auditId: auditRow.id,
            pageId: pageIdByUrl.get(issue.pageUrl) ?? null,
            code: issue.code,
            severity: issue.severity,
            message: issue.message,
            context: issue.context,
          })),
        );
      }

      await db
        .update(sites)
        .set({ status: "active" })
        .where(eq(sites.id, siteId));

      const audit: AuditRecord = {
        id: auditRow.id,
        siteId,
        type: "full",
        status: "done",
        scores: crawl.scores,
        summary: crawl.summary,
        startedAt: crawl.startedAt,
        finishedAt: crawl.finishedAt,
        pageCount: crawl.pages.length,
        issueCount: crawl.issues.length,
        warning: crawl.warning,
      };

      // mirror summary to file for dashboard fallback
      const fileSite = await fileEnsureSite(site.url, site.name);
      await fileSaveAudit(
        fileSite.id,
        {
          id: auditId,
          type: "full",
          status: "done",
          scores: crawl.scores,
          summary: crawl.summary,
          startedAt: crawl.startedAt,
          finishedAt: crawl.finishedAt,
          pageCount: crawl.pages.length,
          issueCount: crawl.issues.length,
          warning: crawl.warning,
        },
        crawl.scores,
      );

      return { audit, persistedTo: "postgres" };
    } catch (err) {
      console.warn("[sites] persistCrawl postgres failed", err);
    }
  }

  const fileSite = await fileEnsureSite(site.url, site.name);
  const audit = await fileSaveAudit(
    fileSite.id,
    {
      id: auditId,
      type: "full",
      status: "done",
      scores: crawl.scores,
      summary: crawl.summary,
      startedAt: crawl.startedAt,
      finishedAt: crawl.finishedAt,
      pageCount: crawl.pages.length,
      issueCount: crawl.issues.length,
      warning: crawl.warning,
    },
    crawl.scores,
  );
  return { audit, persistedTo: "file" };
}

export async function getLatestAuditForUrl(
  url: string,
): Promise<{ site: SiteRecord; audit: AuditRecord } | null> {
  const site =
    (await getSiteByUrl(url)) ?? (await fileGetSiteByUrl(siteKeyFromUrl(url)));
  if (!site) return null;

  if (await isDatabaseAvailable() && /^[0-9a-f-]{36}$/i.test(site.id)) {
    try {
      const [latest] = await db
        .select()
        .from(audits)
        .where(eq(audits.siteId, site.id))
        .orderBy(desc(audits.startedAt))
        .limit(1);
      if (latest) {
        return {
          site,
          audit: {
            id: latest.id,
            siteId: latest.siteId,
            type: latest.type,
            status: latest.status,
            scores: (latest.scores as Record<string, number>) ?? {},
            summary: (latest.summary as Record<string, number>) ?? {},
            startedAt: latest.startedAt?.toISOString() ?? new Date().toISOString(),
            finishedAt: latest.finishedAt?.toISOString() ?? null,
            pageCount: Number(
              (latest.summary as Record<string, number>)?.pages ?? 0,
            ),
            issueCount: Number(
              ((latest.summary as Record<string, number>)?.critical ?? 0) +
                ((latest.summary as Record<string, number>)?.warning ?? 0) +
                ((latest.summary as Record<string, number>)?.info ?? 0),
            ),
            warning: null,
          },
        };
      }
    } catch {
      // fall through
    }
  }

  const fileSite = (await fileGetSiteByUrl(siteKeyFromUrl(url))) ?? site;
  const resolved = (await fileGetSite(fileSite.id)) ?? fileSite;
  const audit = await fileLatestAudit(resolved.id);
  if (!audit) return null;
  return { site: resolved, audit };
}

export { siteKeyFromUrl };
