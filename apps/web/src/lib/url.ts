import { z } from "zod";

const rawUrlSchema = z.string().trim().min(1, "请输入网站地址");

export function normalizeSiteUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function parseSiteUrl(input: string): {
  ok: true;
  url: string;
  hostname: string;
} | {
  ok: false;
  error: string;
} {
  const raw = rawUrlSchema.safeParse(input);
  if (!raw.success) {
    return { ok: false, error: raw.error.issues[0]?.message ?? "请输入网站地址" };
  }

  const normalized = normalizeSiteUrl(raw.data);

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return { ok: false, error: "请输入有效的网址" };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { ok: false, error: "请输入有效的网址" };
  }

  if (!parsed.hostname.includes(".")) {
    return { ok: false, error: "请输入有效的网址" };
  }

  return {
    ok: true,
    url: parsed.origin + (parsed.pathname === "/" ? "" : parsed.pathname),
    hostname: parsed.hostname,
  };
}
