import { PSI_CACHE_KEY } from "@/lib/site";

export type PsiStrategy = "mobile" | "desktop";

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
  scores: Array<{ id: string; title: string; score: number | null }>;
  metrics: Array<{
    id: string;
    title: string;
    displayValue: string | null;
    score: number | null;
  }>;
  opportunities?: PsiOpportunity[];
  seoAudits?: PsiOpportunity[];
};

type CacheEntry = {
  savedAt: number;
  data: PsiSummary;
};

type CacheStore = Record<string, CacheEntry>;

const memory = new Map<string, CacheEntry>();

function cacheKey(url: string, strategy: PsiStrategy) {
  return `${strategy}::${url}`;
}

function readStore(): CacheStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(PSI_CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as CacheStore;
  } catch {
    return {};
  }
}

function writeStore(store: CacheStore) {
  try {
    sessionStorage.setItem(PSI_CACHE_KEY, JSON.stringify(store));
  } catch {
    // quota / private mode — memory cache still works
  }
}

export function getCachedPsi(
  url: string,
  strategy: PsiStrategy,
): PsiSummary | null {
  const key = cacheKey(url, strategy);
  const mem = memory.get(key);
  if (mem) return mem.data;

  const store = readStore();
  const entry = store[key];
  if (!entry) return null;
  memory.set(key, entry);
  return entry.data;
}

export function setCachedPsi(
  url: string,
  strategy: PsiStrategy,
  data: PsiSummary,
) {
  const key = cacheKey(url, strategy);
  const entry: CacheEntry = { savedAt: Date.now(), data };
  memory.set(key, entry);
  const store = readStore();
  store[key] = entry;
  // Keep last 8 analyses to avoid bloating sessionStorage
  const keys = Object.keys(store).sort(
    (a, b) => (store[b]?.savedAt ?? 0) - (store[a]?.savedAt ?? 0),
  );
  for (const extra of keys.slice(8)) {
    delete store[extra];
    memory.delete(extra);
  }
  writeStore(store);
}
