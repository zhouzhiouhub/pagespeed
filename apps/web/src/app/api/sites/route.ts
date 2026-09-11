import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureSite, listSites } from "@/server/sites/repo";
import { parseSiteUrl, localeFromRequest, localizedUrlError } from "@/lib/url";

export const runtime = "nodejs";

export async function GET() {
  const sites = await listSites();
  return NextResponse.json({ sites });
}

const bodySchema = z.object({
  url: z.string().min(1),
  name: z.string().optional(),
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "缺少 url" }, { status: 400 });
  }
  const siteUrl = parseSiteUrl(parsed.data.url);
  if (!siteUrl.ok) {
    return NextResponse.json({ error: localizedUrlError(siteUrl.code, localeFromRequest(request)) }, { status: 400 });
  }

  const site = await ensureSite(siteUrl.url, parsed.data.name);
  return NextResponse.json({ site });
}
