import Link from "next/link";
import { PageShell } from "@/components/page-shell";

export default function DashboardPage() {
  return (
    <PageShell
      title="Dashboard"
      description="今天站点怎么样，以及最值得做的 3 件事。"
    >
      <div className="space-y-6">
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
          <p className="text-sm text-[var(--muted)]">今日问候</p>
          <p className="mt-1 text-lg font-medium text-[var(--fg)]">
            还没有接入网站。从增长建议或网站分析开始，把 URL 交给 Agent。
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          {[
            {
              href: "/advice",
              title: "今日增长建议",
              body: "高优先级行动卡（空态）",
            },
            {
              href: "/audit",
              title: "网站分析",
              body: "SEO / GEO 健康度（空态）",
            },
            {
              href: "/geo",
              title: "GEO",
              body: "AI 可见性 Readiness（空态）",
            },
          ].map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-4 transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
            >
              <h2 className="font-medium text-[var(--fg)]">{card.title}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{card.body}</p>
            </Link>
          ))}
        </section>
      </div>
    </PageShell>
  );
}
