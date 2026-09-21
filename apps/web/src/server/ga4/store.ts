import { readJsonStore, writeJsonStore } from "@/server/storage/json-store";

export type Ga4Property = {
  name: string; // properties/123
  displayName: string;
  propertyId: string;
};

export type Ga4PageRow = {
  date: string;
  pagePath: string;
  sessions: number;
  users: number;
  engagementRate: number | null;
  avgEngagementTime: number | null;
  bounceRate: number | null;
};

export type Ga4Store = {
  selectedPropertyId: string | null;
  selectedPropertyName: string | null;
  siteUrl: string | null;
  lastSyncedAt: string | null;
  sessions7d: number;
  users7d: number;
  rows: Ga4PageRow[];
  topPages: Array<{ path: string; sessions: number; users: number }>;
};

const EMPTY: Ga4Store = {
  selectedPropertyId: null,
  selectedPropertyName: null,
  siteUrl: null,
  lastSyncedAt: null,
  sessions7d: 0,
  users7d: 0,
  rows: [],
  topPages: [],
};

const STORE_KEY = "ga4-store";

export async function readGa4Store(): Promise<Ga4Store> {
  return readJsonStore(STORE_KEY, EMPTY);
}

export async function writeGa4Store(next: Ga4Store): Promise<void> {
  await writeJsonStore(STORE_KEY, next);
}
