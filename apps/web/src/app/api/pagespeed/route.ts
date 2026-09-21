import { NextResponse } from "next/server";
import { localizedUrlError, localeFromRequest, parseSiteUrl } from "@/lib/url";
import { getServerEnv } from "@/server/env";
import { runPageSpeed, type PsiStrategy } from "@/server/integrations/pagespeed";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url");
  const strategyParam = searchParams.get("strategy");
  const strategy: PsiStrategy =
    strategyParam === "desktop" ? "desktop" : "mobile";
  const localeParam = searchParams.get("locale");
  const psiLocale = localeParam === "en" ? "en" : "zh-CN";
  const locale = localeFromRequest(request);

  if (!rawUrl) {
    return NextResponse.json(
      {
        error:
          locale === "en" ? "Missing url parameter" : "缺少 url 参数",
      },
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

  if (
    !(await getServerEnv("PAGESPEED_API_KEY")) &&
    !(await getServerEnv("GOOGLE_API_KEY"))
  ) {
    return NextResponse.json(
      {
        error:
          locale === "en"
            ? "PAGESPEED_API_KEY or GOOGLE_API_KEY is not configured"
            : "未配置 PAGESPEED_API_KEY 或 GOOGLE_API_KEY",
      },
      { status: 503 },
    );
  }

  try {
    const summary = await runPageSpeed(parsed.url, strategy, psiLocale);
    return NextResponse.json(summary);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : locale === "en"
          ? "PageSpeed analysis failed"
          : "PageSpeed 分析失败";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
