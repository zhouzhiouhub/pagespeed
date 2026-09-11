export type RobotsRules = {
  sitemaps: string[];
  /** path prefixes our crawler may not fetch */
  disallows: string[];
  allows: string[];
};

function matchAgent(agentLine: string, userAgent: string): boolean {
  const token = agentLine.trim().toLowerCase();
  if (token === "*") return true;
  return userAgent.toLowerCase().includes(token);
}

/**
 * Parse robots.txt for our crawler UA (+ *).
 * Also collects Sitemap: directives.
 */
export function parseRobotsTxt(
  robotsText: string,
  userAgent: string,
): RobotsRules {
  const lines = robotsText.split(/\r?\n/);
  const sitemaps: string[] = [];
  const groups: Array<{ agents: string[]; allows: string[]; disallows: string[] }> =
    [];
  let current: { agents: string[]; allows: string[]; disallows: string[] } | null =
    null;

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;

    const sitemap = line.match(/^sitemap:\s*(.+)$/i);
    if (sitemap) {
      sitemaps.push(sitemap[1].trim());
      continue;
    }

    const ua = line.match(/^user-agent:\s*(.+)$/i);
    if (ua) {
      const agent = ua[1].trim();
      if (!current || current.allows.length || current.disallows.length) {
        current = { agents: [agent], allows: [], disallows: [] };
        groups.push(current);
      } else {
        current.agents.push(agent);
      }
      continue;
    }

    if (!current) continue;

    const disallow = line.match(/^disallow:\s*(.*)$/i);
    if (disallow) {
      const path = disallow[1].trim();
      if (path) current.disallows.push(path);
      continue;
    }

    const allow = line.match(/^allow:\s*(.*)$/i);
    if (allow) {
      const path = allow[1].trim();
      if (path) current.allows.push(path);
    }
  }

  const matching = groups.filter((g) =>
    g.agents.some((a) => matchAgent(a, userAgent)),
  );
  const chosen =
    matching.find((g) => g.agents.some((a) => a !== "*")) ??
    matching[0] ??
    null;

  return {
    sitemaps: [...new Set(sitemaps)],
    disallows: chosen?.disallows ?? [],
    allows: chosen?.allows ?? [],
  };
}

function pathMatches(pattern: string, path: string): boolean {
  if (!pattern) return false;
  if (pattern === "/") return true;
  // robots: trailing * is common; treat as prefix match
  const normalized = pattern.endsWith("*") ? pattern.slice(0, -1) : pattern;
  return path.startsWith(normalized);
}

export function isPathAllowed(
  pathname: string,
  rules: Pick<RobotsRules, "allows" | "disallows">,
): boolean {
  let allowed = true;
  let bestLen = -1;

  for (const d of rules.disallows) {
    if (pathMatches(d, pathname) && d.length >= bestLen) {
      allowed = false;
      bestLen = d.length;
    }
  }
  for (const a of rules.allows) {
    if (pathMatches(a, pathname) && a.length >= bestLen) {
      allowed = true;
      bestLen = a.length;
    }
  }
  return allowed;
}
