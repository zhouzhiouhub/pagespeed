import { NextResponse } from "next/server";
import { z } from "zod";
import { parseSiteUrl } from "@/lib/url";
import { applyProxyDispatcher } from "@/server/http/proxy-bootstrap";
import { generateKeywordActionPlan } from "@/server/agents/action-plan";

applyProxyDispatcher();

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  url: z.string().min(1),
  opportunity: z.object({
    query: z.string().min(1),
    position: z.number().nullable(),
    potential: z.number(),
    page: z.string(),
    trend7d: z.number().nullable(),
    intent: z.string().nullable(),
    rationale: z.string(),
    actions: z.array(z.string()),
    source: z.enum(["gsc", "ai", "heuristic"]),
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
    const plan = await generateKeywordActionPlan(
      site.url,
      parsedBody.data.opportunity,
    );
    return NextResponse.json(plan);
  } catch (err) {
    const message = err instanceof Error ? err.message : "生成方案失败";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
