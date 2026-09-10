"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { parseSiteUrl } from "@/lib/url";

const SITE_STORAGE_KEY = "webagent:site-url";

export function SiteUrlForm({
  initialUrl = "",
  cta = "开始分析",
}: {
  initialUrl?: string;
  cta?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialUrl);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (initialUrl) return;
    try {
      const saved = localStorage.getItem(SITE_STORAGE_KEY);
      if (saved) setValue(saved);
    } catch {
      // ignore
    }
  }, [initialUrl]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const result = parseSiteUrl(value);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setError(null);
    try {
      localStorage.setItem(SITE_STORAGE_KEY, result.url);
    } catch {
      // ignore quota / private mode
    }

    startTransition(() => {
      router.push(`/audit?url=${encodeURIComponent(result.url)}`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="w-full" noValidate>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <label className="sr-only" htmlFor="site-url">
          网站地址
        </label>
        <div className="relative min-w-0 flex-1">
          <input
            id="site-url"
            name="url"
            type="url"
            inputMode="url"
            autoComplete="url"
            autoFocus
            placeholder="输入网站 URL，例如 https://example.com"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "site-url-error" : undefined}
            className="h-14 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-base text-[var(--fg)] shadow-[0_1px_2px_rgba(11,23,48,0.04)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--muted)] focus:border-[var(--brand-blue)] focus:shadow-[0_0_0_3px_rgba(22,119,255,0.18)]"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="h-14 shrink-0 rounded-xl bg-[var(--brand-blue)] px-7 text-base font-semibold text-white transition-colors hover:bg-[var(--brand-blue-deep)] disabled:cursor-wait disabled:opacity-70"
        >
          {pending ? "准备中…" : cta}
        </button>
      </div>
      {error ? (
        <p id="site-url-error" role="alert" className="mt-3 text-sm text-[#c62828]">
          {error}
        </p>
      ) : (
        <p className="mt-3 text-sm text-[var(--muted)]">
          将启动 SEO + GEO Readiness 扫描。GSC / GA4 可稍后连接。
        </p>
      )}
    </form>
  );
}

export { SITE_STORAGE_KEY };
