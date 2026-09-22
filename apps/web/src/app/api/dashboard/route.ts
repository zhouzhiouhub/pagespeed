import { NextResponse } from "next/server";
import { getGa4Status } from "@/server/integrations/ga4";
import { getIntegrationStatus } from "@/server/integrations";
import { readAdviceRun } from "@/server/advice/store";
import { getLatestAuditForUrl, ensureSite } from "@/server/sites/repo";
import { isDatabaseAvailable } from "@/server/db/ready";
import { parseSiteUrl, localeFromRequest, localizedUrlError } from "@/lib/url";
import { translate } from "@/lib/i18n/messages";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const locale = localeFromRequest(request);
  const urlParam = new URL(request.url).searchParams.get("url");
  if (!urlParam) {
    return NextResponse.json(
      { error: translate(locale, "server.api.missingUrl") },
      { status: 400 },
    );
  }
  const parsed = parseSiteUrl(urlParam);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: localizedUrlError(parsed.code, locale) },
      { status: 400 },
    );
  }

  const site = await ensureSite(parsed.url);
  const latest = await getLatestAuditForUrl(parsed.url);
  const advice = await readAdviceRun(parsed.url);
  const ga4 = await getGa4Status(parsed.url, locale);
  const pagespeed = await getIntegrationStatus(site.id, "pagespeed");
  const dbOk = await isDatabaseAvailable();

  const openCount = advice
    ? advice.items.filter((i) => i.userState === "open").length
    : 0;
  const adviceLocaleOk = advice?.locale ? advice.locale === locale : false;

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
      ga4: ga4.connected,
    },
    ga4: {
      ...ga4,
      topPages: ga4.topPages ?? [],
    },
    advice: advice
      ? {
          runId: advice.runId,
          generatedAt: advice.generatedAt,
          headline: adviceLocaleOk
            ? advice.headline
            : translate(locale, "server.advice.headlineOpen", {
                count: openCount,
              }),
          openCount,
          itemCount: advice.items.length,
        }
      : null,
  });
}
