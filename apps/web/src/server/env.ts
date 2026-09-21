import { getCloudflareContext } from "@opennextjs/cloudflare";

function trimEnv(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/**
 * Read a server env var. On Cloudflare, secrets may only appear on the Worker
 * binding — fall back to getCloudflareContext when process.env is empty.
 */
export async function getServerEnv(name: string): Promise<string | undefined> {
  const fromProcess = trimEnv(process.env[name]);
  if (fromProcess) return fromProcess;
  try {
    const { env } = await getCloudflareContext({ async: true });
    return trimEnv((env as Record<string, unknown>)[name]);
  } catch {
    return undefined;
  }
}
