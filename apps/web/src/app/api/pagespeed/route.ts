import { NextResponse } from "next/server";
import { parseSiteUrl } from "@/lib/url";
import { runPageSpeed, type PsiStrategy } from "@/server/integrations/pagespeed";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url");
  const strategyParam = searchParams.get("strategy");
  const strategy: PsiStrategy =
    strategyParam === "desktop" ? "desktop" : "mobile";

  if (!rawUrl) {
    return NextResponse.json({ error: "缺少 url 参数" }, { status: 400 });
  }

  const parsed = parseSiteUrl(rawUrl);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  if (
    !process.env.PAGESPEED_API_KEY?.trim() &&
    !process.env.GOOGLE_API_KEY?.trim()
  ) {
    return NextResponse.json(
      { error: "未配置 PAGESPEED_API_KEY 或 GOOGLE_API_KEY" },
      { status: 503 },
    );
  }

  try {
    const summary = await runPageSpeed(parsed.url, strategy);
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : "PageSpeed 分析失败";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
