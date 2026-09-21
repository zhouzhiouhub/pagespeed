"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useT } from "@/components/i18n-provider";
import { parseSiteUrl, urlErrorMessageKey } from "@/lib/url";
import { SITE_STORAGE_KEY, writeSiteUrl } from "@/lib/site";

export function SiteUrlForm({
  initialUrl = "",
  hint,
  autoFocus = true,
  onConfirm,
}: {
  initialUrl?: string;
  hint?: string;
  autoFocus?: boolean;
  onConfirm?: (url: string) => void;
}) {
  const t = useT();
  const router = useRouter();
  const [value, setValue] = useState(initialUrl);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const hintText = hint ?? t("url.hint");

  useEffect(() => {
    if (initialUrl) {
      setValue(initialUrl);
      return;
    }
    try {
      const saved = localStorage.getItem(SITE_STORAGE_KEY);
      if (saved) setValue(saved);
    } catch {
      // ignore
    }
  }, [initialUrl]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw = new FormData(e.currentTarget).get("url");
    const input = typeof raw === "string" ? raw : value;
    const result = parseSiteUrl(input);
    if (!result.ok) {
      setError(t(urlErrorMessageKey(result.code)));
      return;
    }

    setError(null);
    setValue(result.url);
    writeSiteUrl(result.url);

    startTransition(() => {
      if (onConfirm) {
        onConfirm(result.url);
        return;
      }
      router.push(`/?url=${encodeURIComponent(result.url)}`);
    });
  }

  return (
    <form
      action="/"
      method="get"
      onSubmit={onSubmit}
      className="w-full"
      noValidate
    >
      <div className="flex items-stretch gap-3">
        <label className="sr-only" htmlFor="site-url">
          {t("url.label")}
        </label>
        <input
          id="site-url"
          name="url"
          type="url"
          inputMode="url"
          autoComplete="url"
          autoFocus={autoFocus}
          placeholder={t("url.placeholder")}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "site-url-error" : undefined}
          className="h-12 min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-base text-[var(--fg)] shadow-[0_1px_2px_rgba(11,23,48,0.04)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--muted)] focus:border-[var(--brand-blue)] focus:shadow-[0_0_0_3px_rgba(22,119,255,0.18)]"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-12 shrink-0 rounded-xl bg-[var(--brand-blue)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--brand-blue-deep)] disabled:cursor-wait disabled:opacity-70"
        >
          {pending ? t("url.preparing") : t("url.confirm")}
        </button>
      </div>
      {error ? (
        <p id="site-url-error" role="alert" className="mt-3 text-sm text-[#c62828]">
          {error}
        </p>
      ) : (
        <p className="mt-3 text-sm text-[var(--muted)]">{hintText}</p>
      )}
    </form>
  );
}
