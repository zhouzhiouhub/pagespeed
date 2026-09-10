import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { parseSiteUrl } from "@/lib/url";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const params = await searchParams;
  const parsed = params.url ? parseSiteUrl(params.url) : null;
  const siteUrl = parsed?.ok ? parsed.url : null;

  return (
    <PageShell
      title="网站分析"
      description="健康度与问题，带上「值不值得修」的语境。SEO + GEO 分数将在首次审计后出现。"
    >
      {siteUrl ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
            <p className="text-sm text-[var(--muted)]">待分析站点</p>
            <p className="mt-1 break-all text-lg font-medium text-[var(--fg)]">
              {siteUrl}
            </p>
            <p className="mt-3 text-sm text-[var(--muted)]">
              爬虫与审计流水线尚未接入（M1）。URL 已记录，可先返回 Dashboard 更换网站。
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex text-sm font-medium text-[var(--brand-blue)] hover:underline"
          >
            ← 更换网站
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-16 text-center">
          <p className="text-sm text-[var(--muted)]">
            还没有网站。请先在 Dashboard 输入 URL。
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex text-sm font-medium text-[var(--brand-blue)] hover:underline"
          >
            去输入网站 →
          </Link>
        </div>
      )}
    </PageShell>
  );
}
