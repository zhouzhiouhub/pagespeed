"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Ga4ConnectPanel } from "@/components/ga4-connect-panel";
import { GscConnectPanel } from "@/components/gsc-connect-panel";
import { useT } from "@/components/i18n-provider";
import { parseSiteUrl, urlErrorMessageKey } from "@/lib/url";
import { writeOnboardingDone, writeSiteUrl } from "@/lib/site";

type Step = 1 | 2 | 3 | 4 | 5;

type ScanPhase = "idle" | "crawl" | "advice" | "done" | "error";

export function OnboardingClient({
  initialUrl,
}: {
  initialUrl: string | null;
}) {
  const t = useT();
  const router = useRouter();
  const [step, setStep] = useState<Step>(initialUrl ? 2 : 1);
  const [urlInput, setUrlInput] = useState(initialUrl ?? "");
  const [siteUrl, setSiteUrl] = useState<string | null>(initialUrl);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [scanPhase, setScanPhase] = useState<ScanPhase>("idle");
  const [scanDetail, setScanDetail] = useState<string | null>(null);

  const steps = useMemo(
    () =>
      [
        { id: 1 as const, label: t("onboarding.stepUrl") },
        { id: 2 as const, label: t("onboarding.stepGsc") },
        { id: 3 as const, label: t("onboarding.stepGa4") },
        { id: 4 as const, label: t("onboarding.stepScan") },
        { id: 5 as const, label: t("onboarding.stepDone") },
      ] as const,
    [t],
  );

  function onUrlSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = parseSiteUrl(urlInput);
    if (!result.ok) {
      setError(t(urlErrorMessageKey(result.code)));
      return;
    }
    setError(null);
    writeSiteUrl(result.url);
    setSiteUrl(result.url);
    setUrlInput(result.url);
    startTransition(() => {
      setStep(2);
      router.replace(`/onboarding?url=${encodeURIComponent(result.url)}`);
    });
  }

  async function runScan() {
    if (!siteUrl) return;
    setError(null);
    setScanPhase("crawl");
    setScanDetail(t("onboarding.scanCrawl"));
    try {
      const crawlRes = await fetch("/api/crawl", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: siteUrl, maxPages: 20 }),
      });
      const crawlJson = (await crawlRes.json()) as { error?: string };
      if (!crawlRes.ok) {
        setScanPhase("error");
        setError(crawlJson.error ?? t("dashboard.crawlFailed"));
        return;
      }

      setScanPhase("advice");
      setScanDetail(t("onboarding.scanAdvice"));
      const adviceRes = await fetch("/api/advice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: siteUrl }),
      });
      const adviceJson = (await adviceRes.json()) as { error?: string };
      if (!adviceRes.ok) {
        setScanPhase("error");
        setError(adviceJson.error ?? t("common.loadFailed"));
        return;
      }

      setScanPhase("done");
      setScanDetail(t("onboarding.scanDone"));
      writeOnboardingDone(true);
      setStep(5);
    } catch {
      setScanPhase("error");
      setError(t("common.networkError"));
    }
  }

  function finish() {
    if (!siteUrl) return;
    writeOnboardingDone(true);
    router.push(`/?url=${encodeURIComponent(siteUrl)}`);
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <p className="text-sm font-medium text-[var(--brand-blue)]">
        {t("onboarding.kicker")}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--fg)]">
        {t("onboarding.title")}
      </h1>
      <p className="mt-3 text-[var(--muted)]">{t("onboarding.subtitle")}</p>

      <ol className="mt-8 flex flex-wrap gap-2">
        {steps.map((s) => {
          const active = s.id === step;
          const done = s.id < step;
          return (
            <li
              key={s.id}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                active
                  ? "bg-[var(--brand-blue)] text-white"
                  : done
                    ? "bg-[var(--surface)] text-[var(--fg)] ring-1 ring-[var(--border)]"
                    : "bg-transparent text-[var(--muted)] ring-1 ring-[var(--border)]"
              }`}
            >
              {s.id}. {s.label}
            </li>
          );
        })}
      </ol>

      <div className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_1px_2px_rgba(11,23,48,0.04)]">
        {step === 1 ? (
          <form onSubmit={onUrlSubmit} className="space-y-4" noValidate>
            <div>
              <label
                htmlFor="onboarding-url"
                className="text-sm font-medium text-[var(--fg)]"
              >
                {t("url.label")}
              </label>
              <input
                id="onboarding-url"
                type="url"
                inputMode="url"
                autoComplete="url"
                autoFocus
                value={urlInput}
                onChange={(e) => {
                  setUrlInput(e.target.value);
                  if (error) setError(null);
                }}
                placeholder={t("url.placeholder")}
                className="mt-2 h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 text-base outline-none focus:border-[var(--brand-blue)]"
              />
              <p className="mt-2 text-sm text-[var(--muted)]">
                {t("onboarding.urlHint")}
              </p>
            </div>
            {error ? (
              <p role="alert" className="text-sm text-[#c62828]">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={pending}
              className="h-11 rounded-xl bg-[var(--brand-blue)] px-5 text-sm font-semibold text-white hover:bg-[var(--brand-blue-deep)] disabled:opacity-70"
            >
              {t("onboarding.continue")}
            </button>
          </form>
        ) : null}

        {step === 2 && siteUrl ? (
          <div className="space-y-4">
            <p className="text-sm text-[var(--muted)]">
              {t("onboarding.gscHint")}
            </p>
            <GscConnectPanel siteUrl={siteUrl} onSynced={() => undefined} />
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="h-11 rounded-xl bg-[var(--brand-blue)] px-5 text-sm font-semibold text-white"
              >
                {t("onboarding.continue")}
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="h-11 rounded-xl px-5 text-sm font-medium text-[var(--muted)] ring-1 ring-[var(--border)]"
              >
                {t("onboarding.skip")}
              </button>
            </div>
          </div>
        ) : null}

        {step === 3 && siteUrl ? (
          <div className="space-y-4">
            <p className="text-sm text-[var(--muted)]">
              {t("onboarding.ga4Hint")}
            </p>
            <Ga4ConnectPanel siteUrl={siteUrl} onSynced={() => undefined} />
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep(4)}
                className="h-11 rounded-xl bg-[var(--brand-blue)] px-5 text-sm font-semibold text-white"
              >
                {t("onboarding.continue")}
              </button>
              <button
                type="button"
                onClick={() => setStep(4)}
                className="h-11 rounded-xl px-5 text-sm font-medium text-[var(--muted)] ring-1 ring-[var(--border)]"
              >
                {t("onboarding.skip")}
              </button>
            </div>
          </div>
        ) : null}

        {step === 4 && siteUrl ? (
          <div className="space-y-4">
            <p className="text-sm text-[var(--muted)]">
              {t("onboarding.scanHint")}
            </p>
            {scanPhase === "idle" || scanPhase === "error" ? (
              <button
                type="button"
                onClick={() => void runScan()}
                className="h-11 rounded-xl bg-[var(--brand-blue)] px-5 text-sm font-semibold text-white"
              >
                {t("onboarding.startScan")}
              </button>
            ) : (
              <div className="rounded-xl bg-[var(--background)] px-4 py-3 text-sm text-[var(--fg)]">
                <p className="font-medium">{t("onboarding.scanning")}</p>
                {scanDetail ? (
                  <p className="mt-1 text-[var(--muted)]">{scanDetail}</p>
                ) : null}
              </div>
            )}
            {error ? (
              <p role="alert" className="text-sm text-[#c62828]">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => {
                writeOnboardingDone(true);
                setStep(5);
              }}
              className="text-sm text-[var(--muted)] underline-offset-2 hover:underline"
            >
              {t("onboarding.skipScan")}
            </button>
          </div>
        ) : null}

        {step === 5 && siteUrl ? (
          <div className="space-y-4">
            <p className="text-base text-[var(--fg)]">{t("onboarding.doneBody")}</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
              <li>{t("onboarding.doneBulletAudit")}</li>
              <li>{t("onboarding.doneBulletAdvice")}</li>
              <li>{t("onboarding.doneBulletIntegrations")}</li>
            </ul>
            <button
              type="button"
              onClick={finish}
              className="h-11 rounded-xl bg-[var(--brand-blue)] px-5 text-sm font-semibold text-white"
            >
              {t("onboarding.goDashboard")}
            </button>
          </div>
        ) : null}
      </div>

      <p className="mt-6 text-center text-sm text-[var(--muted)]">
        <Link href="/" className="underline-offset-2 hover:underline">
          {t("onboarding.backDashboard")}
        </Link>
      </p>
    </div>
  );
}
