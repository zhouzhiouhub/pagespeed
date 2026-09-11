export const SITE_STORAGE_KEY = "webagent:site-url";
export const PSI_CACHE_KEY = "webagent:psi-cache:v1";

export function readSiteUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(SITE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeSiteUrl(url: string) {
  try {
    if (!url) {
      localStorage.removeItem(SITE_STORAGE_KEY);
      return;
    }
    localStorage.setItem(SITE_STORAGE_KEY, url);
  } catch {
    // ignore
  }
}
