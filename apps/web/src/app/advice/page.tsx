import { AdviceClient } from "@/components/advice-client";
import { parseSiteUrl } from "@/lib/url";

export default async function AdvicePage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const params = await searchParams;
  const parsed = params.url ? parseSiteUrl(params.url) : null;
  return <AdviceClient initialUrl={parsed?.ok ? parsed.url : null} />;
}
