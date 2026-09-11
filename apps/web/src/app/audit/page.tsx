import { AuditClient } from "@/components/audit-client";
import { parseSiteUrl } from "@/lib/url";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const params = await searchParams;
  const parsed = params.url ? parseSiteUrl(params.url) : null;
  const siteUrl = parsed?.ok ? parsed.url : null;

  return <AuditClient initialUrl={siteUrl} />;
}
