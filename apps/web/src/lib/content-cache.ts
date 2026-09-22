export type ContentGap = {
  id: string;
  title: string;
  targetKeyword: string;
  potential: number;
  suggestedPath: string;
  intent: string | null;
  rationale: string;
  geoHint: string | null;
  source: "ai" | "heuristic";
};

export type ContentGapsResponse = {
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
  items: ContentGap[];
};

export type ContentBrief = {
  gapId: string;
  title: string;
  targetKeyword: string;
  suggestedPath: string;
  intent: string;
  summary: string;
  definitionBlock: string;
  outline: string[];
  faq: Array<{ question: string; answer: string }>;
  internalLinks: string[];
  schemaHints: string[];
  geoChecklist: string[];
  source: "ai" | "heuristic";
  model: string | null;
  warning: string | null;
};

const CACHE_KEY = "webagent:content-cache:v3";
const memory = new Map<string, { savedAt: number; data: ContentGapsResponse }>();

function cacheId(url: string, locale = "zh") {
  return `${locale}::${url}`;
}

function readStore(): Record<
  string,
  { savedAt: number; data: ContentGapsResponse }
> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw
      ? (JSON.parse(raw) as Record<
          string,
          { savedAt: number; data: ContentGapsResponse }
        >)
      : {};
  } catch {
    return {};
  }
}

function writeStore(
  store: Record<string, { savedAt: number; data: ContentGapsResponse }>,
) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

export function getCachedContent(
  url: string,
  locale = "zh",
): ContentGapsResponse | null {
  const id = cacheId(url, locale);
  const mem = memory.get(id);
  if (mem) return mem.data;
  const store = readStore();
  const entry = store[id];
  if (!entry) return null;
  memory.set(id, entry);
  return entry.data;
}

export function setCachedContent(
  url: string,
  data: ContentGapsResponse,
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

export function clearContentCache() {
  memory.clear();
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}
