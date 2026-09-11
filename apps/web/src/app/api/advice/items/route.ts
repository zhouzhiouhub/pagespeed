import { NextResponse } from "next/server";
import { z } from "zod";
import { parseSiteUrl } from "@/lib/url";
import { patchAdviceItemState } from "@/server/advice/store";

export const runtime = "nodejs";

const bodySchema = z.object({
  url: z.string().min(1),
  itemId: z.string().min(1),
  userState: z.enum(["open", "acted", "snoozed", "dismissed"]),
});

export async function PATCH(request: Request) {
  const json = await request.json().catch(() => null);
  const parsedBody = bodySchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "请求参数无效" }, { status: 400 });
  }

  const site = parseSiteUrl(parsedBody.data.url);
  if (!site.ok) {
    return NextResponse.json({ error: site.error }, { status: 400 });
  }

  const run = await patchAdviceItemState(
    site.url,
    parsedBody.data.itemId,
    parsedBody.data.userState,
  );
  if (!run) {
    return NextResponse.json({ error: "未找到建议项" }, { status: 404 });
  }
  return NextResponse.json(run);
}
