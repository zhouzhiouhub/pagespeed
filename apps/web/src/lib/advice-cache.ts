export type AdviceUserState = "open" | "acted" | "snoozed" | "dismissed";

export type AdviceItem = {
  id: string;
  priority: "high" | "medium" | "growth";
  type: string;
  title: string;
  summary: string;
  evidence: Record<string, unknown>;
  suggestedActions: string[];
  score: number;
  href: string | null;
  ctaLabel: string;
  userState: AdviceUserState;
};

export type AdviceResponse = {
  siteUrl: string;
  runId: string;
  generatedAt: string;
  greeting: string;
  headline: string;
  sources: string[];
  warning: string | null;
  model: string | null;
  items: AdviceItem[];
};

const CACHE_KEY = "webagent:advice-cache:v2";
const memory = new Map<string, { savedAt: number; data: AdviceResponse }>();

function cacheId(url: string, locale = "zh") {
  return `${locale}::${url}`;
}

function readStore(): Record<string, { savedAt: number; data: AdviceResponse }> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw
      ? (JSON.parse(raw) as Record<string, { savedAt: number; data: AdviceResponse }>)
      : {};
  } catch {
    return {};
  }
}

function writeStore(
  store: Record<string, { savedAt: number; data: AdviceResponse }>,
) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

export function getCachedAdvice(
  url: string,
  locale = "zh",
): AdviceResponse | null {
  const id = cacheId(url, locale);
  const mem = memory.get(id);
  if (mem) return mem.data;
  const store = readStore();
  const entry = store[id];
  if (!entry) return null;
  memory.set(id, entry);
  return entry.data;
}

export function setCachedAdvice(
  url: string,
  data: AdviceResponse,
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

export function clearAdviceCache() {
  memory.clear();
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}
