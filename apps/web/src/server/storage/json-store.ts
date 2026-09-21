import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { isCloudflareRuntime } from "@/server/runtime";

type KvLike = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
};

async function getKv(): Promise<KvLike | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const ns = env.WEBAGENT_KV;
    if (!ns) return null;
    return ns;
  } catch {
    return null;
  }
}

function filePath(key: string) {
  return path.join(process.cwd(), ".data", `${key}.json`);
}

export async function readJsonStore<T extends object>(
  key: string,
  fallback: T,
): Promise<T> {
  const kv = await getKv();
  if (kv) {
    try {
      const raw = await kv.get(key);
      if (!raw) return { ...fallback };
      return { ...fallback, ...(JSON.parse(raw) as Partial<T>) };
    } catch {
      return { ...fallback };
    }
  }

  try {
    const raw = await readFile(filePath(key), "utf8");
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) };
  } catch {
    return { ...fallback };
  }
}

export async function writeJsonStore<T>(key: string, value: T): Promise<void> {
  const serialized = JSON.stringify(value, null, 2);
  try {
    const kv = await getKv();
    if (kv) {
      await kv.put(key, serialized);
      return;
    }

    if (isCloudflareRuntime()) {
      console.warn(`[json-store] WEBAGENT_KV unbound; skip persist ${key}`);
      return;
    }

    const fp = filePath(key);
    await mkdir(path.dirname(fp), { recursive: true });
    await writeFile(fp, serialized, "utf8");
  } catch (err) {
    console.warn(
      `[json-store] persist failed for ${key}`,
      err instanceof Error ? err.message : err,
    );
  }
}
