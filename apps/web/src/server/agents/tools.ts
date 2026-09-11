import { fetchText } from "@/server/http/fetch";
import { extractPageSignals } from "@/server/keywords/extract";
import { readGscStore } from "@/server/gsc/store";
import { readGa4Store } from "@/server/ga4/store";
import { getLatestAuditForUrl } from "@/server/sites/repo";
import { listPersistedOpportunities } from "@/server/insights/opportunities-store";
import { parseCrawledHtml } from "@/server/crawler/parse-page";

export type AgentToolName =
  | "read_page"
  | "read_gsc"
  | "read_ga"
  | "read_audit"
  | "read_opportunities";

export type AgentToolResult = {
  tool: AgentToolName;
  ok: boolean;
  data: Record<string, unknown>;
  warning?: string;
};

export async function toolReadPage(url: string): Promise<AgentToolResult> {
  try {
    const res = await fetchText(url, { timeoutMs: 25_000 });
    if (!res.ok) {
      return {
        tool: "read_page",
        ok: false,
        data: { status: res.status },
        warning: `HTTP ${res.status}`,
      };
    }
    const fields = parseCrawledHtml(res.finalUrl || url, res.text, res.status);
    const signals = extractPageSignals(res.finalUrl || url, res.text);
    return {
      tool: "read_page",
      ok: true,
      data: {
        url: fields.url,
        title: fields.title,
        description: fields.metaDescription,
        h1: fields.h1,
        wordCount: fields.wordCount,
        hasSchema: fields.hasSchema,
        schemaTypes: fields.schemaTypes,
        indexable: fields.indexable,
        signals,
      },
    };
  } catch (err) {
    return {
      tool: "read_page",
      ok: false,
      data: {},
      warning: err instanceof Error ? err.message : "read_page failed",
    };
  }
}

export async function toolReadGsc(siteUrl?: string): Promise<AgentToolResult> {
  const store = await readGscStore();
  let matches = true;
  if (siteUrl && store.siteUrl) {
    try {
      const host = new URL(siteUrl).hostname;
      matches =
        store.siteUrl.includes(host) ||
        siteUrl.includes(store.siteUrl) ||
        Boolean(store.selectedProperty);
    } catch {
      matches = true;
    }
  }
  if (!store.lastSyncedAt || !matches) {
    return {
      tool: "read_gsc",
      ok: false,
      data: { connected: Boolean(store.selectedProperty) },
      warning: "GSC not synced for this site",
    };
  }
  return {
    tool: "read_gsc",
    ok: true,
    data: {
      property: store.selectedProperty,
      lastSyncedAt: store.lastSyncedAt,
      rowCount: store.rows.length,
      topOpportunities: store.opportunities.slice(0, 10),
      sampleRows: store.rows.slice(0, 10),
    },
  };
}

export async function toolReadGa(siteUrl?: string): Promise<AgentToolResult> {
  const store = await readGa4Store();
  let matches = true;
  if (siteUrl && store.siteUrl) {
    try {
      const host = new URL(siteUrl).hostname;
      matches =
        store.siteUrl.includes(host) ||
        siteUrl.includes(store.siteUrl) ||
        Boolean(store.selectedPropertyId);
    } catch {
      matches = true;
    }
  }
  if (!store.lastSyncedAt || !matches) {
    return {
      tool: "read_ga",
      ok: false,
      data: { connected: Boolean(store.selectedPropertyId) },
      warning: "GA4 not synced for this site",
    };
  }
  return {
    tool: "read_ga",
    ok: true,
    data: {
      propertyId: store.selectedPropertyId,
      lastSyncedAt: store.lastSyncedAt,
      sessions7d: store.sessions7d,
      users7d: store.users7d,
      topPages: store.topPages.slice(0, 10),
    },
  };
}

export async function toolReadAudit(siteUrl: string): Promise<AgentToolResult> {
  const latest = await getLatestAuditForUrl(siteUrl);
  if (!latest) {
    return {
      tool: "read_audit",
      ok: false,
      data: {},
      warning: "no audit yet",
    };
  }
  return {
    tool: "read_audit",
    ok: true,
    data: {
      auditId: latest.audit.id,
      scores: latest.audit.scores,
      summary: latest.audit.summary,
      pageCount: latest.audit.pageCount,
      issueCount: latest.audit.issueCount,
      finishedAt: latest.audit.finishedAt,
    },
  };
}

export async function toolReadOpportunities(
  siteUrl: string,
): Promise<AgentToolResult> {
  const listed = await listPersistedOpportunities(siteUrl);
  return {
    tool: "read_opportunities",
    ok: listed.items.length > 0,
    data: {
      source: listed.source,
      updatedAt: listed.updatedAt,
      items: listed.items.slice(0, 20),
    },
    warning: listed.items.length ? undefined : "no persisted opportunities",
  };
}

export async function runAgentTools(
  siteUrl: string,
  tools: AgentToolName[],
): Promise<AgentToolResult[]> {
  const results: AgentToolResult[] = [];
  for (const tool of tools) {
    if (tool === "read_page") results.push(await toolReadPage(siteUrl));
    else if (tool === "read_gsc") results.push(await toolReadGsc(siteUrl));
    else if (tool === "read_ga") results.push(await toolReadGa(siteUrl));
    else if (tool === "read_audit") results.push(await toolReadAudit(siteUrl));
    else if (tool === "read_opportunities")
      results.push(await toolReadOpportunities(siteUrl));
  }
  return results;
}
