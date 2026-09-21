import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { isCloudflareRuntime } from "@/server/runtime";

type KvLike = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
};

const CF_CTX = Symbol.for("__cloudflare-context__");

function kvFromGlobal(): KvLike | null {
  const ctx = (
    globalThis as Record<symbol, { env?: { WEBAGENT_KV?: KvLike } }>
  )[CF_CTX];
  return ctx?.env?.WEBAGENT_KV ?? null;
}

function workersLike(): boolean {
  if (isCloudflareRuntime()) return true;
  if (kvFromGlobal()) return true;
  return false;
}

async function getKv(): Promise<KvLike | null> {
  const fromGlobal = kvFromGlobal();
  if (fromGlobal) return fromGlobal;
  try {
    const { env } = await getCloudflareContext({ async: true });
    return env.WEBAGENT_KV ?? kvFromGlobal();
  } catch {
    return kvFromGlobal();
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

  if (workersLike()) return { ...fallback };

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

    if (workersLike()) {
      console.warn(`[json-store] WEBAGENT_KV unbound; skip persist ${key}`);
      return;
    }

    const fp = filePath(key);
    await mkdir(path.dirname(fp), { recursive: true });
    await writeFile(fp, serialized, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/unenv|not implemented/i.test(message)) return;
    console.warn(`[json-store] persist failed for ${key}`, message);
  }
}
