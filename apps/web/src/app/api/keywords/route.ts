import { NextResponse } from "next/server";
import { parseSiteUrl, localeFromRequest, localizedUrlError } from "@/lib/url";
import { applyProxyDispatcher } from "@/server/http/proxy-bootstrap";
import { fetchText } from "@/server/http/fetch";
import { extractPageSignals } from "@/server/keywords/extract";
import { buildKeywordOpportunities } from "@/server/keywords/opportunities";
import { readGscStore } from "@/server/gsc/store";
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
    const store = await readGscStore();
    const sameSite =
      store.siteUrl &&
      (store.siteUrl === parsed.url ||
        parsed.url.startsWith(store.siteUrl) ||
        store.siteUrl.includes(new URL(parsed.url).hostname));

    if (store.opportunities.length > 0 && store.selectedProperty && sameSite) {
      return NextResponse.json({
        url: parsed.url,
        generatedAt: store.lastSyncedAt ?? new Date().toISOString(),
        source: "gsc",
        model: null,
        warning: null,
        gsc: {
          property: store.selectedProperty,
          lastSyncedAt: store.lastSyncedAt,
          rowCount: store.rows.length,
        },
        items: store.opportunities,
      });
    }

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
    const result = await buildKeywordOpportunities(
      parsed.url,
      signals,
      locale,
    );

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
        : translate(locale, "server.api.keywordsFailed");
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
