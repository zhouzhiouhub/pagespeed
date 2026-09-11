/**
 * Structural GEO extraction only.
 * No language/keyword heuristics for page intent — that belongs to the LLM layer.
 */

export type GeoSiteAccess = {
  robotsUrl: string;
  robotsOk: boolean;
  aiBotPolicy: "allow" | "block" | "mixed" | "unknown";
  aiBotSummary: string;
  llmsTxtUrl: string;
  llmsTxtPresent: boolean;
  llmsTxtPreview: string | null;
};

export type GeoStructuralSignals = {
  url: string;
  title: string | null;
  description: string | null;
  h1: string[];
  h2: string[];
  h3: string[];
  navSample: string[];
  textSample: string;
  hasTable: boolean;
  hasOrderedList: boolean;
  hasUnorderedList: boolean;
  schemaTypes: string[];
  hasAuthorMeta: boolean;
  hasDateModifiedMeta: boolean;
  wordCountApprox: number;
};

function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickMeta(html: string, names: string[]): string | null {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>|<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["'][^>]*>`,
      "i",
    );
    const m = html.match(re);
    const value = m?.[1] ?? m?.[2];
    if (value) return decodeEntities(value);
  }
  return null;
}

function pickAll(html: string, tag: string, limit = 12): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < limit) {
    const text = decodeEntities(m[1].replace(/<[^>]+>/g, " "));
    if (text && text.length >= 2 && text.length <= 160) out.push(text);
  }
  return [...new Set(out)];
}

function stripScripts(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
}

function extractSchemaTypes(html: string): string[] {
  const blocks = [
    ...html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ].map((m) => m[1]);

  const types = new Set<string>();
  for (const raw of blocks) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      const visit = (node: unknown) => {
        if (!node) return;
        if (Array.isArray(node)) {
          node.forEach(visit);
          return;
        }
        if (typeof node !== "object") return;
        const obj = node as Record<string, unknown>;
        const t = obj["@type"];
        if (typeof t === "string") types.add(t);
        if (Array.isArray(t)) {
          for (const x of t) if (typeof x === "string") types.add(x);
        }
        for (const v of Object.values(obj)) visit(v);
      };
      visit(parsed);
    } catch {
      // ignore invalid JSON-LD
    }
  }
  return [...types];
}

export function extractStructuralSignals(
  url: string,
  html: string,
): GeoStructuralSignals {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]) : null;
  const description = pickMeta(html, ["description", "og:description"]);
  const h1 = pickAll(html, "h1", 5);
  const h2 = pickAll(html, "h2", 16);
  const h3 = pickAll(html, "h3", 12);
  const navSample = pickAll(html, "a", 40)
    .filter((t) => t.length <= 32)
    .slice(0, 20);

  const text = decodeEntities(stripScripts(html).replace(/<[^>]+>/g, " "));
  const wordCountApprox = text.split(/\s+/).filter(Boolean).length;
  const textSample = text.slice(0, 1800);

  const hasAuthorMeta =
    /rel=["']author["']|itemprop=["']author["']/i.test(html) ||
    Boolean(pickMeta(html, ["author"]));
  const hasDateModifiedMeta =
    /property=["']article:modified_time["']|itemprop=["']dateModified["']/i.test(
      html,
    ) || Boolean(pickMeta(html, ["article:modified_time", "og:updated_time"]));

  return {
    url,
    title,
    description,
    h1,
    h2,
    h3,
    navSample,
    textSample,
    hasTable: /<table[\s>]/i.test(html),
    hasOrderedList: /<ol[\s>]/i.test(html),
    hasUnorderedList: /<ul[\s>]/i.test(html),
    schemaTypes: extractSchemaTypes(html),
    hasAuthorMeta,
    hasDateModifiedMeta,
    wordCountApprox,
  };
}

/** Known AI crawler UA tokens — protocol constants, not page-content rules. */
const AI_BOTS = [
  "GPTBot",
  "ChatGPT-User",
  "Google-Extended",
  "PerplexityBot",
  "ClaudeBot",
  "anthropic-ai",
  "Bytespider",
];

export function parseRobotsAiPolicy(robotsText: string): {
  policy: GeoSiteAccess["aiBotPolicy"];
  summary: string;
} {
  const lines = robotsText.split(/\r?\n/);
  let currentAgents: string[] = [];
  const agentRules = new Map<
    string,
    { disallowAll: boolean; allowSome: boolean }
  >();

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const ua = line.match(/^user-agent:\s*(.+)$/i);
    if (ua) {
      currentAgents = [ua[1].trim()];
      continue;
    }
    const dis = line.match(/^disallow:\s*(.*)$/i);
    if (dis && currentAgents.length) {
      const path = dis[1].trim();
      for (const agent of currentAgents) {
        const prev = agentRules.get(agent) ?? {
          disallowAll: false,
          allowSome: false,
        };
        if (path === "/" || path === "/*") prev.disallowAll = true;
        agentRules.set(agent, prev);
      }
      continue;
    }
    const allow = line.match(/^allow:\s*(.+)$/i);
    if (allow && currentAgents.length) {
      for (const agent of currentAgents) {
        const prev = agentRules.get(agent) ?? {
          disallowAll: false,
          allowSome: false,
        };
        prev.allowSome = true;
        agentRules.set(agent, prev);
      }
    }
  }

  const relevant = AI_BOTS.map((bot) => {
    const rule = agentRules.get(bot) ?? agentRules.get("*");
    if (!rule) return { bot, status: "default-allow" as const };
    if (rule.disallowAll && !rule.allowSome)
      return { bot, status: "blocked" as const };
    if (rule.disallowAll && rule.allowSome)
      return { bot, status: "partial" as const };
    return { bot, status: "allowed" as const };
  });

  const blocked = relevant.filter((r) => r.status === "blocked").map((r) => r.bot);
  const allowed = relevant.filter(
    (r) => r.status === "allowed" || r.status === "default-allow",
  );
  const partial = relevant.filter((r) => r.status === "partial");

  let policy: GeoSiteAccess["aiBotPolicy"] = "allow";
  if (blocked.length >= 3) policy = "block";
  else if (blocked.length && allowed.length) policy = "mixed";
  else if (blocked.length) policy = "mixed";
  else policy = "allow";

  const summaryParts: string[] = [];
  if (blocked.length) summaryParts.push(`blocked: ${blocked.join(", ")}`);
  if (partial.length) {
    summaryParts.push(`partial: ${partial.map((p) => p.bot).join(", ")}`);
  }
  if (!blocked.length && !partial.length) {
    summaryParts.push("no sitewide Disallow for major AI bots (* or absent)");
  }

  return { policy, summary: summaryParts.join("; ") };
}
