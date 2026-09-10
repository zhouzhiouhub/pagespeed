import Link from "next/link";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/audit", label: "网站分析" },
  { href: "/keywords", label: "关键词" },
  { href: "/content", label: "内容" },
  { href: "/geo", label: "GEO" },
  { href: "/advice", label: "增长建议" },
] as const;

export function AppNav({ pathname }: { pathname: string }) {
  return (
    <header className="border-b border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 tracking-tight text-[var(--fg)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/symbol.svg"
            alt="Kinolin"
            width={28}
            height={28}
            className="h-7 w-7 rounded-md"
          />
          <span className="font-semibold">Growth Agent</span>
        </Link>
        <nav className="flex flex-1 flex-wrap items-center gap-1 text-sm">
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  active
                    ? "rounded-md bg-[var(--accent-soft)] px-2.5 py-1.5 font-medium text-[var(--brand-blue)]"
                    : "rounded-md px-2.5 py-1.5 text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <span className="hidden text-xs text-[var(--muted)] sm:inline">
          未接入站点
        </span>
      </div>
    </header>
  );
}
