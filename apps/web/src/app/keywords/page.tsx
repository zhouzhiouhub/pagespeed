import { KeywordsClient } from "@/components/keywords-client";
import { parseSiteUrl } from "@/lib/url";

export default async function KeywordsPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const params = await searchParams;
  const parsed = params.url ? parseSiteUrl(params.url) : null;
  return <KeywordsClient initialUrl={parsed?.ok ? parsed.url : null} />;
}
