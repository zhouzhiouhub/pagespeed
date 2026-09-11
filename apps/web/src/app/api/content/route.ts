import { NextResponse } from "next/server";
import { parseSiteUrl, localeFromRequest, localizedUrlError } from "@/lib/url";
import { applyProxyDispatcher } from "@/server/http/proxy-bootstrap";
import { fetchText } from "@/server/http/fetch";
import { extractPageSignals } from "@/server/keywords/extract";
import { buildContentGaps } from "@/server/content/gaps";
import { translate } from "@/lib/i18n/messages";

applyProxyDispatcher();

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const locale = localeFromRequest(request);
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url");
  if (!rawUrl) {
    return NextResponse.json(
      { error: translate(locale, "server.api.missingUrlParam") },
      { status: 400 },
    );
  }

  const parsed = parseSiteUrl(rawUrl);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: localizedUrlError(parsed.code, locale) },
      { status: 400 },
    );
  }

  try {
    const page = await fetchText(parsed.url, { timeoutMs: 25_000 });
    if (!page.ok) {
      return NextResponse.json(
        {
          error: translate(locale, "server.api.fetchFailedHttp", {
            status: page.status,
          }),
        },
        { status: 502 },
      );
    }

    const signals = extractPageSignals(page.finalUrl || parsed.url, page.text);
    const result = await buildContentGaps(parsed.url, signals, locale);

    return NextResponse.json({
      url: parsed.url,
      fetchedUrl: page.finalUrl,
      generatedAt: new Date().toISOString(),
      source: result.source,
      model: result.model,
      warning: result.warning,
      locale,
      signals: {
        title: signals.title,
        description: signals.description,
        h1: signals.h1,
        h2Count: signals.h2.length,
      },
      items: result.items,
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : translate(locale, "server.api.contentFailed");
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
