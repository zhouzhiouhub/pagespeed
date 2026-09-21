import { readJsonStore, writeJsonStore } from "@/server/storage/json-store";
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

const STORE_KEY = "gsc-store";

export async function readGscStore(): Promise<GscStore> {
  return readJsonStore(STORE_KEY, EMPTY);
}

export async function writeGscStore(next: GscStore): Promise<void> {
  await writeJsonStore(STORE_KEY, next);
}
