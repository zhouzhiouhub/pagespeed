import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

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

function storePath() {
  return path.join(process.cwd(), ".data", "ga4-store.json");
}

export async function readGa4Store(): Promise<Ga4Store> {
  try {
    const raw = await readFile(storePath(), "utf8");
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<Ga4Store>) };
  } catch {
    return { ...EMPTY };
  }
}

export async function writeGa4Store(next: Ga4Store): Promise<void> {
  const dir = path.dirname(storePath());
  await mkdir(dir, { recursive: true });
  await writeFile(storePath(), JSON.stringify(next, null, 2), "utf8");
}
