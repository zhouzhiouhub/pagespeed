import { ContentClient } from "@/components/content-client";
import { parseSiteUrl } from "@/lib/url";

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const params = await searchParams;
  const parsed = params.url ? parseSiteUrl(params.url) : null;
  return <ContentClient initialUrl={parsed?.ok ? parsed.url : null} />;
}
