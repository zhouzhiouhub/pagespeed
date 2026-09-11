import { NextResponse } from "next/server";
import { z } from "zod";
import { enqueueJob } from "@/server/jobs";
import { getCrawlJob } from "@/server/crawler";
import { parseSiteUrl } from "@/lib/url";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  url: z.string().min(1),
  maxPages: z.number().int().positive().max(200).optional(),
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "缺少 url" }, { status: 400 });
  }
  const siteUrl = parseSiteUrl(parsed.data.url);
  if (!siteUrl.ok) {
    return NextResponse.json({ error: siteUrl.error }, { status: 400 });
  }

  const result = await enqueueJob("crawl.full", {
    url: siteUrl.url,
    maxPages: parsed.data.maxPages,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "crawl failed", detail: result.detail },
      { status: 502 },
    );
  }

  const crawl = result.detail.jobId
    ? getCrawlJob(String(result.detail.jobId))
    : null;

  return NextResponse.json({
    ok: true,
    ...result.detail,
    pages: crawl?.pages.slice(0, 40) ?? [],
    issues: crawl?.issues.slice(0, 80) ?? [],
    robots: crawl?.robots
      ? {
          ok: crawl.robots.ok,
          aiBotPolicy: crawl.robots.aiBotPolicy,
          aiBotSummary: crawl.robots.aiBotSummary,
        }
      : null,
    sitemap: crawl?.sitemap ?? null,
  });
}

export async function GET(request: Request) {
  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "缺少 jobId" }, { status: 400 });
  }
  const crawl = getCrawlJob(jobId);
  if (!crawl) {
    return NextResponse.json({ error: "job not found" }, { status: 404 });
  }
  return NextResponse.json({
    jobId: crawl.jobId,
    scores: crawl.scores,
    summary: crawl.summary,
    pageCount: crawl.pages.length,
    issueCount: crawl.issues.length,
    warning: crawl.warning,
  });
}
