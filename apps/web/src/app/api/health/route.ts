import { NextResponse } from "next/server";
import { JOB_NAMES } from "@/server/jobs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "webagent",
    version: "0.1.0",
    jobs: JOB_NAMES,
    timestamp: new Date().toISOString(),
  });
}
