import { NextResponse } from "next/server";
import { runAnalyticsAgent } from "@/server/agents/analytics";
import { parseSiteUrl } from "@/lib/url";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "缺少 url" }, { status: 400 });
  }
  const parsed = parseSiteUrl(url);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const narrative = await runAnalyticsAgent(parsed.url);
    return NextResponse.json(narrative);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analytics Agent 失败";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
