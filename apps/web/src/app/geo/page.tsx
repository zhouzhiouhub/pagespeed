import { GeoClient } from "@/components/geo-client";
import { parseSiteUrl } from "@/lib/url";

export default async function GeoPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const params = await searchParams;
  const parsed = params.url ? parseSiteUrl(params.url) : null;
  return <GeoClient initialUrl={parsed?.ok ? parsed.url : null} />;
}
