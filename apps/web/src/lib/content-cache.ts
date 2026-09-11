export type ContentGap = {
  id: string;
  title: string;
  targetKeyword: string;
  potential: number;
  suggestedPath: string;
  intent: string | null;
  rationale: string;
  geoHint: string | null;
  source: "gsc" | "ai" | "heuristic";
};

export type ContentGapsResponse = {
  url: string;
  fetchedUrl?: string;
  generatedAt: string;
  source: "gsc" | "ai" | "heuristic";
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

const CACHE_KEY = "webagent:content-cache:v1";
const memory = new Map<string, { savedAt: number; data: ContentGapsResponse }>();

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

export function getCachedContent(url: string): ContentGapsResponse | null {
  const mem = memory.get(url);
  if (mem) return mem.data;
  const store = readStore();
  const entry = store[url];
  if (!entry) return null;
  memory.set(url, entry);
  return entry.data;
}

export function setCachedContent(url: string, data: ContentGapsResponse) {
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

export function clearContentCache() {
  memory.clear();
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}
