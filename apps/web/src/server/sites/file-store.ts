import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type SiteRecord = {
  id: string;
  workspaceId: string;
  url: string;
  name: string;
  status: "pending" | "active" | "error";
  settings: Record<string, unknown>;
  createdAt: string;
  lastCrawlAt: string | null;
  lastAuditId: string | null;
  lastScores: Record<string, number> | null;
};

export type AuditRecord = {
  id: string;
  siteId: string;
  type: "full" | "delta";
  status: "running" | "done" | "failed";
  scores: Record<string, number>;
  summary: Record<string, number>;
  startedAt: string;
  finishedAt: string | null;
  pageCount: number;
  issueCount: number;
  warning: string | null;
};

type FileDb = {
  defaultWorkspaceId: string;
  sites: Record<string, SiteRecord>;
  audits: Record<string, AuditRecord>;
  /** siteId -> latest auditId */
  latestAuditBySite: Record<string, string>;
};

const EMPTY: FileDb = {
  defaultWorkspaceId: "local-workspace",
  sites: {},
  audits: {},
  latestAuditBySite: {},
};

function storePath() {
  return path.join(process.cwd(), ".data", "sites-store.json");
}

async function readDb(): Promise<FileDb> {
  try {
    const raw = await readFile(storePath(), "utf8");
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<FileDb>) };
  } catch {
    return { ...EMPTY };
  }
}

async function writeDb(next: FileDb): Promise<void> {
  const dir = path.dirname(storePath());
  await mkdir(dir, { recursive: true });
  await writeFile(storePath(), JSON.stringify(next, null, 2), "utf8");
}

export function siteKeyFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.origin;
  } catch {
    return url;
  }
}

export async function fileEnsureSite(url: string, name?: string): Promise<SiteRecord> {
  const key = siteKeyFromUrl(url);
  const db = await readDb();
  const existing = Object.values(db.sites).find((s) => siteKeyFromUrl(s.url) === key);
  if (existing) return existing;

  const id = `site_${Buffer.from(key).toString("base64url").slice(0, 22)}`;
  const record: SiteRecord = {
    id,
    workspaceId: db.defaultWorkspaceId,
    url: key,
    name: name ?? new URL(key).hostname,
    status: "pending",
    settings: {},
    createdAt: new Date().toISOString(),
    lastCrawlAt: null,
    lastAuditId: null,
    lastScores: null,
  };
  db.sites[id] = record;
  await writeDb(db);
  return record;
}

export async function fileGetSiteByUrl(url: string): Promise<SiteRecord | null> {
  const key = siteKeyFromUrl(url);
  const db = await readDb();
  return Object.values(db.sites).find((s) => siteKeyFromUrl(s.url) === key) ?? null;
}

export async function fileGetSite(id: string): Promise<SiteRecord | null> {
  const db = await readDb();
  return db.sites[id] ?? null;
}

export async function fileListSites(): Promise<SiteRecord[]> {
  const db = await readDb();
  return Object.values(db.sites).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export async function fileSaveAudit(
  siteId: string,
  audit: Omit<AuditRecord, "siteId">,
  scores: Record<string, number>,
): Promise<AuditRecord> {
  const db = await readDb();
  const site = db.sites[siteId];
  if (!site) throw new Error("site not found");

  const record: AuditRecord = { ...audit, siteId };
  db.audits[record.id] = record;
  db.latestAuditBySite[siteId] = record.id;
  db.sites[siteId] = {
    ...site,
    status: record.status === "done" ? "active" : site.status,
    lastCrawlAt: record.finishedAt,
    lastAuditId: record.id,
    lastScores: scores,
  };
  await writeDb(db);
  return record;
}

export async function fileLatestAudit(siteId: string): Promise<AuditRecord | null> {
  const db = await readDb();
  const id = db.latestAuditBySite[siteId];
  if (!id) return null;
  return db.audits[id] ?? null;
}
