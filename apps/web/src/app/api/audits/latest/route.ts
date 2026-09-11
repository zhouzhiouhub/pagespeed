import { NextResponse } from "next/server";
import { getLatestAuditForUrl } from "@/server/sites/repo";
import { parseSiteUrl } from "@/lib/url";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "缺少 url" }, { status: 400 });
  }
  const parsed = parseSiteUrl(url);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const latest = await getLatestAuditForUrl(parsed.url);
  if (!latest) {
    return NextResponse.json(
      { error: "暂无审计结果，请先运行爬取", site: null, audit: null },
      { status: 404 },
    );
  }

  return NextResponse.json({
    site: latest.site,
    audit: latest.audit,
  });
}
