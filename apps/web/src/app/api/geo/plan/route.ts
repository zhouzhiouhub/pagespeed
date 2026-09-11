import { NextResponse } from "next/server";
import { z } from "zod";
import { parseSiteUrl } from "@/lib/url";
import { applyProxyDispatcher } from "@/server/http/proxy-bootstrap";
import { generateGeoPlan } from "@/server/geo/plan";

applyProxyDispatcher();

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  url: z.string().min(1),
  opportunity: z.object({
    id: z.string().min(1),
    type: z.enum(["geo_readiness", "geo_asset"]),
    scope: z.enum(["page", "site"]).default("page"),
    title: z.string().min(1),
    page: z.string().min(1),
    missing: z
      .array(
        z.object({
          code: z.string(),
          label: z.string(),
        }),
      )
      .min(1),
    potential: z.number(),
    rationale: z.string(),
    actions: z.array(z.string()),
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
    return NextResponse.json({ error: site.error }, { status: 400 });
  }

  try {
    const plan = await generateGeoPlan(
      site.url,
      parsedBody.data.opportunity,
    );
    return NextResponse.json(plan);
  } catch (err) {
    const message = err instanceof Error ? err.message : "生成 GEO 方案失败";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
