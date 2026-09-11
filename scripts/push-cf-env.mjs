#!/usr/bin/env node
/**
 * Push apps/web env files to Cloudflare Worker secrets (bulk).
 *
 * Usage:
 *   node scripts/push-cf-env.mjs
 *   node scripts/push-cf-env.mjs --file apps/web/.env.local
 *   node scripts/push-cf-env.mjs --dry-run
 *
 * Merge order (later wins):
 *   1) apps/web/.env.local
 *   2) .env.cloudflare (repo root, optional production overrides)
 *   3) --file if provided (highest priority single-file mode skips merge)
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const LOCAL_ONLY = new Set([
  "HTTPS_PROXY",
  "HTTP_PROXY",
  "ALL_PROXY",
  "PAGESPEED_HTTP_PROXY",
  "DEV_BYPASS_AUTH",
]);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const fileIdx = args.indexOf("--file");
const singleFile = fileIdx >= 0 ? args[fileIdx + 1] : null;
const urlIdx = args.indexOf("--url");
const nextAuthUrl = urlIdx >= 0 ? args[urlIdx + 1] : null;

function parseEnv(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const cleaned = line.startsWith("export ") ? line.slice(7) : line;
    const eq = cleaned.indexOf("=");
    if (eq <= 0) continue;
    const key = cleaned.slice(0, eq).trim();
    let value = cleaned.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  return parseEnv(readFileSync(filePath, "utf8"));
}

function looksLocal(value) {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(value);
}

function serializeEnv(vars) {
  return Object.entries(vars)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

/** @type {Record<string, string>} */
let merged = {};

if (singleFile) {
  const abs = path.resolve(root, singleFile);
  if (!existsSync(abs)) {
    console.error(`File not found: ${abs}`);
    process.exit(1);
  }
  merged = loadEnvFile(abs);
} else {
  merged = {
    ...loadEnvFile(path.join(root, "apps/web/.env.local")),
    ...loadEnvFile(path.join(root, ".env.cloudflare")),
  };
}

if (nextAuthUrl) {
  merged.NEXTAUTH_URL = nextAuthUrl;
}

/** @type {Record<string, string>} */
const secrets = {};
/** @type {string[]} */
const skipped = [];

for (const [key, value] of Object.entries(merged)) {
  if (!key || value == null || String(value).trim() === "") {
    skipped.push(`${key} (empty)`);
    continue;
  }
  if (LOCAL_ONLY.has(key)) {
    skipped.push(`${key} (local-only)`);
    continue;
  }
  if (
    (key === "DATABASE_URL" || key === "REDIS_URL" || key === "NEXTAUTH_URL") &&
    looksLocal(String(value))
  ) {
    skipped.push(`${key} (localhost — set production value in .env.cloudflare)`);
    continue;
  }
  secrets[key] = String(value);
}

// Auth.js accepts either; keep both when one is present.
if (secrets.NEXTAUTH_SECRET && !secrets.AUTH_SECRET) {
  secrets.AUTH_SECRET = secrets.NEXTAUTH_SECRET;
}
if (secrets.AUTH_SECRET && !secrets.NEXTAUTH_SECRET) {
  secrets.NEXTAUTH_SECRET = secrets.AUTH_SECRET;
}

const keys = Object.keys(secrets).sort();
console.log(`Prepared ${keys.length} secrets for Worker "pagespeed":`);
for (const key of keys) console.log(`  + ${key}`);
if (skipped.length) {
  console.log("\nSkipped:");
  for (const s of skipped) console.log(`  - ${s}`);
}

if (!keys.length) {
  console.error("\nNothing to push. Add values to apps/web/.env.local and/or .env.cloudflare");
  process.exit(1);
}

if (dryRun) {
  console.log("\nDry run only — nothing uploaded.");
  process.exit(0);
}

const dir = mkdtempSync(path.join(tmpdir(), "webagent-cf-env-"));
const secretsFile = path.join(dir, "secrets.env");
try {
  writeFileSync(secretsFile, serializeEnv(secrets), "utf8");
  const wranglerBin = path.join(
    root,
    "node_modules",
    "wrangler",
    "bin",
    "wrangler.js",
  );
  const result = spawnSync(
    process.execPath,
    [wranglerBin, "secret", "bulk", secretsFile, "--config", "wrangler.jsonc"],
    {
      cwd: root,
      stdio: "inherit",
      env: process.env,
    },
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  console.log("\nDone. Runtime secrets are on Cloudflare Worker \"pagespeed\".");
  console.log(
    "Tip: also paste the same keys into Workers Builds → Build variables and secrets if SSG/build needs them.",
  );
  console.log("Redeploy with --keep-vars so dashboard vars are preserved.");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
