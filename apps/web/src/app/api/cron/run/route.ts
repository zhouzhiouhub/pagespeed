import { NextResponse } from "next/server";
import { z } from "zod";
import { enqueueJob, JOB_NAMES, type JobName } from "@/server/jobs";

export const runtime = "nodejs";
export const maxDuration = 120;

function authorize(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    // local/dev convenience when secret unset
    return process.env.NODE_ENV !== "production";
  }
  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  const urlSecret = new URL(request.url).searchParams.get("secret");
  return urlSecret === secret;
}

const bodySchema = z.object({
  job: z.enum(JOB_NAMES),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", jobs: JOB_NAMES },
      { status: 400 },
    );
  }

  const result = await enqueueJob(
    parsed.data.job as JobName,
    parsed.data.payload ?? {},
  );
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
