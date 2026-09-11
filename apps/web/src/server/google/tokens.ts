import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyProxyDispatcher } from "@/server/http/proxy-bootstrap";
import { proxiedFetch } from "@/server/http/fetch";

export type GoogleTokenBundle = {
  email: string | null;
  refreshToken: string;
  accessToken: string | null;
  expiresAt: number | null; // unix seconds
  scope: string | null;
  updatedAt: string;
};

type TokenStore = {
  /** single-user V1: one Google account */
  google: GoogleTokenBundle | null;
};

const EMPTY: TokenStore = { google: null };

function storePath() {
  return path.join(process.cwd(), ".data", "google-tokens.json");
}

async function readStore(): Promise<TokenStore> {
  try {
    const raw = await readFile(storePath(), "utf8");
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<TokenStore>) };
  } catch {
    return { ...EMPTY };
  }
}

async function writeStore(next: TokenStore): Promise<void> {
  const dir = path.dirname(storePath());
  await mkdir(dir, { recursive: true });
  await writeFile(storePath(), JSON.stringify(next, null, 2), "utf8");
}

export async function saveGoogleTokens(input: {
  email?: string | null;
  refreshToken?: string | null;
  accessToken?: string | null;
  expiresAt?: number | null;
  scope?: string | null;
}): Promise<void> {
  const store = await readStore();
  const prev = store.google;
  const refreshToken = input.refreshToken ?? prev?.refreshToken;
  if (!refreshToken) return;

  store.google = {
    email: input.email ?? prev?.email ?? null,
    refreshToken,
    accessToken: input.accessToken ?? prev?.accessToken ?? null,
    expiresAt: input.expiresAt ?? prev?.expiresAt ?? null,
    scope: input.scope ?? prev?.scope ?? null,
    updatedAt: new Date().toISOString(),
  };
  await writeStore(store);
}

export async function readGoogleTokens(): Promise<GoogleTokenBundle | null> {
  const store = await readStore();
  return store.google;
}

export async function clearGoogleTokens(): Promise<void> {
  await writeStore({ google: null });
}

export async function refreshGoogleAccessToken(refreshToken: string) {
  applyProxyDispatcher();
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const res = await proxiedFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    error?: string;
  };
  if (!res.ok || !data.access_token || !data.expires_in) {
    throw new Error(data.error ?? "Failed to refresh Google token");
  }
  return {
    access_token: data.access_token,
    expires_in: data.expires_in,
    refresh_token: data.refresh_token,
  };
}

/**
 * Prefer live session token; otherwise refresh from persisted refresh_token.
 */
export async function getGoogleAccessToken(opts?: {
  sessionAccessToken?: string | null;
  requireScope?: "gsc" | "ga4" | null;
}): Promise<{
  accessToken: string | null;
  source: "session" | "store" | null;
  scope: string | null;
  email: string | null;
  error?: string;
}> {
  if (opts?.sessionAccessToken) {
    const stored = await readGoogleTokens();
    return {
      accessToken: opts.sessionAccessToken,
      source: "session",
      scope: stored?.scope ?? null,
      email: stored?.email ?? null,
    };
  }

  const stored = await readGoogleTokens();
  if (!stored?.refreshToken) {
    return {
      accessToken: null,
      source: null,
      scope: null,
      email: null,
      error: "no stored google refresh token",
    };
  }

  if (opts?.requireScope === "gsc") {
    const scope = stored.scope ?? "";
    if (scope && !/webmasters|searchconsole/i.test(scope)) {
      return {
        accessToken: null,
        source: "store",
        scope: stored.scope,
        email: stored.email,
        error: "stored token missing GSC scope; reconnect Google",
      };
    }
  }
  if (opts?.requireScope === "ga4") {
    const scope = stored.scope ?? "";
    if (scope && !/analytics/i.test(scope)) {
      return {
        accessToken: null,
        source: "store",
        scope: stored.scope,
        email: stored.email,
        error: "stored token missing GA4 scope; reconnect Google with Analytics",
      };
    }
  }

  const expiresAt = stored.expiresAt ?? 0;
  const stillValid =
    stored.accessToken && Date.now() < expiresAt * 1000 - 60_000;
  if (stillValid && stored.accessToken) {
    return {
      accessToken: stored.accessToken,
      source: "store",
      scope: stored.scope,
      email: stored.email,
    };
  }

  try {
    const refreshed = await refreshGoogleAccessToken(stored.refreshToken);
    await saveGoogleTokens({
      accessToken: refreshed.access_token,
      expiresAt: Math.floor(Date.now() / 1000 + refreshed.expires_in),
      refreshToken: refreshed.refresh_token ?? stored.refreshToken,
      email: stored.email,
      scope: stored.scope,
    });
    return {
      accessToken: refreshed.access_token,
      source: "store",
      scope: stored.scope,
      email: stored.email,
    };
  } catch (err) {
    return {
      accessToken: null,
      source: "store",
      scope: stored.scope,
      email: stored.email,
      error: err instanceof Error ? err.message : "refresh failed",
    };
  }
}

export function hasScope(
  scope: string | null | undefined,
  kind: "gsc" | "ga4",
): boolean {
  if (!scope) return false;
  if (kind === "gsc") return /webmasters|searchconsole/i.test(scope);
  return /analytics\.readonly|analytics\b/i.test(scope);
}
