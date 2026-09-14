import { z } from "zod";
import { fetchText } from "@/server/http/fetch";
import { generateText } from "@/server/llm/gemini";
import { runKeywordAgent } from "@/server/agents/keyword-agent";
import { runContentAgent } from "@/server/agents/content-agent";
import { runGeoAgent } from "@/server/agents/geo-agent";
import { runSeoAgent } from "@/server/agents/seo-agent";
import { priorityFromScore } from "@/server/agents/light-types";
import {
  readAdviceRun,
  writeAdviceRun,
  type AdviceItemRecord,
  type AdviceRunRecord,
  type AdviceUserState,
} from "@/server/advice/store";
import {
  DEFAULT_LOCALE,
  llmLanguageRule,
  type Locale,
} from "@/lib/i18n/locale";
import { translate, type MessageKey } from "@/lib/i18n/messages";

type Candidate = Omit<AdviceItemRecord, "userState">;

function siteKey(url: string) {
  return url;
}

function t(
  locale: Locale,
  key: MessageKey,
  params?: Record<string, string | number>,
) {
  return translate(locale, key, params);
}

function mergeUserStates(
  nextItems: Candidate[],
  prev: AdviceRunRecord | null,
): AdviceItemRecord[] {
  const prevMap = new Map(prev?.items.map((i) => [i.id, i.userState] as const));
  return nextItems.map((item) => ({
    ...item,
    userState: (prevMap.get(item.id) ?? "open") as AdviceUserState,
  }));
}

async function collectCandidates(
  siteUrl: string,
  locale: Locale,
): Promise<{
  candidates: Candidate[];
  sources: string[];
  warning: string | null;
}> {
  const sources: string[] = [];
  const warnings: string[] = [];
  const candidates: Candidate[] = [];
  const ctx = { siteUrl, locale };

  let pageHtml: string | null = null;
  let fetchedUrl = siteUrl;
  try {
    const page = await fetchText(siteUrl, { timeoutMs: 25_000 });
    if (page.ok) {
      pageHtml = page.text;
      fetchedUrl = page.finalUrl || siteUrl;
      sources.push("crawl");
    } else {
      warnings.push(
        t(locale, "server.advice.crawlFailedHttp", { status: page.status }),
      );
    }
  } catch (err) {
    warnings.push(
      err instanceof Error
        ? err.message
        : t(locale, "server.advice.crawlFailed"),
    );
  }

  const [keyword, content, geo, seo] = await Promise.all([
    runKeywordAgent(ctx, { pageHtml, fetchedUrl }),
    runContentAgent(ctx, { pageHtml, fetchedUrl }),
    runGeoAgent(ctx),
    runSeoAgent(ctx),
  ]);

  for (const part of [keyword, content, geo, seo]) {
    sources.push(...part.sources);
    warnings.push(...part.warnings);
    candidates.push(...part.candidates);
  }

  // de-dupe by id, keep highest score
  const byId = new Map<string, Candidate>();
  for (const c of candidates) {
    const prev = byId.get(c.id);
    if (!prev || c.score > prev.score) byId.set(c.id, c);
  }

  const ranked = [...byId.values()].sort((a, b) => b.score - a.score);
  for (const c of ranked) {
    c.priority = priorityFromScore(c.score);
  }

  return {
    candidates: ranked.slice(0, 12),
    sources: [...new Set(sources)],
    warning: warnings.length ? warnings.slice(0, 4).join(" · ") : null,
  };
}

const polishSchema = z.object({
  greeting: z.string().min(1),
  headline: z.string().min(1),
  order: z.array(z.string()).optional(),
});

async function polishWithLlm(
  siteUrl: string,
  items: AdviceItemRecord[],
  locale: Locale,
): Promise<{ greeting: string; headline: string; order: string[] | null; model: string | null }> {
  const openCount = items.filter((i) => i.userState === "open").length;
  const fallback = {
    greeting: t(locale, "server.advice.greeting"),
    headline: t(locale, "server.advice.headlineOpen", { count: openCount }),
    order: null as string[] | null,
    model: null as string | null,
  };

  if (!process.env.LLM_API_KEY?.trim()) {
    return fallback;
  }

  try {
    const prompt = `You are the Website Growth Orchestrator. Write a short daily standup for the site owner.
Site: ${siteUrl}
Items JSON: ${JSON.stringify(
      items.map((i) => ({
        id: i.id,
        priority: i.priority,
        type: i.type,
        title: i.title,
        summary: i.summary,
        score: i.score,
      })),
    )}

Return JSON: { "greeting": "...", "headline": "...", "order": ["itemId", ...] }
Rules:
- ${llmLanguageRule(locale)}
- greeting like a colleague standup, not an audit scare.
- headline states how many open items matter today.
- order is optional re-rank of ids (same set).
- JSON only.`;

    const { text, model } = await generateText(prompt);
    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = polishSchema.safeParse(JSON.parse(cleaned));
    if (!parsed.success) throw new Error("advice polish schema invalid");
    return {
      greeting: parsed.data.greeting,
      headline: parsed.data.headline,
      order: parsed.data.order ?? null,
      model,
    };
  } catch {
    return fallback;
  }
}

function applyOrder(
  items: AdviceItemRecord[],
  order: string[] | null,
): AdviceItemRecord[] {
  if (!order?.length) return items;
  const map = new Map(items.map((i) => [i.id, i]));
  const next: AdviceItemRecord[] = [];
  for (const id of order) {
    const item = map.get(id);
    if (item) {
      next.push(item);
      map.delete(id);
    }
  }
  for (const item of map.values()) next.push(item);
  return next;
}

export async function composeDailyAdvice(
  siteUrl: string,
  opts?: { force?: boolean; locale?: Locale },
): Promise<AdviceRunRecord> {
  const force = opts?.force ?? false;
  const locale = opts?.locale ?? DEFAULT_LOCALE;
  const prev = await readAdviceRun(siteUrl);

  if (!force && prev) {
    const ageMs = Date.now() - new Date(prev.generatedAt).getTime();
    if (ageMs < 30 * 60 * 1000 && prev.locale === locale) {
      return prev;
    }
  }

  const { candidates, sources, warning } = await collectCandidates(
    siteUrl,
    locale,
  );
  let items = mergeUserStates(candidates, prev);

  const polish = await polishWithLlm(siteUrl, items, locale);
  items = applyOrder(items, polish.order);

  const run: AdviceRunRecord = {
    siteUrl: siteKey(siteUrl),
    runId: `advice_${Date.now()}`,
    generatedAt: new Date().toISOString(),
    locale,
    greeting: polish.greeting,
    headline: polish.headline,
    sources,
    warning,
    model: polish.model,
    items,
  };

  await writeAdviceRun(run);
  return run;
}
