import { NextResponse } from "next/server";
import { parseSiteUrl, localeFromRequest, localizedUrlError } from "@/lib/url";
import { applyProxyDispatcher } from "@/server/http/proxy-bootstrap";
import { composeDailyAdvice } from "@/server/agents/advice";
import { readAdviceRun } from "@/server/advice/store";

applyProxyDispatcher();

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url");
  const force = searchParams.get("force") === "1";
  if (!rawUrl) {
    return NextResponse.json({ error: "缺少 url 参数" }, { status: 400 });
  }

  const parsed = parseSiteUrl(rawUrl);
  if (!parsed.ok) {
    return NextResponse.json({ error: localizedUrlError(parsed.code, localeFromRequest(request)) }, { status: 400 });
  }

  try {
    if (!force) {
      const cached = await readAdviceRun(parsed.url);
      if (cached) {
        return NextResponse.json(cached);
      }
    }
    const run = await composeDailyAdvice(parsed.url, { force: true });
    return NextResponse.json(run);
  } catch (err) {
    const message = err instanceof Error ? err.message : "生成增长建议失败";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    url?: string;
  } | null;
  const rawUrl = body?.url;
  if (!rawUrl) {
    return NextResponse.json({ error: "缺少 url" }, { status: 400 });
  }
  const parsed = parseSiteUrl(rawUrl);
  if (!parsed.ok) {
    return NextResponse.json({ error: localizedUrlError(parsed.code, localeFromRequest(request)) }, { status: 400 });
  }

  try {
    const run = await composeDailyAdvice(parsed.url, { force: true });
    return NextResponse.json(run);
  } catch (err) {
    const message = err instanceof Error ? err.message : "生成增长建议失败";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
