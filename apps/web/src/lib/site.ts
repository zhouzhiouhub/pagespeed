export const SITE_STORAGE_KEY = "webagent:site-url";
export const PSI_CACHE_KEY = "webagent:psi-cache:v1";
export const ONBOARDING_DONE_KEY = "webagent:onboarding-done";

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

export function readOnboardingDone(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(ONBOARDING_DONE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeOnboardingDone(done: boolean) {
  try {
    if (done) localStorage.setItem(ONBOARDING_DONE_KEY, "1");
    else localStorage.removeItem(ONBOARDING_DONE_KEY);
  } catch {
    // ignore
  }
}
