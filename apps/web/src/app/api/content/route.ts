import { NextResponse } from "next/server";
import { parseSiteUrl, localeFromRequest, localizedUrlError } from "@/lib/url";
import { applyProxyDispatcher } from "@/server/http/proxy-bootstrap";
import { fetchText } from "@/server/http/fetch";
import { extractPageSignals } from "@/server/keywords/extract";
import { buildContentGaps } from "@/server/content/gaps";

applyProxyDispatcher();

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
    return NextResponse.json({ error: localizedUrlError(parsed.code, localeFromRequest(request)) }, { status: 400 });
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
    const result = await buildContentGaps(parsed.url, signals);

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
    const message = err instanceof Error ? err.message : "内容缺口分析失败";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
