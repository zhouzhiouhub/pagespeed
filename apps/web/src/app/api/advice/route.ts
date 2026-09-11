import { NextResponse } from "next/server";
import { parseSiteUrl, localeFromRequest, localizedUrlError } from "@/lib/url";
import { applyProxyDispatcher } from "@/server/http/proxy-bootstrap";
import { composeDailyAdvice } from "@/server/agents/advice";
import { readAdviceRun } from "@/server/advice/store";
import { translate } from "@/lib/i18n/messages";

applyProxyDispatcher();

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request) {
  const locale = localeFromRequest(request);
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url");
  const force = searchParams.get("force") === "1";
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
    if (!force) {
      const cached = await readAdviceRun(parsed.url);
      // Old runs without locale must not be reused across languages.
      if (cached?.locale === locale) {
        return NextResponse.json(cached);
      }
    }
    const run = await composeDailyAdvice(parsed.url, {
      force: true,
      locale,
    });
    return NextResponse.json(run);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : translate(locale, "server.api.adviceFailed");
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request);
  const body = (await request.json().catch(() => null)) as {
    url?: string;
  } | null;
  const rawUrl = body?.url;
  if (!rawUrl) {
    return NextResponse.json(
      { error: translate(locale, "server.api.missingUrl") },
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
    const run = await composeDailyAdvice(parsed.url, {
      force: true,
      locale,
    });
    return NextResponse.json(run);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : translate(locale, "server.api.adviceFailed");
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
