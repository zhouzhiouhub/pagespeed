import { NextResponse } from "next/server";
import { z } from "zod";
import { parseSiteUrl, localeFromRequest, localizedUrlError } from "@/lib/url";
import { applyProxyDispatcher } from "@/server/http/proxy-bootstrap";
import { generateAdviceActionPlan } from "@/server/agents/advice-plan";
import { readAdviceRun } from "@/server/advice/store";

applyProxyDispatcher();

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  url: z.string().min(1),
  itemId: z.string().min(1),
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

  const run = await readAdviceRun(site.url);
  const item = run?.items.find((i) => i.id === parsedBody.data.itemId);
  if (!item) {
    return NextResponse.json(
      { error: "找不到该建议项，请先生成今日建议" },
      { status: 404 },
    );
  }

  try {
    const plan = await generateAdviceActionPlan(site.url, item);
    return NextResponse.json({ itemId: item.id, plan });
  } catch (err) {
    const message = err instanceof Error ? err.message : "生成方案失败";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
