import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { KeywordOpportunity } from "@/server/keywords/opportunities";

export type GscSite = {
  siteUrl: string;
  permissionLevel?: string;
};

export type GscStore = {
  selectedProperty: string | null;
  siteUrl: string | null;
  lastSyncedAt: string | null;
  rows: Array<{
    query: string;
    page: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
    prevPosition: number | null;
  }>;
  opportunities: KeywordOpportunity[];
};

const EMPTY: GscStore = {
  selectedProperty: null,
  siteUrl: null,
  lastSyncedAt: null,
  rows: [],
  opportunities: [],
};

function storePath() {
  return path.join(process.cwd(), ".data", "gsc-store.json");
}

export async function readGscStore(): Promise<GscStore> {
  try {
    const raw = await readFile(storePath(), "utf8");
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<GscStore>) };
  } catch {
    return { ...EMPTY };
  }
}

export async function writeGscStore(next: GscStore): Promise<void> {
  const dir = path.dirname(storePath());
  await mkdir(dir, { recursive: true });
  await writeFile(storePath(), JSON.stringify(next, null, 2), "utf8");
}
