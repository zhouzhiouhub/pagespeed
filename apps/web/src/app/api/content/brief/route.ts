import { NextResponse } from "next/server";
import { z } from "zod";
import { parseSiteUrl, localeFromRequest, localizedUrlError } from "@/lib/url";
import { applyProxyDispatcher } from "@/server/http/proxy-bootstrap";
import { generateContentBrief } from "@/server/content/brief";

applyProxyDispatcher();

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  url: z.string().min(1),
  gap: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    targetKeyword: z.string().min(1),
    potential: z.number(),
    suggestedPath: z.string().min(1),
    intent: z.string().nullable(),
    rationale: z.string(),
    geoHint: z.string().nullable(),
    source: z.enum(["ai", "heuristic"]),
  }),
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsedBody = bodySchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "请求参数无效" }, { status: 400 });
  }

  const site = parseSiteUrl(parsedBody.data.url);
  if (!site.ok) {
    return NextResponse.json({ error: localizedUrlError(site.code, localeFromRequest(request)) }, { status: 400 });
  }

  try {
    const brief = await generateContentBrief(site.url, parsedBody.data.gap);
    return NextResponse.json(brief);
  } catch (err) {
    const message = err instanceof Error ? err.message : "生成 Brief 失败";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
