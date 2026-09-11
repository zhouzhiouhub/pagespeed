import { NextResponse } from "next/server";
import { getGa4Status } from "@/server/integrations/ga4";
import { getIntegrationStatus } from "@/server/integrations";
import { readGscStore } from "@/server/gsc/store";
import { readAdviceRun } from "@/server/advice/store";
import { getLatestAuditForUrl, ensureSite } from "@/server/sites/repo";
import { isDatabaseAvailable } from "@/server/db/ready";
import { parseSiteUrl } from "@/lib/url";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const urlParam = new URL(request.url).searchParams.get("url");
  if (!urlParam) {
    return NextResponse.json({ error: "缺少 url" }, { status: 400 });
  }
  const parsed = parseSiteUrl(urlParam);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const site = await ensureSite(parsed.url);
  const latest = await getLatestAuditForUrl(parsed.url);
  const gsc = await readGscStore();
  const advice = await readAdviceRun(parsed.url);
  const ga4 = await getGa4Status(parsed.url);
  const pagespeed = await getIntegrationStatus(site.id, "pagespeed");
  const dbOk = await isDatabaseAvailable();

  const gscConnected = Boolean(gsc.selectedProperty && gsc.lastSyncedAt);

  return NextResponse.json({
    site: {
      id: site.id,
      url: site.url,
      name: site.name,
      status: site.status,
    },
    database: { available: dbOk },
    scores: latest?.audit.scores ?? site.lastScores ?? null,
    audit: latest?.audit
      ? {
          id: latest.audit.id,
          finishedAt: latest.audit.finishedAt,
          pageCount: latest.audit.pageCount,
          issueCount: latest.audit.issueCount,
          summary: latest.audit.summary,
        }
      : null,
    integrations: {
      pagespeed: pagespeed.connected,
      gsc: gscConnected,
      ga4: ga4.connected,
    },
    gsc: gscConnected
      ? {
          property: gsc.selectedProperty,
          lastSyncedAt: gsc.lastSyncedAt,
          rowCount: gsc.rows.length,
          opportunityCount: gsc.opportunities.length,
        }
      : null,
    ga4,
    advice: advice
      ? {
          runId: advice.runId,
          generatedAt: advice.generatedAt,
          headline: advice.headline,
          openCount: advice.items.filter((i) => i.userState === "open").length,
          itemCount: advice.items.length,
        }
      : null,
  });
}
