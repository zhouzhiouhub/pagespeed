import { redirect } from "next/navigation";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const params = await searchParams;
  if (params.url) {
    redirect(`/audit?url=${encodeURIComponent(params.url)}`);
  }
  redirect("/audit");
}
