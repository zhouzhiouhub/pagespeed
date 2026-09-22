"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n, useT } from "@/components/i18n-provider";
import { dateLocale } from "@/lib/i18n/locale";

type Ga4Status = {
  connected: boolean;
  email: string | null;
  hasGa4Scope: boolean;
  hasOfflineToken: boolean;
  selectedPropertyId: string | null;
  selectedPropertyName: string | null;
  lastSyncedAt: string | null;
  sessions7d: number;
  users7d: number;
  properties: Array<{ propertyId: string; displayName: string }>;
  suggestedPropertyId: string | null;
  error: string | null;
};

export function Ga4ConnectPanel({
  siteUrl,
  onSynced,
}: {
  siteUrl: string;
  onSynced: () => void;
}) {
  const t = useT();
  const { locale } = useI18n();
  const [status, setStatus] = useState<Ga4Status | null>(null);
  const [propertyId, setPropertyId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/ga4?url=${encodeURIComponent(siteUrl)}`);
    const json = (await res.json()) as Ga4Status;
    setStatus(json);
    const next =
      json.selectedPropertyId ||
      json.suggestedPropertyId ||
      json.properties[0]?.propertyId ||
      "";
    if (next) setPropertyId(next);
    return json;
  }, [siteUrl]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function syncNow() {
    if (!propertyId) {
      setMessage(t("ga4.selectProperty"));
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/ga4", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ propertyId, url: siteUrl }),
      });
      const json = (await res.json()) as {
        error?: string;
        sessions7d?: number;
      };
      if (!res.ok) {
        setMessage(json.error ?? t("ga4.syncFailed"));
        return;
      }
      setMessage(t("ga4.synced", { sessions: json.sessions7d ?? 0 }));
      await refresh();
      onSynced();
    } catch {
      setMessage(t("common.networkErrorShort"));
    } finally {
      setBusy(false);
    }
  }

  const callback = `/?url=${encodeURIComponent(siteUrl)}`;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-[var(--fg)]">GA4</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {status?.connected
              ? t("ga4.stats7d", {
                  sessions: status.sessions7d,
                  users: status.users7d,
                })
              : status?.hasGa4Scope || status?.hasOfflineToken
                ? t("ga4.authorizedHint")
                : t("ga4.connectHint")}
          </p>
          {status?.email ? (
            <p className="mt-1 text-xs text-[var(--muted)]">{status.email}</p>
          ) : null}
        </div>
        {!status?.hasGa4Scope && !status?.hasOfflineToken ? (
          <a
            href={`/api/google/connect?callbackUrl=${encodeURIComponent(callback)}`}
            className="rounded-lg bg-[var(--brand-blue)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--brand-blue-deep)]"
          >
            {t("ga4.connectGoogle")}
          </a>
        ) : null}
      </div>

      {(status?.hasGa4Scope || status?.hasOfflineToken || status?.connected) && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <select
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            className="h-10 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm"
          >
            <option value="">{t("ga4.chooseProperty")}</option>
            {(status?.properties ?? []).map((p) => (
              <option key={p.propertyId} value={p.propertyId}>
                {p.displayName} ({p.propertyId})
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !propertyId}
            onClick={() => void syncNow()}
            className="h-10 rounded-lg border border-[var(--border)] px-4 text-sm font-medium hover:bg-[var(--surface-2)] disabled:opacity-50"
          >
            {busy ? t("ga4.syncing") : t("ga4.syncGa4")}
          </button>
        </div>
      )}

      {status?.lastSyncedAt ? (
        <p className="mt-3 text-xs text-[var(--muted)]">
          {t("ga4.lastSynced", {
            time: new Date(status.lastSyncedAt).toLocaleString(
              dateLocale(locale),
            ),
          })}
          {status.selectedPropertyName
            ? ` · ${status.selectedPropertyName}`
            : ""}
        </p>
      ) : null}
      {message ? (
        <p className="mt-2 text-sm text-[var(--fg)]">{message}</p>
      ) : null}
      {status?.error ? (
        <p className="mt-2 text-sm text-[#d93025]">{status.error}</p>
      ) : null}
    </div>
  );
}
