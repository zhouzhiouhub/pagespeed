import { NextResponse } from "next/server";
import { parseSiteUrl } from "@/lib/url";
import { fetchText } from "@/server/http/fetch";
import { extractPageSignals } from "@/server/keywords/extract";
import { buildKeywordOpportunities } from "@/server/keywords/opportunities";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url");
  if (!rawUrl) {
    return NextResponse.json({ error: "缺少 url 参数" }, { status: 400 });
  }

  const parsed = parseSiteUrl(rawUrl);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const page = await fetchText(parsed.url, { timeoutMs: 25_000 });
    if (!page.ok) {
      return NextResponse.json(
        { error: `抓取站点失败（HTTP ${page.status}）` },
        { status: 502 },
      );
    }

    const signals = extractPageSignals(page.finalUrl || parsed.url, page.text);
    const result = await buildKeywordOpportunities(parsed.url, signals);

    return NextResponse.json({
      url: parsed.url,
      fetchedUrl: page.finalUrl,
      generatedAt: new Date().toISOString(),
      source: result.source,
      model: result.model,
      warning: result.warning,
      signals: {
        title: signals.title,
        description: signals.description,
        h1: signals.h1,
        h2Count: signals.h2.length,
      },
      items: result.items,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "关键词分析失败";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
