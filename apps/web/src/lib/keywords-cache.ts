export type KeywordOpportunity = {
  query: string;
  position: number | null;
  potential: number;
  page: string;
  trend7d: number | null;
  intent: string | null;
  rationale: string;
  actions: string[];
  source: "ai" | "heuristic";
};

export type KeywordsResponse = {
  url: string;
  fetchedUrl?: string;
  generatedAt: string;
  source: "ai" | "heuristic";
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

const CACHE_KEY = "webagent:keywords-cache:v3";
const memory = new Map<string, { savedAt: number; data: KeywordsResponse }>();

function cacheId(url: string, locale = "zh") {
  return `${locale}::${url}`;
}

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

export function getCachedKeywords(
  url: string,
  locale = "zh",
): KeywordsResponse | null {
  const id = cacheId(url, locale);
  const mem = memory.get(id);
  if (mem) return mem.data;
  const store = readStore();
  const entry = store[id];
  if (!entry) return null;
  memory.set(id, entry);
  return entry.data;
}

export function setCachedKeywords(
  url: string,
  data: KeywordsResponse,
  locale = "zh",
) {
  const id = cacheId(url, locale);
  const entry = { savedAt: Date.now(), data };
  memory.set(id, entry);
  const store = readStore();
  store[id] = entry;
  const keys = Object.keys(store).sort(
    (a, b) => (store[b]?.savedAt ?? 0) - (store[a]?.savedAt ?? 0),
  );
  for (const extra of keys.slice(8)) {
    delete store[extra];
    memory.delete(extra);
  }
  writeStore(store);
}
