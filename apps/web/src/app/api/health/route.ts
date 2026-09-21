import { NextResponse } from "next/server";
import { JOB_NAMES } from "@/server/jobs";
import { isDatabaseAvailable } from "@/server/db/ready";
import { resolveProxyUrl } from "@/server/http/proxy-bootstrap";
import { isCloudflareRuntime } from "@/server/runtime";

export async function GET() {
  const database = await isDatabaseAvailable();
  const proxy = resolveProxyUrl();
  return NextResponse.json({
    ok: true,
    service: "webagent",
    version: "0.1.0",
    jobs: JOB_NAMES,
    database,
    cloudflare: isCloudflareRuntime(),
    runtime: {
      next: process.env.NEXT_RUNTIME ?? null,
      cloudflareEnv: process.env.CLOUDFLARE ?? null,
    },
    proxy: proxy ? { configured: true, url: proxy } : { configured: false },
    timestamp: new Date().toISOString(),
  });
}
