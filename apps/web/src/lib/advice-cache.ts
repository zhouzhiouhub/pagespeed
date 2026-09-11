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

const CACHE_KEY = "webagent:advice-cache:v1";
const memory = new Map<string, { savedAt: number; data: AdviceResponse }>();

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

export function getCachedAdvice(url: string): AdviceResponse | null {
  const mem = memory.get(url);
  if (mem) return mem.data;
  const store = readStore();
  const entry = store[url];
  if (!entry) return null;
  memory.set(url, entry);
  return entry.data;
}

export function setCachedAdvice(url: string, data: AdviceResponse) {
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

export function clearAdviceCache() {
  memory.clear();
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}
