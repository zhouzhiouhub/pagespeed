import { NextResponse } from "next/server";
import { parseSiteUrl, localeFromRequest, localizedUrlError } from "@/lib/url";
import { applyProxyDispatcher } from "@/server/http/proxy-bootstrap";
import { analyzeGeo } from "@/server/geo/analyze";

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
    const locale = localeFromRequest(request);
    const result = await analyzeGeo(parsed.url, locale);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "GEO 分析失败";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
