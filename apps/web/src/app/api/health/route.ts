import { NextResponse } from "next/server";
import { JOB_NAMES } from "@/server/jobs";
import { isDatabaseAvailable } from "@/server/db/ready";

export async function GET() {
  const database = await isDatabaseAvailable();
  return NextResponse.json({
    ok: true,
    service: "webagent",
    version: "0.1.0",
    jobs: JOB_NAMES,
    database,
    timestamp: new Date().toISOString(),
  });
}
