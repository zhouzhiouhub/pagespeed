"use client";

import { useCallback, useEffect, useState } from "react";

type GscStatus = {
  connected: boolean;
  email: string | null;
  hasGscScope: boolean;
  error: string | null;
  selectedProperty: string | null;
  lastSyncedAt: string | null;
  opportunityCount: number;
};

type GscSite = {
  siteUrl: string;
  permissionLevel?: string;
};

export function GscConnectPanel({
  siteUrl,
  onSynced,
}: {
  siteUrl: string;
  onSynced: () => void;
}) {
  const [status, setStatus] = useState<GscStatus | null>(null);
  const [sites, setSites] = useState<GscSite[]>([]);
  const [property, setProperty] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    const res = await fetch("/api/gsc/status");
    const json = (await res.json()) as GscStatus;
    setStatus(json);
    if (json.selectedProperty) setProperty(json.selectedProperty);
    return json;
  }, []);

  const loadSites = useCallback(async () => {
    const res = await fetch(`/api/gsc/sites?url=${encodeURIComponent(siteUrl)}`);
    const json = (await res.json()) as {
      sites?: GscSite[];
      suggestedProperty?: string | null;
      error?: string;
    };
    if (!res.ok) {
      setMessage(json.error ?? "无法读取 GSC 站点列表");
      return;
    }
    setSites(json.sites ?? []);
    if (json.suggestedProperty) setProperty(json.suggestedProperty);
    else if (json.sites?.[0]?.siteUrl) setProperty(json.sites[0].siteUrl);
  }, [siteUrl]);

  useEffect(() => {
    void (async () => {
      const s = await refreshStatus();
      if (s.connected) await loadSites();
    })();
  }, [refreshStatus, loadSites]);

  async function syncNow() {
    if (!property) {
      setMessage("请选择 Search Console 资源");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/gsc/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ property, url: siteUrl }),
      });
      const json = (await res.json()) as {
        error?: string;
        opportunityCount?: number;
      };
      if (!res.ok) {
        setMessage(json.error ?? "同步失败");
        return;
      }
      setMessage(`已同步，识别到 ${json.opportunityCount ?? 0} 个关键词机会`);
      await refreshStatus();
      onSynced();
    } catch {
      setMessage("网络错误，同步失败");
    } finally {
      setBusy(false);
    }
  }

  const callback = `/keywords?url=${encodeURIComponent(siteUrl)}`;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--fg)]">Google Search Console</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {status?.connected
              ? `已登录${status.email ? `：${status.email}` : ""}`
              : "连接后拉取真实查询、排名与 CTR，替换启发式结果"}
          </p>
          {status?.selectedProperty ? (
            <p className="mt-1 text-xs text-[var(--muted)]">
              资源：{status.selectedProperty}
              {status.lastSyncedAt
                ? ` · 同步于 ${new Date(status.lastSyncedAt).toLocaleString()}`
                : ""}
            </p>
          ) : null}
        </div>

        {!status?.connected ? (
          <a
            href={`/api/gsc/connect?callbackUrl=${encodeURIComponent(callback)}`}
            className="rounded-lg bg-[var(--brand-blue)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--brand-blue-deep)]"
          >
            连接 GSC
          </a>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={property}
              onChange={(e) => setProperty(e.target.value)}
              className="max-w-[16rem] rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            >
              {sites.length === 0 ? (
                <option value="">加载站点中…</option>
              ) : (
                sites.map((s) => (
                  <option key={s.siteUrl} value={s.siteUrl}>
                    {s.siteUrl}
                  </option>
                ))
              )}
            </select>
            <button
              type="button"
              disabled={busy || !property}
              onClick={() => void syncNow()}
              className="rounded-lg bg-[var(--brand-blue)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--brand-blue-deep)] disabled:opacity-60"
            >
              {busy ? "同步中…" : "同步关键词"}
            </button>
          </div>
        )}
      </div>
      {message ? (
        <p className="mt-3 text-sm text-[var(--muted)]">{message}</p>
      ) : null}
      {status?.error ? (
        <p className="mt-2 text-sm text-[#d93025]">
          登录态已过期，请重新连接 GSC。
        </p>
      ) : null}
    </div>
  );
}
