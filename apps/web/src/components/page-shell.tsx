"use client";

import { useT } from "@/components/i18n-provider";

export function PageShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-8 max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--fg)]">
          {title}
        </h1>
        <p className="mt-2 text-[var(--muted)]">{description}</p>
      </div>
      {children ?? (
        <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-16 text-center text-sm text-[var(--muted)]">
          {t("common.emptyState")}
        </div>
      )}
    </div>
  );
}
