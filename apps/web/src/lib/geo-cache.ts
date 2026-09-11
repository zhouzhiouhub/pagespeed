export type GeoBreakdown = {
  answerability: number;
  structure: number;
  trust: number;
  ai_access: number;
  entity: number;
};

export type GeoOpportunity = {
  id: string;
  type: "geo_readiness" | "geo_asset";
  scope: "page" | "site";
  title: string;
  page: string;
  missing: string[];
  potential: number;
  rationale: string;
  actions: string[];
};

export type GeoResponse = {
  url: string;
  fetchedUrl: string;
  generatedAt: string;
  score: number;
  breakdown: GeoBreakdown;
  access: {
    robotsUrl: string;
    robotsOk: boolean;
    aiBotPolicy: "allow" | "block" | "mixed" | "unknown";
    aiBotSummary: string;
    llmsTxtUrl: string;
    llmsTxtPresent: boolean;
    llmsTxtPreview: string | null;
  };
  page: {
    title: string | null;
    description: string | null;
    h1: string[];
    pageKind?:
      | "home_portfolio"
      | "product"
      | "article"
      | "docs"
      | "landing";
    pageKindReason?: string;
    expectations?: {
      needsFaq: boolean;
      needsDefinition: boolean;
      needsHowTo: boolean;
      needsComparison: boolean;
      needsAuthorDate: boolean;
      needsProductSchema: boolean;
      needsOrgOrPerson: boolean;
    };
    flags: {
      hasFaqHeading: boolean;
      hasDefinitionCue: boolean;
      hasFaqSchema: boolean;
      hasOrgSchema: boolean;
      hasProductSchema: boolean;
      hasPersonSchema?: boolean;
      hasAuthor: boolean;
      hasDateModified: boolean;
      hasTable: boolean;
    };
  };
  items: GeoOpportunity[];
  warning: string | null;
};

export type GeoPlan = {
  opportunityId: string;
  title: string;
  page: string;
  summary: string;
  definitionBlock: string;
  faq: Array<{ question: string; answer: string }>;
  schemaSnippet: string;
  llmsTxtSnippet: string | null;
  steps: Array<{ order: number; title: string; content: string }>;
  checklist: string[];
  source: "ai" | "heuristic";
  model: string | null;
  warning: string | null;
};

const CACHE_KEY = "webagent:geo-cache:v3";
const memory = new Map<string, { savedAt: number; data: GeoResponse }>();

function readStore(): Record<string, { savedAt: number; data: GeoResponse }> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw
      ? (JSON.parse(raw) as Record<string, { savedAt: number; data: GeoResponse }>)
      : {};
  } catch {
    return {};
  }
}

function writeStore(
  store: Record<string, { savedAt: number; data: GeoResponse }>,
) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

export function getCachedGeo(url: string): GeoResponse | null {
  const mem = memory.get(url);
  if (mem) return mem.data;
  const store = readStore();
  const entry = store[url];
  if (!entry) return null;
  memory.set(url, entry);
  return entry.data;
}

export function setCachedGeo(url: string, data: GeoResponse) {
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

export function clearGeoCache() {
  memory.clear();
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}
