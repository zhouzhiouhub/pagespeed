import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listGscSites, matchProperty } from "@/server/gsc/client";
import { getGoogleAccessToken } from "@/server/google/tokens";
import { parseSiteUrl } from "@/lib/url";

export async function GET(request: Request) {
  const session = await auth();
  const token = await getGoogleAccessToken({
    sessionAccessToken: session?.accessToken,
    requireScope: "gsc",
  });
  if (!token.accessToken) {
    return NextResponse.json(
      { error: token.error ?? "未连接 Google 账号" },
      { status: 401 },
    );
  }

  try {
    const sites = await listGscSites(token.accessToken);
    const { searchParams } = new URL(request.url);
    const rawUrl = searchParams.get("url");
    const parsed = rawUrl ? parseSiteUrl(rawUrl) : null;
    const suggested = parsed?.ok ? matchProperty(parsed.url, sites) : null;

    return NextResponse.json({
      sites,
      suggestedProperty: suggested,
      tokenSource: token.source,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "无法列出 GSC 站点";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
