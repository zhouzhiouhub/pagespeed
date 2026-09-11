import { NextResponse } from "next/server";
import { enqueueJob } from "@/server/jobs";
import { listPersistedOpportunities } from "@/server/insights/opportunities-store";
import { parseSiteUrl } from "@/lib/url";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "缺少 url" }, { status: 400 });
  }
  const parsed = parseSiteUrl(url);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const listed = await listPersistedOpportunities(parsed.url);
  return NextResponse.json(listed);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { url?: string };
  if (!body.url) {
    return NextResponse.json({ error: "缺少 url" }, { status: 400 });
  }
  const parsed = parseSiteUrl(body.url);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const result = await enqueueJob("insights.opportunities", {
    url: parsed.url,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
