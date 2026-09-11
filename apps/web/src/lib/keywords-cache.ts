export type KeywordOpportunity = {
  query: string;
  position: number | null;
  potential: number;
  page: string;
  trend7d: number | null;
  intent: string | null;
  rationale: string;
  actions: string[];
  source: "gsc" | "ai" | "heuristic";
};

export type KeywordsResponse = {
  url: string;
  fetchedUrl?: string;
  generatedAt: string;
  source: "ai" | "heuristic" | "gsc";
  model: string | null;
  warning: string | null;
  signals?: {
    title: string | null;
    description: string | null;
    h1: string[];
    h2Count: number;
  };
  items: KeywordOpportunity[];
};

const CACHE_KEY = "webagent:keywords-cache:v1";
const memory = new Map<string, { savedAt: number; data: KeywordsResponse }>();

function readStore(): Record<string, { savedAt: number; data: KeywordsResponse }> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, { savedAt: number; data: KeywordsResponse }>) : {};
  } catch {
    return {};
  }
}

function writeStore(
  store: Record<string, { savedAt: number; data: KeywordsResponse }>,
) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

export function getCachedKeywords(url: string): KeywordsResponse | null {
  const mem = memory.get(url);
  if (mem) return mem.data;
  const store = readStore();
  const entry = store[url];
  if (!entry) return null;
  memory.set(url, entry);
  return entry.data;
}

export function setCachedKeywords(url: string, data: KeywordsResponse) {
  const entry = { savedAt: Date.now(), data };
  memory.set(url, entry);
  const store = readStore();
  store[url] = entry;
  const keys = Object.keys(store).sort(
    (a, b) => (store[b]?.savedAt ?? 0) - (store[a]?.savedAt ?? 0),
  );
  for (const extra of keys.slice(8)) {
    delete store[extra];
    memory.delete(extra);
  }
  writeStore(store);
}
