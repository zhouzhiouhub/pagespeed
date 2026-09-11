import { isDbConfigured } from "./index";

let cached: { ok: boolean; checkedAt: number } | null = null;
const TTL_MS = 15_000;

/**
 * Soft-check Postgres. Features must degrade to file/memory when false.
 */
export async function isDatabaseAvailable(): Promise<boolean> {
  if (!isDbConfigured()) return false;
  if (cached && Date.now() - cached.checkedAt < TTL_MS) return cached.ok;

  try {
    const { getClient } = await import("./index");
    const client = getClient();
    const ok = await Promise.race([
      client`select 1 as ok`.then(() => true),
      new Promise<boolean>((_, reject) =>
        setTimeout(() => reject(new Error("db timeout")), 1500),
      ),
    ]);
    cached = { ok: Boolean(ok), checkedAt: Date.now() };
    return cached.ok;
  } catch {
    cached = { ok: false, checkedAt: Date.now() };
    return false;
  }
}

export function resetDbAvailabilityCache() {
  cached = null;
}
