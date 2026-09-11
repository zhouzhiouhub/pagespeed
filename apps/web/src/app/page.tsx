import { DashboardClient } from "@/components/dashboard-client";
import { parseSiteUrl } from "@/lib/url";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const params = await searchParams;
  let initialUrl: string | null = null;
  if (params.url) {
    const parsed = parseSiteUrl(params.url);
    if (parsed.ok) initialUrl = parsed.url;
  }

  return <DashboardClient initialUrl={initialUrl} />;
}
