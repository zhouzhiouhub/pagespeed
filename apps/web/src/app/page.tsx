import { SiteUrlForm } from "@/components/site-url-form";

export default function DashboardPage() {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(25,217,255,0.14),transparent_55%),radial-gradient(ellipse_at_80%_20%,rgba(22,119,255,0.10),transparent_45%),linear-gradient(180deg,var(--surface)_0%,var(--background)_48%,var(--background)_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(22,119,255,0.35)] to-transparent"
      />

      <section className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 py-16 sm:py-24">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.svg"
          alt="Kinolin"
          width={220}
          height={60}
          className="h-10 w-auto sm:h-12"
        />

        <h1 className="mt-10 text-center text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl sm:leading-tight">
          让网站持续增长
        </h1>
        <p className="mt-4 max-w-xl text-center text-base leading-relaxed text-[var(--muted)] sm:text-lg">
          输入网址，立刻得到 SEO + GEO 机会与下一步行动——不只是一份报告。
        </p>

        <div className="mt-10 w-full">
          <SiteUrlForm />
        </div>

        <ul className="mt-14 grid w-full gap-4 text-sm text-[var(--muted)] sm:grid-cols-3 sm:gap-6">
          {[
            { title: "SEO", body: "技术与内容机会" },
            { title: "GEO", body: "AI 回答可见性" },
            { title: "行动", body: "每天告诉你做什么" },
          ].map((item) => (
            <li key={item.title} className="text-center">
              <p className="font-medium text-[var(--ink)]">{item.title}</p>
              <p className="mt-1">{item.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
