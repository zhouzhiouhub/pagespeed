import type { AdviceItemRecord } from "@/server/advice/store";
import type { Locale } from "@/lib/i18n/locale";

export type LightAgentName = "keyword" | "seo" | "geo" | "content";

export type LightAgentCandidate = Omit<AdviceItemRecord, "userState">;

export type LightAgentResult = {
  agent: LightAgentName;
  candidates: LightAgentCandidate[];
  sources: string[];
  warnings: string[];
};

export type LightAgentContext = {
  siteUrl: string;
  locale: Locale;
};

export function emptyAgentResult(agent: LightAgentName): LightAgentResult {
  return { agent, candidates: [], sources: [], warnings: [] };
}

export function priorityFromScore(
  score: number,
): AdviceItemRecord["priority"] {
  if (score >= 0.75) return "high";
  if (score >= 0.5) return "medium";
  return "growth";
}
